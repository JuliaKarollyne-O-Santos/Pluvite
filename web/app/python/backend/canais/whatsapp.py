"""Canal de alertas por WhatsApp.

Provedores:
  - ``qr``: o chatbot ``chatbot/chatbot.js`` (whatsapp-web.js, sessao por QR)
    expoe ``POST /enviar`` em 127.0.0.1; nao precisa de software extra.
    Recebem os contatos que mandaram "pluvite" e escolheram o municipio
    correspondente (GET /inscritos?municipio=...) mais WHATSAPP_NUMEROS_TESTE;
    os telefones do banco sao ignorados nesse modo.
  - ``evolution``: Evolution API self-hosted.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import httpx

from .. import config

log = logging.getLogger("pluvite.whatsapp")


def normalizar_numero(numero: str) -> str | None:
    """(12) 97407-5279 -> 5512974075279. Devolve None se nao parecer valido."""
    digitos = re.sub(r"\D", "", numero or "")
    if not digitos:
        return None
    if len(digitos) in (10, 11):
        digitos = config.WHATSAPP_DDI_PADRAO + digitos
    if len(digitos) < 12:
        return None
    return digitos


def montar_texto(payload: dict[str, Any]) -> str:
    """Mesma estrutura do pop-up, formatada com o negrito do WhatsApp."""
    aviso_simulacao = (
        "🧪 *SIMULAÇÃO — dados de teste*\n\n"
        if payload.get("origem") == "openweather_mock"
        else ""
    )
    return aviso_simulacao + (
        f"{payload['icone']} *PLUVITE — {payload['rotulo_severidade']}*\n\n"
        f"*{payload['tipo'].upper()}*\n"
        f"📍 Localização: {payload['municipio']}\n"
        f"📌 Endereço/Região: {payload['endereco']}\n"
        f"🚨 Nível de Prioridade: {payload['prioridade']}\n"
        f"🔄 Status Atual: {payload['statusatual']}\n\n"
        f"ℹ️ *Descrição do Ocorrido:*\n{payload['descricao']}\n\n"
        "Mantenha-se em segurança e siga as orientações da Defesa Civil."
    )


async def _enviar_evolution(
    cliente: httpx.AsyncClient, numero: str, payload: dict[str, Any]
) -> dict[str, Any]:
    url = f"{config.EVOLUTION_URL.rstrip('/')}/message/sendText/{config.EVOLUTION_INSTANCIA}"
    resposta = await cliente.post(
        url,
        headers={"apikey": config.EVOLUTION_APIKEY, "Content-Type": "application/json"},
        json={"number": numero, "text": montar_texto(payload)},
    )
    corpo = _json_seguro(resposta)
    if resposta.status_code >= 400:
        log.error("Evolution API recusou %s: %s", numero, corpo)
        return {"numero": numero, "ok": False, "erro": corpo}
    return {"numero": numero, "ok": True, "resposta": corpo}


async def _inscritos_chatbot(
    cliente: httpx.AsyncClient, municipio: str
) -> list[str]:
    """IDs de chat inscritos para receber alertas do municipio informado."""
    resposta = await cliente.get(
        f"{config.CHATBOT_URL.rstrip('/')}/inscritos",
        headers={"X-Pluvite-Token": config.CHATBOT_TOKEN},
        params={"municipio": municipio},
    )
    resposta.raise_for_status()
    return [str(i) for i in resposta.json().get("inscritos", [])]


async def _enviar_qr(
    cliente: httpx.AsyncClient, numero: str, payload: dict[str, Any]
) -> dict[str, Any]:
    # IDs com "@" vem da lista de inscritos; o resto e numero de teste
    chave = "destino" if "@" in numero else "numero"
    resposta = await cliente.post(
        f"{config.CHATBOT_URL.rstrip('/')}/enviar",
        headers={"X-Pluvite-Token": config.CHATBOT_TOKEN},
        json={chave: numero, "texto": montar_texto(payload)},
    )
    corpo = _json_seguro(resposta)
    if resposta.status_code >= 400:
        log.error("Chatbot QR recusou %s: %s", numero, corpo)
        return {"numero": numero, "ok": False, "erro": corpo}
    return {"numero": numero, "ok": True, "resposta": corpo}


def _json_seguro(resposta: httpx.Response) -> Any:
    try:
        return resposta.json()
    except ValueError:
        return resposta.text


async def status_chatbot() -> dict[str, Any]:
    """Consulta GET /status do chatbot QR (para o /api/status do backend)."""
    try:
        async with httpx.AsyncClient(timeout=5) as cliente:
            resposta = await cliente.get(
                f"{config.CHATBOT_URL.rstrip('/')}/status",
                headers={"X-Pluvite-Token": config.CHATBOT_TOKEN},
            )
        if resposta.status_code == 401:
            return {"online": True, "conectado": False, "erro": "CHATBOT_TOKEN diferente"}
        corpo = _json_seguro(resposta)
        return {
            "online": True,
            "conectado": bool(corpo.get("conectado")),
            "inscritos": corpo.get("inscritos", 0),
        }
    except (httpx.HTTPError, AttributeError) as erro:
        return {"online": False, "conectado": False, "erro": str(erro) or "chatbot fora do ar"}


def _configurado() -> tuple[bool, str]:
    if config.WHATSAPP_PROVEDOR == "off":
        return False, "canal desativado (WHATSAPP_PROVEDOR=off)"
    if config.WHATSAPP_PROVEDOR == "evolution":
        if not (config.EVOLUTION_URL and config.EVOLUTION_INSTANCIA):
            return False, "EVOLUTION_URL/EVOLUTION_INSTANCIA ausentes no .env"
        return True, ""
    if config.WHATSAPP_PROVEDOR == "qr":
        return True, ""
    return False, f"provedor desconhecido: {config.WHATSAPP_PROVEDOR}"


async def enviar_alerta_whatsapp(
    payload: dict[str, Any], numeros: list[str]
) -> dict[str, Any]:
    ok, motivo = _configurado()
    if not ok:
        log.warning("WhatsApp nao enviado: %s", motivo)
        return {"canal": "whatsapp", "ok": False, "motivo": motivo, "enviados": 0}

    async with httpx.AsyncClient(timeout=config.TIMEOUT_HTTP) as cliente:
        destinos: list[str] = []
        if config.WHATSAPP_PROVEDOR == "qr":
            # Modo QR: so quem pediu os alertas ao chatbot (telefones do banco ignorados)
            try:
                destinos = await _inscritos_chatbot(cliente, payload["municipio"])
            except (httpx.HTTPError, ValueError) as erro:
                log.error("Nao foi possivel ler os inscritos do chatbot: %s", erro)
                return {
                    "canal": "whatsapp",
                    "ok": False,
                    "motivo": f"chatbot QR indisponivel: {erro}",
                    "enviados": 0,
                }
            base: list[str] = []
        else:
            base = [] if config.WHATSAPP_SOMENTE_TESTE else list(numeros)

        for bruto in base + config.WHATSAPP_NUMEROS_TESTE:
            normalizado = normalizar_numero(bruto)
            if normalizado and normalizado not in destinos:
                destinos.append(normalizado)

        if not destinos:
            motivo = (
                'nenhum inscrito com município escolhido (mande "pluvite" e responda com a cidade)'
                if config.WHATSAPP_PROVEDOR == "qr"
                else "nenhum numero cadastrado"
            )
            return {"canal": "whatsapp", "ok": False, "motivo": motivo, "enviados": 0}

        if config.WHATSAPP_PROVEDOR == "qr":
            # Um por vez: a sessao do WhatsApp Web nao aguenta rajadas
            resultados: list[Any] = []
            for indice, numero in enumerate(destinos):
                if indice:
                    await asyncio.sleep(config.CHATBOT_INTERVALO_SEGUNDOS)
                try:
                    resultados.append(await _enviar_qr(cliente, numero, payload))
                except Exception as erro:  # noqa: BLE001 - registrado abaixo
                    resultados.append(erro)
        else:
            resultados = await asyncio.gather(
                *(_enviar_evolution(cliente, numero, payload) for numero in destinos),
                return_exceptions=True,
            )

    detalhes: list[dict[str, Any]] = []
    for numero, resultado in zip(destinos, resultados):
        if isinstance(resultado, Exception):
            log.error("Erro de rede ao enviar para %s: %s", numero, resultado)
            detalhes.append({"numero": numero, "ok": False, "erro": str(resultado)})
        else:
            detalhes.append(resultado)

    enviados = sum(1 for detalhe in detalhes if detalhe["ok"])
    log.info("WhatsApp: %d/%d mensagens aceitas", enviados, len(destinos))
    return {
        "canal": "whatsapp",
        "ok": enviados > 0,
        "provedor": config.WHATSAPP_PROVEDOR,
        "enviados": enviados,
        "total": len(destinos),
        "detalhes": detalhes,
    }


# TESTE ISOLADO: python -m backend.canais.whatsapp
# Envia um alerta ficticio aos inscritos (modo qr) + WHATSAPP_NUMEROS_TESTE, sem gravar no banco
# nem disparar site/push.
if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    exemplo = {
        "icone": "🧪",
        "rotulo_severidade": "TESTE",
        "tipo": "Teste de alerta",
        "municipio": "Taubaté",
        "endereco": "Mensagem de teste do Pluvite",
        "prioridade": "Zona Segura",
        "statusatual": "Teste",
        "descricao": "Se você recebeu esta mensagem, o canal WhatsApp do Pluvite está funcionando.",
    }
    resultado = asyncio.run(enviar_alerta_whatsapp(exemplo, []))
    print(json.dumps(resultado, ensure_ascii=False, indent=2))

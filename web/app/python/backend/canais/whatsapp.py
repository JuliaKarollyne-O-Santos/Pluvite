"""Canal 2 — alertas por WhatsApp.

Provedor recomendado: **WhatsApp Cloud API (Meta)**.
  - Gratuito para o volume de um projeto municipal: as conversas iniciadas
    pela empresa do tipo "utility/service" nao tem custo no tier inicial e a
    conta de teste ja vem com um numero de telefone gratuito.
  - Oficial, com TLS fim a fim e token revogavel — nada de sessao de celular
    pendurada num servidor.
  - Nao precisa de infraestrutura: e uma chamada HTTPS para graph.facebook.com.

Alternativa self-hosted: **Evolution API** (Baileys). Util quando nao se quer
passar pela aprovacao da Meta. Basta trocar WHATSAPP_PROVEDOR=evolution no .env.

Regra das 24h (Cloud API): mensagens de texto livre so chegam a quem falou com
o numero nas ultimas 24h. Para alertas de emergencia enviados a frio, cadastre
um template aprovado e informe WHATSAPP_TEMPLATE_NOME — o codigo usa o template
automaticamente quando ele esta configurado.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import httpx

from .. import config
from ..alerta import resumo_curto

log = logging.getLogger("pluvite.whatsapp")


def normalizar_numero(numero: str) -> str | None:
    """(12) 97407-5279 -> 5512974075279. Devolve None se nao parecer valido."""
    digitos = re.sub(r"\D", "", numero or "")
    if not digitos:
        return None
    if len(digitos) in (10, 11):  # numero nacional sem DDI
        digitos = config.WHATSAPP_DDI_PADRAO + digitos
    if len(digitos) < 12:
        return None
    return digitos


def montar_texto(payload: dict[str, Any]) -> str:
    """Mesma estrutura do pop-up, formatada com o negrito do WhatsApp."""
    return (
        f"{payload['icone']} *PLUVITE — {payload['rotulo_severidade']}*\n\n"
        f"*{payload['tipo'].upper()}*\n"
        f"📍 Localização: {payload['municipio']}\n"
        f"📌 Endereço/Região: {payload['endereco']}\n"
        f"🚨 Nível de Prioridade: {payload['prioridade']}\n"
        f"🔄 Status Atual: {payload['statusatual']}\n\n"
        f"ℹ️ *Descrição do Ocorrido:*\n{payload['descricao']}\n\n"
        "Mantenha-se em segurança e siga as orientações da Defesa Civil."
    )


# ── WhatsApp Cloud API (Meta) ───────────────────────────────────────────────

def _corpo_cloud(numero: str, payload: dict[str, Any]) -> dict[str, Any]:
    if config.WHATSAPP_TEMPLATE_NOME:
        # Template aprovado: 3 variaveis -> {{1}} tipo, {{2}} municipio, {{3}} descricao
        return {
            "messaging_product": "whatsapp",
            "to": numero,
            "type": "template",
            "template": {
                "name": config.WHATSAPP_TEMPLATE_NOME,
                "language": {"code": config.WHATSAPP_TEMPLATE_IDIOMA},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": payload["tipo"]},
                            {"type": "text", "text": payload["municipio"]},
                            {"type": "text", "text": resumo_curto(payload, 500)},
                        ],
                    }
                ],
            },
        }
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": numero,
        "type": "text",
        "text": {"preview_url": False, "body": montar_texto(payload)},
    }


async def _enviar_cloud(
    cliente: httpx.AsyncClient, numero: str, payload: dict[str, Any]
) -> dict[str, Any]:
    url = (
        f"https://graph.facebook.com/{config.WHATSAPP_API_VERSAO}/"
        f"{config.WHATSAPP_PHONE_NUMBER_ID}/messages"
    )
    resposta = await cliente.post(
        url,
        headers={
            "Authorization": f"Bearer {config.WHATSAPP_TOKEN}",
            "Content-Type": "application/json",
        },
        json=_corpo_cloud(numero, payload),
    )
    corpo = _json_seguro(resposta)
    if resposta.status_code >= 400:
        log.error("WhatsApp Cloud recusou %s: %s", numero, corpo)
        return {"numero": numero, "ok": False, "erro": corpo}
    return {"numero": numero, "ok": True, "resposta": corpo}


# ── Evolution API (Baileys, self-hosted) ────────────────────────────────────

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


def _json_seguro(resposta: httpx.Response) -> Any:
    try:
        return resposta.json()
    except ValueError:
        return resposta.text


# ── Interface usada pelo despachante central ────────────────────────────────

def _configurado() -> tuple[bool, str]:
    if config.WHATSAPP_PROVEDOR == "off":
        return False, "canal desativado (WHATSAPP_PROVEDOR=off)"
    if config.WHATSAPP_PROVEDOR == "cloud":
        if not (config.WHATSAPP_TOKEN and config.WHATSAPP_PHONE_NUMBER_ID):
            return False, "WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID ausentes no .env"
        return True, ""
    if config.WHATSAPP_PROVEDOR == "evolution":
        if not (config.EVOLUTION_URL and config.EVOLUTION_INSTANCIA):
            return False, "EVOLUTION_URL/EVOLUTION_INSTANCIA ausentes no .env"
        return True, ""
    return False, f"provedor desconhecido: {config.WHATSAPP_PROVEDOR}"


async def enviar_alerta_whatsapp(
    payload: dict[str, Any], numeros: list[str]
) -> dict[str, Any]:
    ok, motivo = _configurado()
    if not ok:
        log.warning("WhatsApp nao enviado: %s", motivo)
        return {"canal": "whatsapp", "ok": False, "motivo": motivo, "enviados": 0}

    destinos: list[str] = []
    for bruto in list(numeros) + config.WHATSAPP_NUMEROS_TESTE:
        normalizado = normalizar_numero(bruto)
        if normalizado and normalizado not in destinos:
            destinos.append(normalizado)

    if not destinos:
        return {
            "canal": "whatsapp",
            "ok": False,
            "motivo": "nenhum numero cadastrado",
            "enviados": 0,
        }

    envio = _enviar_cloud if config.WHATSAPP_PROVEDOR == "cloud" else _enviar_evolution

    async with httpx.AsyncClient(timeout=config.TIMEOUT_HTTP) as cliente:
        resultados = await asyncio.gather(
            *(envio(cliente, numero, payload) for numero in destinos),
            return_exceptions=True,
        )

    detalhes: list[dict[str, Any]] = []
    for numero, resultado in zip(destinos, resultados):
        if isinstance(resultado, Exception):
            log.error("Erro de rede ao enviar para %s: %s", numero, resultado)
            detalhes.append({"numero": numero, "ok": False, "erro": str(resultado)})
        else:
            detalhes.append(resultado)

    enviados = sum(1 for d in detalhes if d["ok"])
    log.info("WhatsApp: %d/%d mensagens aceitas", enviados, len(destinos))
    return {
        "canal": "whatsapp",
        "ok": enviados > 0,
        "provedor": config.WHATSAPP_PROVEDOR,
        "enviados": enviados,
        "total": len(destinos),
        "detalhes": detalhes,
    }

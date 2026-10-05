"""Canal de alertas por WhatsApp via Evolution API.

O chatbot conectado por QR em ``chatbot/chatbot.js`` e independente e ainda
nao esta integrado ao despachante de alertas.
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


def _configurado() -> tuple[bool, str]:
    if config.WHATSAPP_PROVEDOR == "off":
        return False, "canal desativado (WHATSAPP_PROVEDOR=off)"
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

    async with httpx.AsyncClient(timeout=config.TIMEOUT_HTTP) as cliente:
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

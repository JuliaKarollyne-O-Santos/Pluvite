"""Canal 3 — push notification no app mobile.

O app e Expo (SDK 54), entao o envio passa pelo Expo Push Service, que por
baixo entrega via **FCM** no Android e **APNs** no iOS — o aparelho toca e
acende a tela normalmente, como notificacao nativa.

Prioridade "max" + canal Android dedicado (`alertas-emergencia`) garantem o
comportamento de alerta critico.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .. import config
from ..alerta import resumo_curto

log = logging.getLogger("pluvite.push")

# O Expo aceita no maximo 100 mensagens por requisicao
TAMANHO_LOTE = 100


def montar_mensagens(payload: dict[str, Any], tokens: list[str]) -> list[dict[str, Any]]:
    titulo = f"{payload['icone']} {payload['tipo'].upper()} — {payload['municipio']}"
    return [
        {
            "to": token,
            "title": titulo,
            "body": resumo_curto(payload),
            "sound": "default",
            "priority": "high",
            "channelId": config.PUSH_CANAL_ANDROID,
            "interruptionLevel": "critical" if payload["prioridade"] == "CRITICA" else "active",
            "ttl": 3600,
            # O app usa `data` para abrir o modal da tela inicial com o alerta completo
            "data": {"tipo_evento": "alerta_emergencia", "alerta": payload},
        }
        for token in tokens
    ]


def _lotes(itens: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    return [itens[i : i + TAMANHO_LOTE] for i in range(0, len(itens), TAMANHO_LOTE)]


async def enviar_alerta_push(payload: dict[str, Any], tokens: list[str]) -> dict[str, Any]:
    if not config.PUSH_ATIVO:
        return {"canal": "push", "ok": False, "motivo": "canal desativado", "enviados": 0}

    destinos: list[str] = []
    for token in list(tokens) + config.PUSH_TOKENS_TESTE:
        if token and token not in destinos:
            destinos.append(token)

    if not destinos:
        return {
            "canal": "push",
            "ok": False,
            "motivo": "nenhum dispositivo registrado",
            "enviados": 0,
        }

    cabecalhos = {"Content-Type": "application/json", "Accept": "application/json"}
    if config.EXPO_ACCESS_TOKEN:
        cabecalhos["Authorization"] = f"Bearer {config.EXPO_ACCESS_TOKEN}"

    aceitos = 0
    recusados: list[Any] = []

    async with httpx.AsyncClient(timeout=config.TIMEOUT_HTTP) as cliente:
        for lote in _lotes(montar_mensagens(payload, destinos)):
            try:
                resposta = await cliente.post(
                    config.EXPO_PUSH_URL, headers=cabecalhos, json=lote
                )
                corpo = resposta.json()
            except Exception as erro:
                log.error("Erro ao falar com o Expo Push: %s", erro)
                recusados.append(str(erro))
                continue

            for item in corpo.get("data", []) or []:
                if item.get("status") == "ok":
                    aceitos += 1
                else:
                    log.warning("Push recusado pelo Expo: %s", item)
                    recusados.append(item)

    log.info("Push: %d/%d notificacoes aceitas", aceitos, len(destinos))
    return {
        "canal": "push",
        "ok": aceitos > 0,
        "enviados": aceitos,
        "total": len(destinos),
        "recusados": recusados,
    }

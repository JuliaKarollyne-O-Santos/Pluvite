"""Canal de notificacoes push nativas para Android via Firebase Cloud Messaging."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import timedelta
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import credentials, messaging

from .. import config
from ..alerta import resumo_curto

log = logging.getLogger("pluvite.push")

TAMANHO_LOTE = 500
CANAL_ALERTAS = "alertas-emergencia"


def _aplicativo_firebase() -> firebase_admin.App:
    try:
        return firebase_admin.get_app()
    except ValueError:
        arquivo = config.FCM_SERVICE_ACCOUNT_FILE
        if not arquivo:
            raise RuntimeError("FCM_SERVICE_ACCOUNT_FILE nao configurado no .env")
        caminho = Path(arquivo)
        if not caminho.is_absolute():
            caminho = config.RAIZ_PYTHON / caminho
        if not caminho.is_file():
            raise FileNotFoundError(f"Credencial Firebase nao encontrada: {caminho}")
        return firebase_admin.initialize_app(credentials.Certificate(str(caminho)))


def _enviar_lote(
    payload: dict[str, Any], tokens: list[str]
) -> messaging.BatchResponse:
    titulo = f"{payload['icone']} {payload['tipo'].upper()} — {payload['municipio']}"
    mensagem = messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(
            title=titulo,
            body=resumo_curto(payload),
        ),
        data={
            "tipo_evento": "alerta_emergencia",
            "alerta": json.dumps(payload, ensure_ascii=False),
        },
        android=messaging.AndroidConfig(
            priority="high",
            ttl=timedelta(hours=1),
            notification=messaging.AndroidNotification(
                channel_id=CANAL_ALERTAS,
                color="#B91C1C",
            ),
        ),
    )
    return messaging.send_each_for_multicast(
        mensagem,
        app=_aplicativo_firebase(),
    )


def _lotes(tokens: list[str]) -> list[list[str]]:
    return [
        tokens[indice : indice + TAMANHO_LOTE]
        for indice in range(0, len(tokens), TAMANHO_LOTE)
    ]


async def enviar_alerta_push(
    payload: dict[str, Any], tokens: list[str]
) -> dict[str, Any]:
    if not config.PUSH_ATIVO:
        return {"canal": "push", "ok": False, "motivo": "canal desativado", "enviados": 0}

    destinos = list(
        dict.fromkeys(
            token for token in [*tokens, *config.PUSH_TOKENS_TESTE] if token
        )
    )
    if not destinos:
        return {
            "canal": "push",
            "ok": False,
            "motivo": "nenhum dispositivo registrado",
            "enviados": 0,
        }

    aceitos = 0
    recusados: list[str] = []
    try:
        for lote in _lotes(destinos):
            resposta = await asyncio.to_thread(_enviar_lote, payload, lote)
            for resultado in resposta.responses:
                if resultado.success:
                    aceitos += 1
                else:
                    erro = str(resultado.exception or "erro desconhecido do FCM")
                    log.warning("FCM recusou notificacao: %s", erro)
                    recusados.append(erro)
    except Exception as erro:
        log.exception("Falha ao enviar notificacoes pelo Firebase Cloud Messaging.")
        return {
            "canal": "push",
            "ok": False,
            "motivo": str(erro),
            "enviados": aceitos,
            "total": len(destinos),
            "recusados": recusados,
        }

    log.info("FCM: %d/%d notificacoes aceitas", aceitos, len(destinos))
    return {
        "canal": "push",
        "ok": aceitos > 0,
        "provedor": "fcm",
        "enviados": aceitos,
        "total": len(destinos),
        "recusados": recusados,
    }

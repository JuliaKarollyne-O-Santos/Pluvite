"""Ponto central de disparo de alertas do Pluvite.

Todo alerta — venha do monitor automatico do OpenWeather ou do gatilho manual
do painel — passa por `disparar_alerta()`. A funcao:

  1. monta o payload unico (mesmo formato do pop-up original);
  2. grava em `alertas_tempo_real` no Supabase;
  3. dispara os 3 canais **em paralelo** com `asyncio.gather`:
        WebSocket (site)  +  WhatsApp  +  Push (app mobile)

A falha de um canal nunca derruba os outros: cada resultado volta no relatorio.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from . import supabase_client
from .alerta import montar_payload, para_registro_banco
from .canais.push_mobile import enviar_alerta_push
from .canais.websocket_hub import enviar_alerta_web
from .canais.whatsapp import enviar_alerta_whatsapp

log = logging.getLogger("pluvite.dispatcher")

# Ultimo alerta disparado — serve para o site/app que abrem depois do evento
_ultimo_payload: dict[str, Any] | None = None


def ultimo_payload() -> dict[str, Any] | None:
    return _ultimo_payload


async def disparar_alerta(
    dados: dict[str, Any], origem: str = "manual"
) -> dict[str, Any]:
    """Executa o fluxo completo de um alerta e devolve o relatorio de entrega."""
    global _ultimo_payload

    payload = montar_payload(dados, origem=origem)
    log.info(">> Disparando alerta [%s] %s", origem, payload["titulo"])

    # 1. Persistencia (nao bloqueia o disparo se falhar)
    registro = await supabase_client.salvar_alerta(para_registro_banco(payload))
    if registro:
        payload["id"] = str(registro.get("id", payload["id"]))
        payload["criado_em"] = registro.get("criado_em", payload["criado_em"])
    else:
        payload["criado_em"] = payload.get("criado_em") or datetime.now(
            timezone.utc
        ).isoformat()

    _ultimo_payload = payload

    # 2. Destinatarios dos canais externos
    telefones, tokens = await asyncio.gather(
        supabase_client.telefones_cadastrados(payload["municipio"]),
        supabase_client.push_tokens(payload["municipio"]),
    )

    # 3. Os 3 canais, simultaneamente
    resultados = await asyncio.gather(
        enviar_alerta_web(payload),
        enviar_alerta_whatsapp(payload, telefones),
        enviar_alerta_push(payload, tokens),
        return_exceptions=True,
    )

    nomes = ("web", "whatsapp", "push")
    canais: dict[str, Any] = {}
    for nome, resultado in zip(nomes, resultados):
        if isinstance(resultado, Exception):
            log.exception("Canal %s falhou: %s", nome, resultado)
            canais[nome] = {"canal": nome, "ok": False, "erro": str(resultado)}
        else:
            canais[nome] = resultado

    relatorio = {
        "ok": any(c.get("ok") for c in canais.values()),
        "persistido": registro is not None,
        "alerta": payload,
        "canais": canais,
    }
    log.info(
        "Alerta %s despachado — web:%s whatsapp:%s push:%s",
        payload["id"],
        canais["web"].get("entregues", 0),
        canais["whatsapp"].get("enviados", 0),
        canais["push"].get("enviados", 0),
    )
    return relatorio

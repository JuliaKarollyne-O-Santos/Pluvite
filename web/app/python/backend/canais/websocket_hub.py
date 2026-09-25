"""Canal 1 — pop-up no site.

Mantem as conexoes WebSocket abertas pelos navegadores e faz o broadcast
do alerta em tempo real, sem recarregar a pagina.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

log = logging.getLogger("pluvite.websocket")


class HubWebSocket:
    def __init__(self) -> None:
        self._conexoes: set[WebSocket] = set()
        self._trava = asyncio.Lock()

    async def conectar(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._trava:
            self._conexoes.add(ws)
        log.info("Navegador conectado (total: %d)", len(self._conexoes))

    async def desconectar(self, ws: WebSocket) -> None:
        async with self._trava:
            self._conexoes.discard(ws)
        log.info("Navegador desconectado (total: %d)", len(self._conexoes))

    @property
    def total(self) -> int:
        return len(self._conexoes)

    async def enviar_para(self, ws: WebSocket, evento: str, dados: Any) -> None:
        await ws.send_json({"evento": evento, "dados": dados})

    async def broadcast(self, evento: str, dados: Any) -> int:
        """Envia o evento para todos os navegadores conectados.

        Devolve quantos receberam. Conexoes mortas sao descartadas.
        """
        async with self._trava:
            alvos = list(self._conexoes)

        if not alvos:
            log.info("Nenhum navegador conectado para receber '%s'", evento)
            return 0

        mensagem = {"evento": evento, "dados": dados}
        resultados = await asyncio.gather(
            *(ws.send_json(mensagem) for ws in alvos), return_exceptions=True
        )

        mortos = [ws for ws, r in zip(alvos, resultados) if isinstance(r, Exception)]
        if mortos:
            async with self._trava:
                for ws in mortos:
                    self._conexoes.discard(ws)

        entregues = len(alvos) - len(mortos)
        log.info("Broadcast '%s' entregue a %d navegador(es)", evento, entregues)
        return entregues


hub = HubWebSocket()


async def enviar_alerta_web(payload: dict[str, Any]) -> dict[str, Any]:
    """Interface usada pelo despachante central."""
    entregues = await hub.broadcast("alerta_emergencia", payload)
    return {"canal": "web", "ok": True, "entregues": entregues, "conectados": hub.total}

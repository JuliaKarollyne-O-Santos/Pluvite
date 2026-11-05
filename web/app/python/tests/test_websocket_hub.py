import unittest
from unittest.mock import AsyncMock, PropertyMock, patch

from backend.canais.websocket_hub import HubWebSocket, enviar_alerta_web


class EnviarAlertaWebTests(unittest.IsolatedAsyncioTestCase):
    async def test_nao_informa_sucesso_quando_nao_ha_navegadores(self):
        with (
            patch(
                "backend.canais.websocket_hub.hub.broadcast",
                new=AsyncMock(return_value=0),
            ),
            patch.object(HubWebSocket, "total", new_callable=PropertyMock, return_value=0),
        ):
            resultado = await enviar_alerta_web({"id": "alerta-1"})

        self.assertFalse(resultado["ok"])
        self.assertEqual(resultado["entregues"], 0)

    async def test_broadcast_entrega_somente_ao_municipio_do_alerta(self):
        hub = HubWebSocket()
        taubate = AsyncMock()
        ubatuba = AsyncMock()
        hub._conexoes = {taubate: "Taubaté", ubatuba: "Ubatuba"}

        entregues = await hub.broadcast(
            "alerta_emergencia",
            {"municipio": "TAUBATE"},
            "Taubaté",
        )

        self.assertEqual(entregues, 1)
        taubate.send_json.assert_awaited_once()
        ubatuba.send_json.assert_not_awaited()

    async def test_sem_inscritos_no_municipio_nao_entrega_alerta(self):
        hub = HubWebSocket()
        navegador = AsyncMock()
        hub._conexoes = {navegador: "Ubatuba"}

        entregues = await hub.broadcast(
            "alerta_emergencia",
            {"municipio": "Taubaté"},
            "Taubaté",
        )

        self.assertEqual(entregues, 0)
        navegador.send_json.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()

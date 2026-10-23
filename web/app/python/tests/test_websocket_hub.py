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


if __name__ == "__main__":
    unittest.main()

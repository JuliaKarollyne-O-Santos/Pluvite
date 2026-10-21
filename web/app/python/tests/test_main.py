import unittest
from unittest.mock import AsyncMock, patch

from backend.main import ultimo_alerta_openweather


class UltimoAlertaOpenWeatherTests(unittest.IsolatedAsyncioTestCase):
    async def test_retorna_alerta_real_em_memoria(self):
        alerta = {"origem": "openweather", "tipo": "Tempestade"}
        with patch("backend.main.ultimo_payload_openweather", return_value=alerta):
            resultado = await ultimo_alerta_openweather()

        self.assertEqual(resultado, {"alerta": alerta})

    async def test_busca_alerta_real_persistido_quando_memoria_esta_vazia(self):
        registro = {"tipo": "Tempestade", "origem": "openweather"}
        with (
            patch("backend.main.ultimo_payload_openweather", return_value=None),
            patch(
                "backend.main.supabase_client.ultimo_alerta_openweather",
                new=AsyncMock(return_value=registro),
            ),
        ):
            resultado = await ultimo_alerta_openweather()

        self.assertEqual(resultado["alerta"]["origem"], "openweather")
        self.assertEqual(resultado["alerta"]["tipo"], "Tempestade")

    async def test_retorna_nulo_quando_nao_ha_alerta_real(self):
        with (
            patch("backend.main.ultimo_payload_openweather", return_value=None),
            patch(
                "backend.main.supabase_client.ultimo_alerta_openweather",
                new=AsyncMock(return_value=None),
            ),
        ):
            resultado = await ultimo_alerta_openweather()

        self.assertIsNone(resultado["alerta"])


if __name__ == "__main__":
    unittest.main()

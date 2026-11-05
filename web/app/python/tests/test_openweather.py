import os
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from backend import config
from backend.openweather import _carregar_mock, avaliar_emergencia, verificar_cidade


class CarregarMockTests(unittest.TestCase):
    def test_caminho_relativo_funciona_fora_da_raiz_python(self):
        diretorio_original = Path.cwd()
        try:
            os.chdir(config.RAIZ_PYTHON.parent.parent)
            with patch.object(
                config, "MOCK_OPENWEATHER_ARQUIVO", "mocks/openweather_tempestade.json"
            ):
                dados = _carregar_mock()
        finally:
            os.chdir(diretorio_original)

        self.assertEqual(dados["weather"][0]["id"], 212)
        self.assertEqual(avaliar_emergencia(dados)["prioridade"], "CRITICA")


class OrigemAlertaTests(unittest.IsolatedAsyncioTestCase):
    async def test_alerta_de_mock_nao_e_classificado_como_openweather_real(self):
        dados = {
            "weather": [{"id": 212, "description": "tempestade"}],
            "wind": {},
            "rain": {},
            "main": {},
            "coord": {"lat": 1, "lon": 2},
        }
        for mock_ativo, origem_esperada in (
            (True, "openweather_mock"),
            (False, "openweather"),
        ):
            with self.subTest(mock_ativo=mock_ativo):
                disparar = AsyncMock(return_value={"alerta": {"titulo": "teste"}})
                with (
                    patch.object(config, "MOCK_OPENWEATHER", mock_ativo),
                    patch(
                        "backend.openweather.consultar_tempo",
                        new=AsyncMock(return_value=dados),
                    ),
                    patch(
                        "backend.openweather.consultar_alertas_oficiais",
                        new=AsyncMock(return_value=[]),
                    ),
                    patch("backend.openweather._coordenadas_municipio", return_value=(1, 2)),
                    patch("backend.openweather._em_cooldown", return_value=False),
                    patch("backend.openweather._marcar_disparo"),
                    patch("backend.openweather.disparar_alerta", new=disparar),
                ):
                    await verificar_cidade(AsyncMock(), "Taubaté")

                self.assertEqual(disparar.await_args.kwargs["origem"], origem_esperada)


if __name__ == "__main__":
    unittest.main()
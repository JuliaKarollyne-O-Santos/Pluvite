import os
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import config
from backend.openweather import _carregar_mock, avaliar_emergencia


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


if __name__ == "__main__":
    unittest.main()
import unittest

from backend.supabase_client import _filtrar_por_municipio


class FiltrarPorMunicipioTests(unittest.TestCase):
    def test_ignora_diferenca_de_acentos_e_maiusculas(self):
        linhas = [
            {"telefone": "contato-1", "cidade": "Taubaté"},
            {"telefone": "contato-2", "cidade": "São José dos Campos"},
        ]

        resultado = _filtrar_por_municipio(linhas, "TAUBATE", "cidade")

        self.assertEqual([linha["telefone"] for linha in resultado], ["contato-1"])

    def test_nao_envia_para_outro_municipio_quando_nao_ha_correspondencia(self):
        linhas = [{"push_token": "token-1", "municipio": "Taubaté"}]

        resultado = _filtrar_por_municipio(linhas, "Ubatuba", "municipio")

        self.assertEqual(resultado, [])

    def test_usa_fallback_global_se_todos_estao_sem_municipio(self):
        linhas = [{"telefone": "contato-1", "cidade": None}]

        resultado = _filtrar_por_municipio(linhas, "Ubatuba", "cidade")

        self.assertEqual(resultado, linhas)

    def test_sem_municipio_no_alerta_retorna_todos(self):
        linhas = [{"push_token": "token-1", "municipio": "Taubaté"}]

        resultado = _filtrar_por_municipio(linhas, None, "municipio")

        self.assertEqual(resultado, linhas)


if __name__ == "__main__":
    unittest.main()
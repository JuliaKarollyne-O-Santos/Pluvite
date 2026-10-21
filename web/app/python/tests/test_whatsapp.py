import unittest

from backend.canais.whatsapp import montar_texto


class MontarTextoWhatsAppTests(unittest.TestCase):
    def test_identifica_alerta_simulado(self):
        payload = {
            "origem": "openweather_mock",
            "icone": "🧪",
            "rotulo_severidade": "TESTE",
            "tipo": "Tempestade",
            "municipio": "Taubaté",
            "endereco": "Região monitorada",
            "prioridade": "CRITICA",
            "statusatual": "Ativo",
            "descricao": "Condição de teste.",
        }

        texto = montar_texto(payload)

        self.assertIn("SIMULAÇÃO — dados de teste", texto)

    def test_alerta_real_nao_recebe_rotulo_de_simulacao(self):
        payload = {
            "origem": "openweather",
            "icone": "🚨",
            "rotulo_severidade": "ALERTA",
            "tipo": "Tempestade",
            "municipio": "Taubaté",
            "endereco": "Região monitorada",
            "prioridade": "CRITICA",
            "statusatual": "Ativo",
            "descricao": "Condição real.",
        }

        texto = montar_texto(payload)

        self.assertNotIn("SIMULAÇÃO", texto)


if __name__ == "__main__":
    unittest.main()

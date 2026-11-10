import unittest
from unittest.mock import patch

from backend.canais.whatsapp import enviar_alerta_whatsapp, montar_texto


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


class WhatsAppConsultaLocalTests(unittest.IsolatedAsyncioTestCase):
    async def test_confirma_fila_quando_alerta_esta_persistido(self):
        with patch("backend.canais.whatsapp.config.WHATSAPP_PROVEDOR", "qr-poll"):
            resultado = await enviar_alerta_whatsapp({}, [], persistido=True)

        self.assertTrue(resultado["ok"])
        self.assertTrue(resultado["enfileirado"])

    async def test_nao_enfileira_alerta_sem_persistencia(self):
        with patch("backend.canais.whatsapp.config.WHATSAPP_PROVEDOR", "qr-poll"):
            resultado = await enviar_alerta_whatsapp({}, [], persistido=False)

        self.assertFalse(resultado["ok"])
        self.assertIn("não foi salvo", resultado["motivo"])


if __name__ == "__main__":
    unittest.main()

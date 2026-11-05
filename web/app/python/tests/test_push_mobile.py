import json
import unittest
from unittest.mock import patch

from backend.canais.push_mobile import _enviar_lote


class EnviarPushNativoTests(unittest.TestCase):
    def test_monta_mensagem_fcm_com_payload_e_canal_android(self):
        payload = {
            "id": "alerta-1",
            "icone": "🚨",
            "tipo": "Enchente",
            "municipio": "Taubaté",
            "prioridade": "CRITICA",
            "descricao": "Rio transbordando.",
        }
        resposta = object()

        with (
            patch("backend.canais.push_mobile._aplicativo_firebase", return_value="app"),
            patch(
                "backend.canais.push_mobile.messaging.send_each_for_multicast",
                return_value=resposta,
            ) as enviar,
        ):
            resultado = _enviar_lote(payload, ["token-fcm"])

        self.assertIs(resultado, resposta)
        mensagem = enviar.call_args.args[0]
        self.assertEqual(mensagem.tokens, ["token-fcm"])
        self.assertEqual(mensagem.android.priority, "high")
        self.assertEqual(
            mensagem.android.notification.channel_id,
            "alertas-emergencia",
        )
        self.assertEqual(
            json.loads(mensagem.data["alerta"])["id"],
            "alerta-1",
        )
        self.assertEqual(enviar.call_args.kwargs["app"], "app")


if __name__ == "__main__":
    unittest.main()

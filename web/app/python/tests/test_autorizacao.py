import os
import unittest
from unittest.mock import AsyncMock, patch

# Sem monitor automatico durante os testes (ele consultaria o OpenWeather e poderia disparar alertas)
os.environ["MONITOR_ATIVO"] = "false"

from fastapi.testclient import TestClient  # noqa: E402

from backend import config, main  # noqa: E402

RELATORIO_FALSO = {"ok": True, "persistido": False, "alerta": {}, "canais": {}}
ALERTA = {
    "tipo": "Enchente",
    "prioridade": "CRITICA",
    "municipio": "taubate",
    "descricao": "Rio transbordou, evacuar as margens.",
}


class DisparoManualTests(unittest.TestCase):
    """Quem pode disparar alertas pelo /api/alertas/disparar. Nada e enviado de verdade:
    o disparo e o Supabase sao substituidos por mocks."""

    def setUp(self):
        self.disparar = AsyncMock(return_value=RELATORIO_FALSO)
        self.usuario = AsyncMock(return_value={"id": "usuario-1"})
        self.papel = AsyncMock(return_value=None)
        self.patches = [
            patch.object(main, "disparar_alerta", self.disparar),
            patch.object(main.supabase_client, "usuario_do_token", self.usuario),
            patch.object(main.supabase_client, "papel_da_conta", self.papel),
            patch.object(config, "ADMIN_TOKEN", ""),
        ]
        for p in self.patches:
            p.start()
        self.cliente = TestClient(main.app)

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def enviar(self, corpo=None, cabecalhos=None):
        return self.cliente.post(
            "/api/alertas/disparar", json=corpo or ALERTA, headers=cabecalhos or {}
        )

    def test_sem_login_responde_401_e_nao_dispara(self):
        resposta = self.enviar()
        self.assertEqual(resposta.status_code, 401)
        self.disparar.assert_not_called()

    def test_sessao_invalida_responde_401(self):
        self.usuario.return_value = None
        resposta = self.enviar(cabecalhos={"Authorization": "Bearer token-vencido"})
        self.assertEqual(resposta.status_code, 401)
        self.disparar.assert_not_called()

    def test_conta_sem_papel_responde_403(self):
        resposta = self.enviar(cabecalhos={"Authorization": "Bearer token-cidadao"})
        self.assertEqual(resposta.status_code, 403)
        self.disparar.assert_not_called()

    def test_falha_ao_consultar_perfil_responde_503(self):
        self.papel.side_effect = RuntimeError("falha de consulta")
        resposta = self.enviar(cabecalhos={"Authorization": "Bearer token-teste"})
        self.assertEqual(resposta.status_code, 503)
        self.disparar.assert_not_called()

    def test_servidor_dispara_para_o_proprio_municipio_com_nome_oficial(self):
        self.papel.return_value = {"papel": "servidor", "municipio": "Taubaté"}
        resposta = self.enviar(cabecalhos={"Authorization": "Bearer token-servidor"})
        self.assertEqual(resposta.status_code, 200)
        self.papel.assert_awaited_once()
        self.assertEqual(self.papel.await_args.args[1], self.usuario.await_args.args[0])
        dados, = self.disparar.call_args.args
        self.assertEqual(dados["municipio"], "Taubaté")
        self.assertEqual(self.disparar.call_args.kwargs["origem"], "manual")

    def test_servidor_nao_dispara_para_outro_municipio(self):
        self.papel.return_value = {"papel": "servidor", "municipio": "Caçapava"}
        resposta = self.enviar(cabecalhos={"Authorization": "Bearer token-servidor"})
        self.assertEqual(resposta.status_code, 403)
        self.disparar.assert_not_called()

    def test_admin_dispara_para_qualquer_municipio(self):
        self.papel.return_value = {"papel": "admin", "municipio": None}
        corpo = ALERTA | {"municipio": "São José dos Campos"}
        resposta = self.enviar(corpo, {"Authorization": "Bearer token-admin"})
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(self.disparar.call_args.args[0]["municipio"], "São José dos Campos")

    def test_municipio_fora_dos_39_responde_400(self):
        self.papel.return_value = {"papel": "admin", "municipio": None}
        corpo = ALERTA | {"municipio": "Campinas"}
        resposta = self.enviar(corpo, {"Authorization": "Bearer token-admin"})
        self.assertEqual(resposta.status_code, 400)
        self.disparar.assert_not_called()

    def test_admin_token_vale_para_scripts_e_token_errado_nao(self):
        with patch.object(config, "ADMIN_TOKEN", "segredo-de-teste"):
            certo = self.enviar(cabecalhos={"X-Pluvite-Token": "segredo-de-teste"})
            errado = self.enviar(cabecalhos={"X-Pluvite-Token": "outro"})
        self.assertEqual(certo.status_code, 200)
        self.assertEqual(errado.status_code, 401)
        self.assertEqual(self.disparar.call_count, 1)

    def test_forcar_monitor_so_para_a_equipe(self):
        executar = AsyncMock(return_value=[])
        with patch.object(main.openweather, "executar_ciclo", executar):
            self.papel.return_value = {"papel": "servidor", "municipio": "Taubaté"}
            servidor = self.cliente.post(
                "/api/monitor/verificar-agora", headers={"Authorization": "Bearer token-servidor"}
            )
            self.papel.return_value = {"papel": "admin", "municipio": None}
            admin = self.cliente.post(
                "/api/monitor/verificar-agora", headers={"Authorization": "Bearer token-admin"}
            )
        self.assertEqual(servidor.status_code, 403)
        self.assertEqual(admin.status_code, 200)
        executar.assert_called_once()


if __name__ == "__main__":
    unittest.main()

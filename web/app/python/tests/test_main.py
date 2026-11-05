import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from backend.dispatcher import disparar_alerta
from backend.main import (
    AlertaManual,
    Responsavel,
    disparar_manual,
    simular_alerta_manual,
    ultimo_alerta,
    ultimo_alerta_openweather,
)


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


class UltimoAlertaMunicipalTests(unittest.IsolatedAsyncioTestCase):
    async def test_retorna_alerta_em_memoria_apenas_para_o_mesmo_municipio(self):
        alerta = {"id": "alerta-1", "municipio": "Taubaté"}
        with (
            patch("backend.main.ultimo_payload", return_value=alerta),
            patch("backend.main.supabase_client.ultimo_alerta") as buscar_banco,
        ):
            resultado = await ultimo_alerta("TAUBATE")

        self.assertEqual(resultado["alerta"], alerta)
        buscar_banco.assert_not_awaited()

    async def test_nao_retorna_alerta_de_outro_municipio_em_memoria(self):
        registro = {
            "id": "alerta-2",
            "tipo": "Enchente",
            "prioridade": "Alerta Máximo",
            "municipio": "Ubatuba",
            "origem": "manual",
        }
        with (
            patch(
                "backend.main.ultimo_payload",
                return_value={"id": "alerta-1", "municipio": "Taubaté"},
            ),
            patch(
                "backend.main.supabase_client.ultimo_alerta",
                new=AsyncMock(return_value=registro),
            ) as buscar_banco,
        ):
            resultado = await ultimo_alerta("Ubatuba")

        buscar_banco.assert_awaited_once_with("Ubatuba")
        self.assertEqual(resultado["alerta"]["municipio"], "Ubatuba")

    async def test_rejeita_municipio_invalido(self):
        with self.assertRaises(HTTPException) as contexto:
            await ultimo_alerta("Campinas")

        self.assertEqual(contexto.exception.status_code, 400)


class DisparoManualTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.servidor = Responsavel("servidor", "Taubaté")
        self.alerta = AlertaManual(
            tipo="Tempestade",
            prioridade="Alerta Máximo",
            municipio="Taubaté",
            endereco="Centro",
            descricao="Risco imediato de alagamento.",
        )

    async def test_simulacao_nao_emite_popup_publico_nem_persiste(self):
        with patch(
            "backend.main.hub.broadcast", new=AsyncMock(return_value=1)
        ) as broadcast:
            resultado = await simular_alerta_manual(self.alerta, self.servidor)

        broadcast.assert_not_awaited()
        self.assertEqual(resultado["alerta"]["origem"], "simulacao")
        self.assertIn("SIMULAÇÃO", resultado["alerta"]["titulo"])
        self.assertTrue(resultado["simulacao"])
        self.assertFalse(resultado["persistido"])
        self.assertEqual(resultado["canais"]["web"]["entregues"], 0)

    async def test_bloqueia_alerta_para_outro_municipio(self):
        with patch("backend.main.disparar_alerta", new=AsyncMock()) as disparar:
            with self.assertRaises(HTTPException) as contexto:
                await disparar_manual(self.alerta.model_copy(update={"municipio": "Ubatuba"}), self.servidor)

        self.assertEqual(contexto.exception.status_code, 403)
        disparar.assert_not_awaited()

    async def test_bloqueia_simulacao_para_outro_municipio(self):
        with patch("backend.main.hub.broadcast", new=AsyncMock()) as broadcast:
            with self.assertRaises(HTTPException) as contexto:
                await simular_alerta_manual(
                    self.alerta.model_copy(update={"municipio": "Ubatuba"}),
                    self.servidor,
                )

        self.assertEqual(contexto.exception.status_code, 403)
        broadcast.assert_not_awaited()

    async def test_mock_openweather_nao_persiste_nem_aciona_canais(self):
        with (
            patch(
                "backend.dispatcher.supabase_client.salvar_alerta",
                new=AsyncMock(),
            ) as salvar,
            patch(
                "backend.dispatcher.enviar_alerta_web",
                new=AsyncMock(),
            ) as web,
            patch(
                "backend.dispatcher.enviar_alerta_whatsapp",
                new=AsyncMock(),
            ) as whatsapp,
            patch(
                "backend.dispatcher.enviar_alerta_push",
                new=AsyncMock(),
            ) as push,
        ):
            resultado = await disparar_alerta(
                self.alerta.model_dump(),
                origem="openweather_mock",
            )

        salvar.assert_not_awaited()
        web.assert_not_awaited()
        whatsapp.assert_not_awaited()
        push.assert_not_awaited()
        self.assertTrue(resultado["simulacao"])
        self.assertFalse(resultado["persistido"])
        self.assertIn("SIMULAÇÃO", resultado["alerta"]["titulo"])


if __name__ == "__main__":
    unittest.main()

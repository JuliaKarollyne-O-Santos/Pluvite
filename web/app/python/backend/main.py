"""API de alertas do Pluvite (FastAPI).

Rotas:
    GET  /api/status                  -> saude do servico e canais configurados
    WS   /ws/alertas                  -> pop-up do site em tempo real
    POST /api/alertas/disparar        -> gatilho MANUAL (painel do servidor; exige login de
                                         servidor ou admin, ou ADMIN_TOKEN em scripts)
    GET  /api/alertas/ultimo          -> ultimo alerta (site/app que abrem depois)
    GET  /api/alertas/ultimo-openweather -> ultimo alerta real do monitor
    POST /api/monitor/verificar-agora -> forca um ciclo do monitor OpenWeather
    POST /api/dispositivos            -> app mobile registra seu token de push

Execute com:
    cd web/app/python
    uvicorn backend.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config, openweather, supabase_client
from .alerta import montar_payload
from .canais.websocket_hub import hub
from .canais.whatsapp import status_chatbot
from .dispatcher import disparar_alerta, ultimo_payload, ultimo_payload_openweather

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pluvite.api")


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    tarefa: asyncio.Task | None = None
    if config.MONITOR_ATIVO:
        tarefa = asyncio.create_task(openweather.laco_monitor())
    else:
        log.warning("MONITOR_ATIVO=false - somente disparo manual.")
    try:
        yield
    finally:
        if tarefa:
            tarefa.cancel()
            try:
                await tarefa
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="Pluvite - Central de Alertas",
    description="Ponto unico de disparo: pop-up no site, WhatsApp e push no app.",
    version="2.0.0",
    lifespan=ciclo_de_vida,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGENS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -- Quem pode disparar alertas ----------------------------------------------
# Contas de servidor (prefeitura) e da equipe (admin), pelo token de sessao do Supabase que o
# site envia em "Authorization: Bearer <access_token>". Servidor so dispara para o proprio
# municipio. ADMIN_TOKEN (header X-Pluvite-Token) vale so para scripts e testes com curl:
# nunca coloque esse valor no site (variavel NEXT_PUBLIC_ fica visivel no navegador).

# -- Autenticacao do monitoramento -------------------------------------------

@dataclass(frozen=True)
class Responsavel:
    papel: str
    municipio: str | None = None


async def exigir_responsavel(
    authorization: str | None = Header(default=None),
    x_pluvite_token: str | None = Header(default=None),
) -> Responsavel:
    if (
        config.ADMIN_TOKEN
        and x_pluvite_token
        and secrets.compare_digest(x_pluvite_token, config.ADMIN_TOKEN)
    ):
        return Responsavel(papel="token")

    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Entre com uma conta de servidor ou da equipe Pluvite para disparar alertas.",
        )
    usuario = await supabase_client.usuario_do_token(token)
    if not usuario:
        raise HTTPException(status_code=401, detail="Sessao invalida ou expirada. Entre de novo.")
    conta = await supabase_client.papel_da_conta(usuario["id"])
    if not conta:
        raise HTTPException(status_code=403, detail="Esta conta nao pode disparar alertas.")
    return Responsavel(papel=conta["papel"], municipio=conta["municipio"])


async def exigir_equipe(
    authorization: str | None = Header(default=None),
    x_pluvite_token: str | None = Header(default=None),
) -> Responsavel:
    responsavel = await exigir_responsavel(authorization, x_pluvite_token)
    if responsavel.papel == "servidor":
        raise HTTPException(status_code=403, detail="Somente a equipe Pluvite pode forcar o monitor.")
    return responsavel


def municipio_oficial(nome: str) -> str | None:
    alvo = supabase_client._normalizar_municipio(nome)
    return next(
        (
            municipio
            for municipio in config.MUNICIPIOS
            if supabase_client._normalizar_municipio(municipio) == alvo
        ),
        None,
    )


def _credencial_fcm_disponivel() -> bool:
    if not config.PUSH_ATIVO or not config.FCM_SERVICE_ACCOUNT_FILE:
        return False
    caminho = Path(config.FCM_SERVICE_ACCOUNT_FILE)
    if not caminho.is_absolute():
        caminho = config.RAIZ_PYTHON / caminho
    try:
        credencial = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    campos_obrigatorios = ("type", "project_id", "private_key", "client_email")
    return isinstance(credencial, dict) and all(
        credencial.get(campo) for campo in campos_obrigatorios
    )


# -- Schemas -----------------------------------------------------------------

class AlertaManual(BaseModel):
    tipo: Literal[
        "Acidente",
        "Alagamento",
        "Árvore caída",
        "Buraco na via",
        "Chuva forte",
        "Chuva torrencial",
        "Deslizamento de terra",
        "Enchente",
        "Tempestade",
        "Vendaval",
        "Via interditada",
        "Outros",
    ]
    prioridade: Literal[
        "Zona Segura",
        "Atenção Crítica",
        "Estado de Alerta",
        "Alerta Máximo",
        "BAIXA",
        "MEDIA",
        "ALTA",
        "CRITICA",
    ]
    municipio: str = Field(..., min_length=2)
    endereco: str = Field(default="Toda a area do municipio", max_length=200)
    descricao: str = Field(..., min_length=5, max_length=2000)
    statusatual: str = Field(default="Ativo")


class RegistroDispositivo(BaseModel):
    push_token: str = Field(..., min_length=10)
    plataforma: str = Field(default="android")
    auth_id: str | None = None
    municipio: str | None = None


# -- Rotas -------------------------------------------------------------------

@app.get("/api/status")
async def status() -> dict[str, Any]:
    whatsapp = (
        await status_chatbot() if config.WHATSAPP_PROVEDOR == "qr" else None
    )
    if config.WHATSAPP_PROVEDOR == "qr":
        whatsapp_configurado = bool(whatsapp and whatsapp.get("online") and whatsapp.get("conectado"))
        whatsapp_motivo = None if whatsapp_configurado else "Chatbot offline ou WhatsApp desconectado."
    elif config.WHATSAPP_PROVEDOR == "evolution":
        whatsapp_configurado = bool(
            config.EVOLUTION_URL and config.EVOLUTION_INSTANCIA and config.EVOLUTION_APIKEY
        )
        whatsapp_motivo = (
            "Configurada; a conexão não é consultada."
            if whatsapp_configurado
            else "Evolution API sem configuração completa."
        )
    else:
        whatsapp_configurado = False
        whatsapp_motivo = "Canal WhatsApp desativado."

    push_configurado = _credencial_fcm_disponivel()

    return {
        "servico": "pluvite-alertas",
        "navegadores_conectados": hub.total,
        "monitor_ativo": config.MONITOR_ATIVO,
        "monitor_mock": config.MOCK_OPENWEATHER,
        "cidades_monitoradas": config.MONITOR_CIDADES,
        "whatsapp_provedor": config.WHATSAPP_PROVEDOR,
        "whatsapp_somente_teste": config.WHATSAPP_SOMENTE_TESTE,
        "whatsapp_chatbot": whatsapp,
        "whatsapp_configurado": whatsapp_configurado,
        "whatsapp_motivo": whatsapp_motivo,
        "push_ativo": config.PUSH_ATIVO,
        "push_configurado": push_configurado,
        "push_motivo": None if push_configurado else (
            "Canal desativado." if not config.PUSH_ATIVO
            else "Credencial de serviço Firebase ausente, inválida ou não encontrada."
        ),
        "ultimo_alerta": ultimo_payload(),
    }


@app.websocket("/ws/alertas")
async def websocket_alertas(websocket: WebSocket) -> None:
    """Canal do pop-up: o navegador abre e fica escutando."""
    await hub.conectar(websocket)
    try:
        # Quem acabou de abrir o site ja recebe o ultimo alerta ativo, se houver
        pendente = ultimo_payload()
        if pendente:
            await hub.enviar_para(websocket, "alerta_emergencia", pendente)
        else:
            await hub.enviar_para(websocket, "conectado", {"mensagem": "Monitoramento ativo"})

        while True:
            # Mantem a conexao viva; o cliente manda "ping" periodicamente
            await websocket.receive_text()
            await websocket.send_json({"evento": "pong", "dados": None})
    except WebSocketDisconnect:
        await hub.desconectar(websocket)
    except Exception as erro:
        log.debug("WebSocket encerrado: %s", erro)
        await hub.desconectar(websocket)


@app.post("/api/alertas/disparar")
async def disparar_manual(
    alerta: AlertaManual,
    responsavel: Responsavel = Depends(exigir_responsavel),
) -> dict[str, Any]:
    """Dispara alerta real para servidor no proprio municipio ou admin."""
    municipio = municipio_oficial(alerta.municipio)
    if not municipio:
        raise HTTPException(status_code=400, detail="Municipio invalido.")
    if responsavel.papel == "servidor" and municipio != municipio_oficial(
        responsavel.municipio or ""
    ):
        raise HTTPException(
            status_code=403,
            detail="O servidor só pode emitir alertas para o próprio município.",
        )
    return await disparar_alerta(
        alerta.model_dump() | {"municipio": municipio},
        origem="manual",
    )


@app.post("/api/alertas/simular")
async def simular_alerta_manual(
    alerta: AlertaManual,
    responsavel: Responsavel = Depends(exigir_responsavel),
) -> dict[str, Any]:
    """Exibe um popup de teste sem persistencia ou notificacao externa."""
    municipio = municipio_oficial(alerta.municipio)
    if not municipio:
        raise HTTPException(status_code=400, detail="Municipio invalido.")
    if responsavel.papel == "servidor" and municipio != municipio_oficial(
        responsavel.municipio or ""
    ):
        raise HTTPException(
            status_code=403,
            detail="O servidor só pode simular alertas para o próprio município.",
        )
    payload = montar_payload(alerta.model_dump() | {"municipio": municipio}, origem="simulacao")
    payload["titulo"] = f"[SIMULAÇÃO] {payload['titulo']}"
    payload["mensagem"] = f"SIMULAÇÃO — NÃO É UM ALERTA REAL\n\n{payload['mensagem']}"
    return {
        "ok": True,
        "simulacao": True,
        "persistido": False,
        "alerta": payload,
        "canais": {
            "web": {
                "ok": False,
                "entregues": 0,
                "conectados": hub.total,
                "motivo": "Prévia local; nenhum outro navegador foi notificado.",
            },
            "whatsapp": {"ok": False, "enviados": 0, "motivo": "Simulação: canal não acionado."},
            "push": {"ok": False, "enviados": 0, "motivo": "Simulação: canal não acionado."},
        },
    }


@app.get("/api/alertas/historico")
async def historico_alertas(
    limite: int = Query(default=30, ge=1, le=100),
    municipio_solicitado: str | None = Query(default=None, alias="municipio"),
    responsavel: Responsavel = Depends(exigir_responsavel),
) -> dict[str, Any]:
    """Historico restrito ao municipio do servidor ou ao municipio escolhido pelo admin."""
    if responsavel.papel == "servidor":
        municipio = municipio_oficial(responsavel.municipio or "")
    else:
        municipio = municipio_oficial(municipio_solicitado or "")
        if not municipio:
            raise HTTPException(status_code=400, detail="Informe um município válido.")
    try:
        alertas = await supabase_client.historico_alertas(municipio, limite)
    except Exception as erro:
        log.exception("Falha ao consultar historico de alertas.")
        raise HTTPException(
            status_code=503,
            detail="Não foi possível carregar o histórico de alertas.",
        ) from erro
    return {"alertas": alertas}


@app.get("/api/alertas/ultimo")
async def ultimo_alerta() -> dict[str, Any]:
    """Ultimo alerta conhecido - memoria do processo ou, se vazio, Supabase."""
    payload = ultimo_payload()
    if payload:
        return {"alerta": payload}

    registro = await supabase_client.ultimo_alerta()
    if not registro:
        return {"alerta": None}
    return {"alerta": montar_payload(registro, origem="banco")}


@app.get("/api/alertas/ultimo-openweather")
async def ultimo_alerta_openweather() -> dict[str, Any]:
    """Ultimo alerta do monitoramento real, excluindo disparos manuais e mocks."""
    payload = ultimo_payload_openweather()
    if payload:
        return {"alerta": payload}

    try:
        registro = await supabase_client.ultimo_alerta_openweather()
    except Exception as erro:
        log.error("Falha ao buscar ultimo alerta real do OpenWeather: %s", erro)
        raise HTTPException(
            status_code=503,
            detail="Nao foi possivel consultar o historico de alertas OpenWeather.",
        ) from erro
    if not registro:
        return {"alerta": None}
    return {"alerta": montar_payload(registro, origem="openweather")}


@app.post("/api/monitor/verificar-agora", dependencies=[Depends(exigir_equipe)])
async def verificar_agora(forcar: bool = False) -> dict[str, Any]:
    """Roda um ciclo do monitor na hora (util para homologacao).

    `forcar=true` limpa o cooldown antes, permitindo repetir o mesmo alerta.
    """
    if forcar:
        openweather.limpar_cooldown()
    resultados = await openweather.executar_ciclo()
    return {"ok": True, "resultados": resultados}


@app.post("/api/dispositivos")
async def registrar_dispositivo(dispositivo: RegistroDispositivo) -> dict[str, Any]:
    """O app mobile chama isso no primeiro acesso com o token de push."""
    dados = dispositivo.model_dump()
    dados["ativo"] = True
    registro = await supabase_client.registrar_dispositivo(dados)
    return {"ok": registro is not None, "dispositivo": registro}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host=config.API_HOST, port=config.API_PORT, reload=True)

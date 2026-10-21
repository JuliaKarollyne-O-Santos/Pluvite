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
import logging
import secrets
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
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

@dataclass(frozen=True)
class Responsavel:
    papel: str  # "admin" | "servidor" | "token"
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


async def exigir_equipe(responsavel: Responsavel = Depends(exigir_responsavel)) -> Responsavel:
    if responsavel.papel == "servidor":
        raise HTTPException(status_code=403, detail="Somente a equipe Pluvite pode forcar o monitor.")
    return responsavel


def municipio_oficial(nome: str) -> str | None:
    """Nome oficial (com acento) de um dos 39 municipios, aceitando "Taubate" ou "TAUBATÉ"."""
    alvo = supabase_client._normalizar_municipio(nome)
    return next(
        (m for m in config.MUNICIPIOS if supabase_client._normalizar_municipio(m) == alvo), None
    )


# -- Schemas -----------------------------------------------------------------

class AlertaManual(BaseModel):
    tipo: str = Field(..., min_length=2, examples=["Enchente"])
    prioridade: str = Field(default="MEDIA", examples=["CRITICA"])
    municipio: str = Field(..., min_length=2, examples=["Taubate"])
    endereco: str = Field(default="Toda a area do municipio")
    descricao: str = Field(..., min_length=5)
    statusatual: str = Field(default="Ativo")


class RegistroDispositivo(BaseModel):
    push_token: str = Field(..., min_length=10)
    plataforma: str = Field(default="android")
    auth_id: str | None = None
    municipio: str | None = None


# -- Rotas -------------------------------------------------------------------

@app.get("/api/status")
async def status() -> dict[str, Any]:
    return {
        "servico": "pluvite-alertas",
        "navegadores_conectados": hub.total,
        "monitor_ativo": config.MONITOR_ATIVO,
        "monitor_mock": config.MOCK_OPENWEATHER,
        "cidades_monitoradas": config.MONITOR_CIDADES,
        "whatsapp_provedor": config.WHATSAPP_PROVEDOR,
        "whatsapp_somente_teste": config.WHATSAPP_SOMENTE_TESTE,
        "whatsapp_chatbot": (
            await status_chatbot() if config.WHATSAPP_PROVEDOR == "qr" else None
        ),
        "push_ativo": config.PUSH_ATIVO,
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
    alerta: AlertaManual, responsavel: Responsavel = Depends(exigir_responsavel)
) -> dict[str, Any]:
    """GATILHO MANUAL - usado pelo painel do servidor no site (/Servidor)."""
    municipio = municipio_oficial(alerta.municipio)
    if not municipio:
        raise HTTPException(
            status_code=400,
            detail="Municipio fora da lista dos 39 do Vale do Paraiba e Litoral Norte.",
        )
    if responsavel.papel == "servidor" and municipio != municipio_oficial(
        responsavel.municipio or ""
    ):
        raise HTTPException(
            status_code=403,
            detail=f"Contas de servidor so disparam alertas para o proprio municipio ({responsavel.municipio}).",
        )
    log.info("Disparo manual por conta '%s' para %s", responsavel.papel, municipio)
    return await disparar_alerta(alerta.model_dump() | {"municipio": municipio}, origem="manual")


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

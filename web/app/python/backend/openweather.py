"""Rotina automatica que vigia o OpenWeather e gera alertas de emergencia.

Duas fontes de emergencia, nessa ordem:

  1. **One Call 3.0 / campo `alerts`** - alertas oficiais emitidos pelos orgaos
     meteorologicos. So responde se a chave tiver assinatura do One Call; se
     voltar 401/403 a rotina simplesmente ignora e segue para a fonte 2.
  2. **Weather 2.5 + regra de severidade** - classifica o `weather[0].id`
     (mesma logica de codigos que o script de teste antigo usava) somada a
     vento e volume de chuva.

Antirruido: o mesmo par (cidade, tipo) nao e redisparado dentro de
MONITOR_COOLDOWN_SEGUNDOS.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any

import httpx

from . import config
from .dispatcher import disparar_alerta

log = logging.getLogger("pluvite.openweather")

URL_TEMPO = "https://api.openweathermap.org/data/2.5/weather"
URL_ONECALL = "https://api.openweathermap.org/data/3.0/onecall"

# id do OpenWeather -> (tipo do alerta, prioridade)
FAIXAS_CRITICAS: list[tuple[range, str, str]] = [
    (range(200, 233), "Tempestade", "ALTA"),          # trovoadas
    (range(502, 512), "Chuva Forte", "ALTA"),         # chuva pesada/muito pesada
    (range(520, 532), "Chuva Torrencial", "ALTA"),    # pancadas intensas
    (range(601, 623), "Nevasca", "ALTA"),
    (range(751, 762), "Tempestade de Areia", "MEDIA"),
    (range(762, 772), "Condicao Extrema", "ALTA"),    # cinzas, rajadas, tempestade tropical
    (range(781, 782), "Tornado", "CRITICA"),
    (range(900, 907), "Evento Climatico Extremo", "CRITICA"),
]

# Codigos que, por si so, ja caracterizam emergencia de nivel maximo
IDS_CRITICOS = {212, 221, 232, 504, 511, 531, 781, 900, 901, 902, 906}

LIMITE_VENTO_MS = 17.0      # ~61 km/h - vendaval
LIMITE_CHUVA_1H_MM = 30.0   # chuva muito intensa na ultima hora

# (cidade, tipo) -> timestamp do ultimo disparo
_ultimos_disparos: dict[tuple[str, str], float] = {}


# -- Coleta ------------------------------------------------------------------

def _carregar_mock() -> dict[str, Any]:
    caminho = Path(config.MOCK_OPENWEATHER_ARQUIVO)
    log.warning("MOCK_OPENWEATHER ativo - lendo %s", caminho)
    return json.loads(caminho.read_text(encoding="utf-8"))


async def consultar_tempo(cliente: httpx.AsyncClient, cidade: str) -> dict[str, Any] | None:
    if config.MOCK_OPENWEATHER:
        return _carregar_mock()
    try:
        resposta = await cliente.get(
            URL_TEMPO,
            params={
                "q": cidade,
                "appid": config.OPENWEATHER_KEY,
                "units": "metric",
                "lang": "pt_br",
            },
        )
        if resposta.status_code >= 400:
            log.error(
                "OpenWeather %s respondeu %s: %s", cidade, resposta.status_code, resposta.text
            )
            return None
        return resposta.json()
    except Exception as erro:
        log.error("Falha ao consultar OpenWeather para %s: %s", cidade, erro)
        return None


async def consultar_alertas_oficiais(
    cliente: httpx.AsyncClient, lat: float, lon: float
) -> list[dict[str, Any]]:
    """Alertas governamentais do One Call 3.0 (silencioso se a chave nao tiver acesso)."""
    if config.MOCK_OPENWEATHER:
        return []
    try:
        resposta = await cliente.get(
            URL_ONECALL,
            params={
                "lat": lat,
                "lon": lon,
                "exclude": "minutely,hourly,daily,current",
                "appid": config.OPENWEATHER_KEY,
                "lang": "pt_br",
            },
        )
        if resposta.status_code in (401, 403):
            return []  # chave sem assinatura do One Call - normal no plano gratuito
        if resposta.status_code >= 400:
            log.debug("One Call respondeu %s", resposta.status_code)
            return []
        return resposta.json().get("alerts", []) or []
    except Exception as erro:
        log.debug("One Call indisponivel: %s", erro)
        return []


# -- Classificacao -----------------------------------------------------------

def avaliar_emergencia(dados: dict[str, Any]) -> dict[str, Any] | None:
    """Devolve os campos do alerta se o tempo estiver perigoso, senao None."""
    try:
        clima = (dados.get("weather") or [{}])[0]
        codigo = int(clima.get("id", 800))
        descricao = str(clima.get("description", "condicao nao informada"))
    except (TypeError, ValueError, IndexError):
        return None

    cidade = dados.get("name") or "Regiao monitorada"
    vento = float((dados.get("wind") or {}).get("speed") or 0)
    chuva_1h = float((dados.get("rain") or {}).get("1h") or 0)

    tipo: str | None = None
    prioridade = "MEDIA"

    for faixa, nome, nivel in FAIXAS_CRITICAS:
        if codigo in faixa:
            tipo, prioridade = nome, nivel
            break

    if tipo is None:
        if vento >= LIMITE_VENTO_MS:
            tipo, prioridade = "Vendaval", "ALTA"
        elif chuva_1h >= LIMITE_CHUVA_1H_MM:
            tipo, prioridade = "Chuva Forte", "ALTA"
        else:
            return None  # tempo normal

    if codigo in IDS_CRITICOS or vento >= 25 or chuva_1h >= 50:
        prioridade = "CRITICA"

    temperatura = (dados.get("main") or {}).get("temp")
    partes = [f"Condicao detectada: {descricao}."]
    if temperatura is not None:
        partes.append(f"Temperatura de {float(temperatura):.1f}°C.")
    if vento:
        partes.append(f"Ventos de {vento * 3.6:.0f} km/h.")
    if chuva_1h:
        partes.append(f"Acumulado de {chuva_1h:.1f} mm na ultima hora.")
    partes.append(
        "Evite areas de risco de alagamento e deslizamento e acompanhe as "
        "orientacoes da Defesa Civil (199)."
    )

    return {
        "tipo": tipo,
        "prioridade": prioridade,
        "municipio": cidade,
        "endereco": "Toda a area do municipio",
        "descricao": " ".join(partes),
        "statusatual": "Ativo",
    }


def converter_alerta_oficial(alerta: dict[str, Any], cidade: str) -> dict[str, Any]:
    evento = str(alerta.get("event") or "Alerta Meteorologico")
    descricao = str(alerta.get("description") or "").strip() or "Alerta emitido pelo orgao oficial."
    tags = [str(t).lower() for t in (alerta.get("tags") or [])]
    prioridade = "CRITICA" if any(t in tags for t in ("tornado", "hurricane", "flood")) else "ALTA"
    return {
        "tipo": evento,
        "prioridade": prioridade,
        "municipio": cidade,
        "endereco": str(alerta.get("sender_name") or "Toda a area do municipio"),
        "descricao": descricao[:900],
        "statusatual": "Ativo",
    }


# -- Ciclo do monitor --------------------------------------------------------

def _em_cooldown(cidade: str, tipo: str) -> bool:
    chave = (cidade.lower(), tipo.lower())
    ultimo = _ultimos_disparos.get(chave)
    if ultimo is None:
        return False
    return (time.monotonic() - ultimo) < config.MONITOR_COOLDOWN_SEGUNDOS


def _marcar_disparo(cidade: str, tipo: str) -> None:
    _ultimos_disparos[(cidade.lower(), tipo.lower())] = time.monotonic()


def limpar_cooldown() -> None:
    """Usado nos testes para permitir o redisparo imediato do mesmo alerta."""
    _ultimos_disparos.clear()


async def verificar_cidade(cliente: httpx.AsyncClient, cidade: str) -> dict[str, Any]:
    dados = await consultar_tempo(cliente, cidade)
    if not dados:
        return {"cidade": cidade, "consultado": False}

    coord = dados.get("coord") or {}
    candidatos: list[dict[str, Any]] = []

    if coord.get("lat") is not None and coord.get("lon") is not None:
        oficiais = await consultar_alertas_oficiais(cliente, coord["lat"], coord["lon"])
        candidatos += [
            converter_alerta_oficial(a, dados.get("name") or cidade) for a in oficiais
        ]

    if not candidatos:
        avaliado = avaliar_emergencia(dados)
        if avaliado:
            candidatos.append(avaliado)

    if not candidatos:
        clima = (dados.get("weather") or [{}])[0]
        log.info("%s: condicoes normais (%s)", cidade, clima.get("description"))
        return {"cidade": cidade, "consultado": True, "emergencia": False}

    disparados = []
    for candidato in candidatos:
        if _em_cooldown(candidato["municipio"], candidato["tipo"]):
            log.info("%s: %s ainda em cooldown, nao redisparado", cidade, candidato["tipo"])
            continue
        _marcar_disparo(candidato["municipio"], candidato["tipo"])
        relatorio = await disparar_alerta(candidato, origem="openweather")
        disparados.append(relatorio["alerta"]["titulo"])

    return {
        "cidade": cidade,
        "consultado": True,
        "emergencia": True,
        "disparados": disparados,
    }


async def executar_ciclo() -> list[dict[str, Any]]:
    """Uma varredura em todas as cidades monitoradas."""
    if not config.OPENWEATHER_KEY and not config.MOCK_OPENWEATHER:
        log.warning("OPENWEATHER_KEY ausente - monitor automatico sem efeito.")
        return []

    async with httpx.AsyncClient(timeout=config.TIMEOUT_HTTP) as cliente:
        return [
            await verificar_cidade(cliente, cidade) for cidade in config.MONITOR_CIDADES
        ]


async def laco_monitor() -> None:
    """Task de background iniciada junto com o servidor."""
    log.info(
        "Monitor OpenWeather ativo - cidades: %s | intervalo: %ss",
        ", ".join(config.MONITOR_CIDADES),
        config.MONITOR_INTERVALO_SEGUNDOS,
    )
    while True:
        try:
            await executar_ciclo()
        except asyncio.CancelledError:
            log.info("Monitor OpenWeather encerrado.")
            raise
        except Exception as erro:
            log.exception("Erro no ciclo do monitor: %s", erro)
        await asyncio.sleep(config.MONITOR_INTERVALO_SEGUNDOS)

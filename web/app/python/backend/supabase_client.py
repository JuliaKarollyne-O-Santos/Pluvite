"""Acesso ao Supabase usado pelo backend de alertas.

As funcoes sincronas do SDK do Supabase sao executadas em thread separada
(`asyncio.to_thread`) para nao travar o event loop do FastAPI.
"""

from __future__ import annotations

import asyncio
import logging
import unicodedata
from typing import Any

from supabase import Client, create_client

from . import config

log = logging.getLogger("pluvite.supabase")

_cliente: Client | None = None


def _normalizar_municipio(valor: Any) -> str:
    texto = unicodedata.normalize("NFD", str(valor or "").strip().casefold())
    return "".join(caractere for caractere in texto if unicodedata.category(caractere) != "Mn")


def _filtrar_por_municipio(
    linhas: list[dict[str, Any]], municipio: str | None, campo: str
) -> list[dict[str, Any]]:
    alvo = _normalizar_municipio(municipio)
    if not alvo:
        return []
    return [
        linha
        for linha in linhas
        if _normalizar_municipio(linha.get(campo)) == alvo
    ]


def _historico_alertas_sync(municipio: str, limite: int) -> list[dict[str, Any]]:
    sb = cliente()
    if sb is None:
        raise RuntimeError("Supabase nao configurado para consultar o historico.")
    resposta = (
        sb.table("alertas_tempo_real")
        .select(
            "id,tipo,prioridade,municipio,endereco,descricao,statusatual,origem,criado_em"
        )
        .eq("municipio", municipio)
        .order("criado_em", desc=True)
        .limit(limite)
        .execute()
    )
    return resposta.data or []


async def historico_alertas(municipio: str, limite: int = 30) -> list[dict[str, Any]]:
    """Historico recente de alertas restrito ao municipio do servidor."""
    return await asyncio.to_thread(_historico_alertas_sync, municipio, limite)


def cliente() -> Client | None:
    """Cliente singleton. Devolve None se as credenciais nao estiverem no .env."""
    global _cliente
    if _cliente is None:
        if not config.SUPABASE_URL or not config.SUPABASE_KEY:
            log.warning("SUPABASE_URL/SUPABASE_KEY ausentes - rodando sem persistencia.")
            return None
        _cliente = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)
    return _cliente


# ── Alertas ─────────────────────────────────────────────────────────────────

def _salvar_alerta_sync(registro: dict[str, Any]) -> dict[str, Any] | None:
    sb = cliente()
    if sb is None:
        return None
    resposta = sb.table("alertas_tempo_real").insert(registro).execute()
    return resposta.data[0] if resposta.data else None


async def salvar_alerta(registro: dict[str, Any]) -> dict[str, Any] | None:
    """Grava o alerta em `alertas_tempo_real` e devolve a linha criada."""
    try:
        return await asyncio.to_thread(_salvar_alerta_sync, registro)
    except Exception as erro:  # nao impede o disparo nos canais
        log.error("Falha ao gravar alerta no Supabase: %s", erro)
        return None


def _ultimo_alerta_sync() -> dict[str, Any] | None:
    sb = cliente()
    if sb is None:
        return None
    resposta = (
        sb.table("alertas_tempo_real")
        .select("*")
        .order("criado_em", desc=True)
        .limit(1)
        .execute()
    )
    return resposta.data[0] if resposta.data else None


async def ultimo_alerta() -> dict[str, Any] | None:
    """Alerta mais recente — mesma consulta que o `popups.py` original fazia."""
    try:
        return await asyncio.to_thread(_ultimo_alerta_sync)
    except Exception as erro:
        log.error("Falha ao buscar ultimo alerta: %s", erro)
        return None


def _ultimo_alerta_openweather_sync() -> dict[str, Any] | None:
    sb = cliente()
    if sb is None:
        return None
    resposta = (
        sb.table("alertas_tempo_real")
        .select("*")
        .eq("origem", "openweather")
        .order("criado_em", desc=True)
        .limit(1)
        .execute()
    )
    return resposta.data[0] if resposta.data else None


async def ultimo_alerta_openweather() -> dict[str, Any] | None:
    """Busca o alerta mais recente emitido pelo monitoramento real."""
    return await asyncio.to_thread(_ultimo_alerta_openweather_sync)


# ── Destinatarios ───────────────────────────────────────────────────────────

def _telefones_sync(municipio: str | None) -> list[str]:
    sb = cliente()
    if sb is None:
        return []
    consulta = (
        sb.table("cidadao")
        .select("telefone,municipio_alertas")
        .not_.is_("telefone", "null")
        .not_.is_("municipio_alertas", "null")
    )
    resposta = consulta.execute()
    linhas = resposta.data or []
    linhas = _filtrar_por_municipio(linhas, municipio, "municipio_alertas")
    return [str(l["telefone"]) for l in linhas if l.get("telefone")]


async def telefones_cadastrados(municipio: str | None = None) -> list[str]:
    """Telefones da tabela `cidadao`, opcionalmente filtrados pela cidade do alerta."""
    try:
        return await asyncio.to_thread(_telefones_sync, municipio)
    except Exception as erro:
        log.error("Falha ao buscar telefones: %s", erro)
        return []


def _push_tokens_sync(municipio: str | None) -> list[str]:
    sb = cliente()
    if sb is None:
        return []
    resposta = (
        sb.table("dispositivos")
        .select("push_token,municipio,ativo")
        .eq("ativo", True)
        .execute()
    )
    linhas = resposta.data or []
    linhas = _filtrar_por_municipio(linhas, municipio, "municipio")
    return [str(l["push_token"]) for l in linhas if l.get("push_token")]


async def push_tokens(municipio: str | None = None) -> list[str]:
    """Tokens de push do app mobile (tabela `dispositivos`)."""
    try:
        return await asyncio.to_thread(_push_tokens_sync, municipio)
    except Exception as erro:
        log.error("Falha ao buscar tokens de push: %s", erro)
        return []


def _registrar_dispositivo_sync(dados: dict[str, Any]) -> dict[str, Any] | None:
    sb = cliente()
    if sb is None:
        return None
    resposta = (
        sb.table("dispositivos")
        .upsert(dados, on_conflict="push_token")
        .execute()
    )
    return resposta.data[0] if resposta.data else None


async def registrar_dispositivo(dados: dict[str, Any]) -> dict[str, Any] | None:
    """Cadastra/atualiza o token de push de um aparelho."""
    try:
        return await asyncio.to_thread(_registrar_dispositivo_sync, dados)
    except Exception as erro:
        log.error("Falha ao registrar dispositivo: %s", erro)
        return None


# ── Contas que podem disparar alertas ───────────────────────────────────────

def _usuario_do_token_sync(token: str) -> dict[str, Any] | None:
    sb = cliente()
    if sb is None:
        return None
    try:
        resposta = sb.auth.get_user(token)
    except Exception as erro:  # token invalido ou expirado: o SDK lanca AuthApiError
        log.info("Sessao recusada pelo Supabase (%s)", type(erro).__name__)
        return None
    usuario = getattr(resposta, "user", None)
    return {"id": usuario.id} if usuario else None


async def usuario_do_token(token: str) -> dict[str, Any] | None:
    """Usuario dono do token de sessao enviado pelo site, ou None se invalido/expirado."""
    return await asyncio.to_thread(_usuario_do_token_sync, token)


def _papel_da_conta_sync(auth_id: str) -> dict[str, Any] | None:
    sb = cliente()
    if sb is None:
        return None
    admin = sb.table("admin").select("id").eq("auth_id", auth_id).limit(1).execute()
    if admin.data:
        return {"papel": "admin", "municipio": None}
    servidor = (
        sb.table("servidor").select("municipio").eq("auth_id", auth_id).limit(1).execute()
    )
    if servidor.data:
        return {"papel": "servidor", "municipio": servidor.data[0].get("municipio")}
    return None


async def papel_da_conta(auth_id: str) -> dict[str, Any] | None:
    """'admin' (equipe Pluvite) ou 'servidor' (prefeitura, com o municipio), ou None.

    As mesmas tabelas que /Adm e /Prefeituras conferem no site.
    """
    try:
        return await asyncio.to_thread(_papel_da_conta_sync, auth_id)
    except Exception as erro:
        log.error("Falha ao consultar o papel da conta: %s", erro)
        return None

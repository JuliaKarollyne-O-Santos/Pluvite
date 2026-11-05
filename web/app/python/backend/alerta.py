"""Modelo unico de alerta do Pluvite.

O formato da mensagem segue rigorosamente o modelo que ja existia em
`notificacao_popup/popups.py` (o pop-up de desktop). Este modulo e a fonte
unica da verdade: o pop-up do site, a mensagem do WhatsApp e a notificacao
push do app sao todos montados a partir do mesmo payload.

Campos vindos da tabela `alertas_tempo_real` do Supabase:
    tipo, prioridade, municipio, endereco, descricao, statusatual, criado_em
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

# Prioridades oficiais -> identidade visual usada nos 3 canais
ESTILOS_PRIORIDADE: dict[str, dict[str, str]] = {
    "Zona Segura": {"cor": "#0a9667", "icone": "ℹ️", "rotulo": "ZONA SEGURA"},
    "Atenção Crítica": {"cor": "#f59e0b", "icone": "⚠️", "rotulo": "ATENÇÃO CRÍTICA"},
    "Estado de Alerta": {"cor": "#ef4444", "icone": "🔶", "rotulo": "ESTADO DE ALERTA"},
    "Alerta Máximo": {"cor": "#653dc2", "icone": "🚨", "rotulo": "ALERTA MÁXIMO"},
}

PRIORIDADE_PADRAO = "Atenção Crítica"


def normalizar_prioridade(valor: Any) -> str:
    """Aceita prioridades atuais e legadas, devolvendo o nome oficial."""
    texto = str(valor or "").strip().upper()
    substituicoes = {
        "Á": "A", "À": "A", "Â": "A", "Ã": "A",
        "É": "E", "Ê": "E", "Í": "I", "Ó": "O", "Ô": "O", "Õ": "O", "Ú": "U", "Ç": "C",
    }
    for acentuada, simples in substituicoes.items():
        texto = texto.replace(acentuada, simples)
    prioridades = {
        "ZONA SEGURA": "Zona Segura",
        "BAIXA": "Zona Segura",
        "ATENCAO CRITICA": "Atenção Crítica",
        "MEDIA": "Atenção Crítica",
        "AMARELO": "Atenção Crítica",
        "MODERADA": "Atenção Crítica",
        "ESTADO DE ALERTA": "Estado de Alerta",
        "ALTA": "Estado de Alerta",
        "LARANJA": "Estado de Alerta",
        "ALERTA MAXIMO": "Alerta Máximo",
        "CRITICA": "Alerta Máximo",
        "URGENTE": "Alerta Máximo",
        "EXTREMA": "Alerta Máximo",
        "VERMELHO": "Alerta Máximo",
    }
    if texto in prioridades:
        return prioridades[texto]
    return PRIORIDADE_PADRAO


def montar_titulo(tipo: str, prioridade: str, municipio: str) -> str:
    """Mesmo titulo do pop-up original: `[PRIORIDADE] Alerta de X - Cidade`."""
    return f"[{prioridade}] Alerta de {tipo} - {municipio}"


def montar_mensagem(
    tipo: str,
    prioridade: str,
    municipio: str,
    endereco: str,
    status: str,
    descricao: str,
) -> str:
    """Corpo da mensagem, identico ao modelo de `popups.py`."""
    return (
        f"⚠️ ATENÇÃO: {tipo.upper()} ⚠️\n\n"
        f"📍 Localização: {municipio}\n"
        f"📌 Endereço/Região: {endereco}\n"
        f"🚨 Nível de Prioridade: {prioridade}\n"
        f"🔄 Status Atual: {status}\n\n"
        f"ℹ️ Descrição do Ocorrido:\n{descricao}\n\n"
        f"Por favor, mantenha-se em segurança e siga as orientações locais."
    )


def montar_payload(registro: dict[str, Any], origem: str = "manual") -> dict[str, Any]:
    """Converte uma linha de `alertas_tempo_real` no payload unificado.

    `origem` identifica quem gerou o evento: OpenWeather real, mock ou manual.
    """
    tipo = str(registro.get("tipo") or "Alerta").strip()
    prioridade = normalizar_prioridade(registro.get("prioridade"))
    municipio = str(registro.get("municipio") or "Local não especificado").strip()
    endereco = str(registro.get("endereco") or "Endereço não informado").strip()
    descricao = str(registro.get("descricao") or "Sem detalhes adicionais.").strip()
    status = str(registro.get("statusatual") or "Ativo").strip()
    criado_em = registro.get("criado_em") or datetime.now(timezone.utc).isoformat()
    estilo = ESTILOS_PRIORIDADE[prioridade]

    return {
        "id": str(registro.get("id") or uuid.uuid4()),
        "tipo": tipo,
        "prioridade": prioridade,
        "municipio": municipio,
        "endereco": endereco,
        "descricao": descricao,
        "statusatual": status,
        "criado_em": criado_em,
        "origem": origem,
        # Campos derivados prontos para exibicao
        "titulo": montar_titulo(tipo, prioridade, municipio),
        "mensagem": montar_mensagem(tipo, prioridade, municipio, endereco, status, descricao),
        "rotulo_severidade": estilo["rotulo"],
        "icone": estilo["icone"],
        "cor": estilo["cor"],
        "botao": "Estou Ciente",
    }


def resumo_curto(payload: dict[str, Any], limite: int = 120) -> str:
    """Versao enxuta da descricao, usada no corpo do push notification."""
    descricao = payload["descricao"]
    if len(descricao) > limite:
        descricao = descricao[: limite - 3].rstrip() + "..."
    return f"{payload['tipo']} em {payload['municipio']}. {descricao}"


def para_registro_banco(payload: dict[str, Any]) -> dict[str, Any]:
    """Apenas as colunas que existem em `alertas_tempo_real`."""
    return {
        "origem": payload["origem"],
        "tipo": payload["tipo"],
        "prioridade": payload["prioridade"],
        "municipio": payload["municipio"],
        "endereco": payload["endereco"],
        "descricao": payload["descricao"],
        "statusatual": payload["statusatual"],
    }

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

# Escala de severidade -> identidade visual usada nos 3 canais
ESTILOS_PRIORIDADE: dict[str, dict[str, str]] = {
    "CRITICA": {"cor": "#b91c1c", "icone": "🚨", "rotulo": "ALERTA VERMELHO — Perigo Extremo"},
    "ALTA": {"cor": "#c2410c", "icone": "🔶", "rotulo": "ALERTA LARANJA — Alto Risco"},
    "MEDIA": {"cor": "#a16207", "icone": "⚠️", "rotulo": "ATENÇÃO — Risco Moderado"},
    "BAIXA": {"cor": "#1447c4", "icone": "ℹ️", "rotulo": "AVISO — Risco Baixo"},
}

PRIORIDADE_PADRAO = "MEDIA"


def normalizar_prioridade(valor: Any) -> str:
    """Aceita 'critica', 'Crítica', 'CRITICA'... e devolve a chave canonica."""
    texto = str(valor or "").strip().upper()
    substituicoes = {
        "Á": "A", "À": "A", "Â": "A", "Ã": "A",
        "É": "E", "Ê": "E", "Í": "I", "Ó": "O", "Ô": "O", "Õ": "O", "Ú": "U", "Ç": "C",
    }
    for acentuada, simples in substituicoes.items():
        texto = texto.replace(acentuada, simples)
    if texto in ESTILOS_PRIORIDADE:
        return texto
    if texto in ("URGENTE", "EXTREMA", "VERMELHO"):
        return "CRITICA"
    if texto in ("LARANJA",):
        return "ALTA"
    if texto in ("AMARELO", "MODERADA"):
        return "MEDIA"
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

    `origem` identifica quem gerou o evento: "openweather" ou "manual".
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
        "tipo": payload["tipo"],
        "prioridade": payload["prioridade"],
        "municipio": payload["municipio"],
        "endereco": payload["endereco"],
        "descricao": payload["descricao"],
        "statusatual": payload["statusatual"],
    }

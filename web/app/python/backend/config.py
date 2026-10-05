"""Configuracao central do backend de alertas do Pluvite.

Todas as credenciais sao lidas do arquivo web/app/python/.env
(veja .env.example para a lista completa de variaveis).
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# .env fica na raiz de web/app/python (um nivel acima deste pacote)
RAIZ_PYTHON = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=RAIZ_PYTHON / ".env")


def _bool(nome: str, padrao: bool = False) -> bool:
    valor = os.getenv(nome)
    if valor is None:
        return padrao
    return valor.strip().lower() in ("1", "true", "yes", "sim", "on")


def _int(nome: str, padrao: int) -> int:
    try:
        return int(os.getenv(nome, padrao))
    except (TypeError, ValueError):
        return padrao


def _lista(nome: str, padrao: str = "") -> list[str]:
    bruto = os.getenv(nome, padrao) or ""
    return [item.strip() for item in bruto.split(",") if item.strip()]


# ── Supabase ────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# ── Servidor ────────────────────────────────────────────────────────────────
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = _int("API_PORT", 8000)
# Token simples exigido no header X-Pluvite-Token para o disparo manual.
# Deixe vazio em desenvolvimento para liberar o endpoint.
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
CORS_ORIGENS = _lista("CORS_ORIGENS", "http://localhost:3000,http://127.0.0.1:3000")

# ── OpenWeather ─────────────────────────────────────────────────────────────
OPENWEATHER_KEY = os.getenv("OPENWEATHER_KEY", "")
MONITOR_ATIVO = _bool("MONITOR_ATIVO", True)
MONITOR_CIDADES = _lista("MONITOR_CIDADES", "Taubate,Sao Jose dos Campos")
MONITOR_INTERVALO_SEGUNDOS = _int("MONITOR_INTERVALO_SEGUNDOS", 600)
# Nao repete o mesmo alerta (cidade + tipo) dentro desse intervalo
MONITOR_COOLDOWN_SEGUNDOS = _int("MONITOR_COOLDOWN_SEGUNDOS", 10800)
# Modo de teste: le a resposta do OpenWeather de um arquivo JSON local
MOCK_OPENWEATHER = _bool("MOCK_OPENWEATHER", False)
MOCK_OPENWEATHER_ARQUIVO = os.getenv(
    "MOCK_OPENWEATHER_ARQUIVO", str(RAIZ_PYTHON / "mocks" / "openweather_tempestade.json")
)

# ── WhatsApp ────────────────────────────────────────────────────────────────
# "evolution" = Evolution API / Baileys self-hosted; "off" = canal desativado
WHATSAPP_PROVEDOR = os.getenv("WHATSAPP_PROVEDOR", "off").strip().lower()
EVOLUTION_URL = os.getenv("EVOLUTION_URL", "")
EVOLUTION_INSTANCIA = os.getenv("EVOLUTION_INSTANCIA", "")
EVOLUTION_APIKEY = os.getenv("EVOLUTION_APIKEY", "")
# Numeros extras de teste (formato E.164 sem +, ex: 5512974075279)
WHATSAPP_NUMEROS_TESTE = _lista("WHATSAPP_NUMEROS_TESTE")
WHATSAPP_DDI_PADRAO = os.getenv("WHATSAPP_DDI_PADRAO", "55")

# ── Push mobile (Expo -> FCM/APNs) ──────────────────────────────────────────
PUSH_ATIVO = _bool("PUSH_ATIVO", True)
EXPO_PUSH_URL = os.getenv("EXPO_PUSH_URL", "https://exp.host/--/api/v2/push/send")
# Necessario apenas se a conta Expo exigir "Enhanced Security for Push"
EXPO_ACCESS_TOKEN = os.getenv("EXPO_ACCESS_TOKEN", "")
PUSH_CANAL_ANDROID = os.getenv("PUSH_CANAL_ANDROID", "alertas-emergencia")
PUSH_TOKENS_TESTE = _lista("PUSH_TOKENS_TESTE")

# ── Geral ───────────────────────────────────────────────────────────────────
TIMEOUT_HTTP = _int("TIMEOUT_HTTP", 20)

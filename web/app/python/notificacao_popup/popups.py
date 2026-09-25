"""Pop-up de desktop do Pluvite (ferramenta local de conferencia).

O FORMATO da mensagem definido aqui originalmente virou o padrao do sistema
inteiro: hoje ele mora em `backend/alerta.py` e alimenta os 3 canais
(pop-up do site via WebSocket, WhatsApp e push no app mobile).

Este script continua util para olhar rapidamente o ultimo alerta do banco
sem subir o front:

    cd web/app/python
    python -m notificacao_popup.popups          # imprime no terminal
    python -m notificacao_popup.popups --janela  # abre a janela do pyautogui
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Permite rodar o arquivo direto, fora da raiz web/app/python
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Formatador oficial do backend - fonte unica da verdade do layout
from backend.alerta import montar_payload  # noqa: E402
from backend.supabase_client import ultimo_alerta  # noqa: E402


def buscar_ultimo_alerta() -> dict | None:
    """Ultimo registro de `alertas_tempo_real`, ja no formato unificado."""
    registro = asyncio.run(ultimo_alerta())
    if not registro:
        return None
    return montar_payload(registro, origem="banco")


def mostrar_popup(usar_janela: bool = False) -> None:
    alerta = buscar_ultimo_alerta()

    if alerta:
        titulo = alerta["titulo"]
        mensagem = alerta["mensagem"]
        botao = alerta["botao"]
    else:
        titulo = "Pluvite - Monitoramento"
        mensagem = "Nenhum alerta recente registrado no sistema no momento."
        botao = "Fechar"

    if usar_janela:
        import pyautogui  # import tardio: o servidor nao precisa dessa dependencia

        pyautogui.alert(text=mensagem, title=titulo, button=botao)
    else:
        print("=" * 60)
        print(titulo)
        print("=" * 60)
        print(mensagem)
        print("=" * 60)


if __name__ == "__main__":
    mostrar_popup(usar_janela="--janela" in sys.argv)

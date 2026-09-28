"""
Envia o último alerta do Pluvite por WhatsApp (Twilio).

Mesma consulta e mesma mensagem do Sms/app.py — muda só o canal de envio.

Variáveis em web/app/python/.env:
    SUPABASE_URL, SUPABASE_KEY          (já usadas pelo Sms/app.py)
    TWILIO_SID, TWILIO_TOKEN            (já usadas pelo Sms/app.py)
    TWILIO_WHATSAPP_FROM                número remetente habilitado para WhatsApp no Twilio
                                        (no Sandbox: +14155238886)
    TWILIO_WHATSAPP_TO                  destinatário, ex.: +5512999999999
                                        (se vazio, usa TWILIO_VERIFIED_NUMBER)

Uso (a partir desta pasta):
    python app.py              busca o último alerta e envia
    python app.py --simular    só mostra a mensagem, sem enviar
"""

import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from postgrest.exceptions import APIError
from supabase import create_client, Client
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client as TwilioClient

# O .env fica em web/app/python/, independente da pasta de onde o script é executado
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / '.env')

# Puxa as credenciais
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TWILIO_SID = os.getenv("TWILIO_SID")
TWILIO_TOKEN = os.getenv("TWILIO_TOKEN")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM")
TWILIO_WHATSAPP_TO = os.getenv("TWILIO_WHATSAPP_TO") or os.getenv("TWILIO_VERIFIED_NUMBER")

# Erros mais comuns do WhatsApp no Twilio, explicados em português
ERROS_TWILIO = {
    20003: "Credenciais do Twilio inválidas (confira TWILIO_SID e TWILIO_TOKEN).",
    21211: "Número de destino inválido (use o formato internacional, ex.: +5512999999999).",
    63007: "O remetente não está habilitado para WhatsApp (confira TWILIO_WHATSAPP_FROM).",
    63015: "O destinatário não entrou no Sandbox: ele precisa enviar 'join <código>' ao número do Sandbox.",
    63016: "Fora da janela de 24 h: mensagem livre só é aceita até 24 h após a última mensagem do destinatário.",
}

# Status finais de uma mensagem no Twilio e quanto tempo esperar por eles após o envio
STATUS_FALHA = ("failed", "undelivered")
STATUS_OK = ("sent", "delivered", "read")
ESPERA_STATUS_SEGUNDOS = 10


def verificar_configuracao(simular=False):
    """Devolve a lista de variáveis de ambiente que faltam para rodar."""
    necessarias = {"SUPABASE_URL": SUPABASE_URL, "SUPABASE_KEY": SUPABASE_KEY}
    if not simular:
        necessarias.update({
            "TWILIO_SID": TWILIO_SID,
            "TWILIO_TOKEN": TWILIO_TOKEN,
            "TWILIO_WHATSAPP_FROM": TWILIO_WHATSAPP_FROM,
            "TWILIO_WHATSAPP_TO (ou TWILIO_VERIFIED_NUMBER)": TWILIO_WHATSAPP_TO,
        })
    return [nome for nome, valor in necessarias.items() if not valor]


def buscar_ultimo_alerta():
    """Último registro de alertas_tempo_real. Lança RuntimeError se o Supabase falhar."""
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        resposta = supabase.table('alertas_tempo_real').select('*').order('criado_em', desc=True).limit(1).execute()
    except APIError as e:
        raise RuntimeError(f"o Supabase recusou a consulta: {e.message}") from e
    except httpx.HTTPError as e:
        raise RuntimeError(f"não foi possível conectar ao Supabase: {e}") from e
    except Exception as e:
        raise RuntimeError(f"erro ao consultar o Supabase: {e}") from e

    return resposta.data[0] if resposta.data else None


def formatar_mensagem(alerta):
    """Mesmo texto do Sms/app.py (campos nulos no banco viram o texto padrão)."""
    tipo = alerta.get('tipo') or 'Alerta'
    prioridade = str(alerta.get('prioridade') or 'Desconhecida').upper()
    municipio = alerta.get('municipio') or 'Local não especificado'

    # Limita a descrição, como no SMS
    descricao = (alerta.get('descricao') or 'Sem detalhes.')[:100] + "..."

    return (
        f"PLUVITE - {prioridade}\n"
        f"{tipo.upper()} em {municipio}.\n"
        f"Info: {descricao}\n"
        f"Fique em segurança!"
    )


def numero_whatsapp(numero):
    """'+55 12 99999-9999' ou 'whatsapp:+5512...' → 'whatsapp:+5512999999999'."""
    numero = numero.strip().removeprefix("whatsapp:")
    digitos = "".join(c for c in numero if c.isdigit())
    return f"whatsapp:+{digitos}"


def explicar_erro_twilio(codigo, mensagem=""):
    return ERROS_TWILIO.get(codigo, f"código {codigo} {mensagem}".strip())


def aguardar_entrega(cliente_twilio, sid):
    """
    Erros do WhatsApp (janela de 24 h, Sandbox...) costumam chegar depois do envio, no status da
    mensagem. Consulta o status por alguns segundos para não reportar sucesso falso.
    """
    status = "queued"
    for _ in range(ESPERA_STATUS_SEGUNDOS):
        mensagem = cliente_twilio.messages(sid).fetch()
        status = mensagem.status
        if status in STATUS_FALHA:
            return False, explicar_erro_twilio(mensagem.error_code, mensagem.error_message or "")
        if status in STATUS_OK:
            return True, status
        time.sleep(1)
    return True, f"{status} (ainda na fila do Twilio)"


def enviar_whatsapp(simular=False):
    """Busca o último alerta e envia por WhatsApp. Devolve True se deu certo."""
    faltando = verificar_configuracao(simular)
    if faltando:
        print(f"❌ Configure no web/app/python/.env: {', '.join(faltando)}")
        return False

    try:
        alerta = buscar_ultimo_alerta()
    except RuntimeError as e:
        print(f"❌ Erro no Supabase: {e}")
        return False

    if not alerta:
        print("Nenhum alerta encontrado no banco de dados para enviar.")
        return False

    mensagem_texto = formatar_mensagem(alerta)

    if simular:
        print("Mensagem que seria enviada:\n")
        print(mensagem_texto)
        return True

    destino = numero_whatsapp(TWILIO_WHATSAPP_TO)
    try:
        # Conecta ao Twilio e envia a mensagem pelo canal WhatsApp
        cliente_twilio = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
        mensagem = cliente_twilio.messages.create(
            body=mensagem_texto,
            from_=numero_whatsapp(TWILIO_WHATSAPP_FROM),
            to=destino,
        )
        entregue, detalhe = aguardar_entrega(cliente_twilio, mensagem.sid)
    except TwilioRestException as e:
        print(f"❌ Erro ao enviar WhatsApp: {explicar_erro_twilio(e.code, e.msg)}")
        return False
    except Exception as e:
        print(f"❌ Erro ao conectar com o Twilio: {e}")
        return False

    if not entregue:
        print(f"❌ WhatsApp não entregue (SID {mensagem.sid}): {detalhe}")
        return False

    print(f"✅ WhatsApp enviado para {destino}! SID: {mensagem.sid} — status: {detalhe}")
    return True


if __name__ == "__main__":
    sys.exit(0 if enviar_whatsapp(simular="--simular" in sys.argv) else 1)

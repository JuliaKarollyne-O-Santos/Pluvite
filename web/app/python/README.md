# Pluvite — Central de Alertas (backend Python)

Ponto único de disparo de alertas. Um evento entra (automático pelo OpenWeather
ou manual pelo painel) e sai simultaneamente pelo site e pelo app. O envio
WhatsApp via Evolution API é opcional e fica desativado por padrão:

| Canal | Tecnologia | Arquivo |
|---|---|---|
| 🖥️ Pop-up no site | WebSocket | `backend/canais/websocket_hub.py` |
| 💬 WhatsApp | Evolution API (opcional); chatbot QR independente em `chatbot/` | `backend/canais/whatsapp.py` |
| 📱 App mobile | Expo Push → FCM/APNs | `backend/canais/push_mobile.py` |

## Estrutura

```
web/app/python/
├── backend/
│   ├── main.py             # FastAPI: WebSocket + rotas REST
│   ├── dispatcher.py       # PONTO CENTRAL: dispara os 3 canais em paralelo
│   ├── alerta.py           # Formato único do alerta (modelo do popups.py)
│   ├── openweather.py      # Rotina automática de monitoramento
│   ├── supabase_client.py  # Persistência e destinatários
│   └── canais/             # Um módulo por canal
├── notificacao_popup/popups.py   # Pop-up de desktop (usa o mesmo formato)
├── mocks/                  # Respostas simuladas do OpenWeather (testes)
├── sql/alertas.sql         # Tabelas e políticas do Supabase
├── chatbot/                # Chatbot WhatsApp via QR (ainda sem integração com alertas)
├── requirements.txt
└── .env.example
```

O canal WhatsApp do despachante fica desativado por padrão. A resposta de
boas-vindas do chatbot via QR funciona separadamente; a integração desse
chatbot com o envio de alertas ainda precisa ser implementada.

## Como rodar

```bash
cd web/app/python
python -m venv .venv
.venv\Scripts\activate          # Windows;  no Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env            # preencha as credenciais
uvicorn backend.main:app --reload --port 8000
```

Antes do primeiro uso, rode `sql/alertas.sql` no SQL Editor do Supabase.

## Rotas

| Método | Rota | Para que serve |
|---|---|---|
| `GET` | `/api/status` | Saúde do serviço, canais e navegadores conectados |
| `WS` | `/ws/alertas` | Pop-up do site em tempo real |
| `POST` | `/api/alertas/disparar` | **Gatilho manual** (painel do servidor) |
| `GET` | `/api/alertas/ultimo` | Último alerta (site/app que abrem depois) |
| `POST` | `/api/monitor/verificar-agora?forcar=true` | Força um ciclo do monitor |
| `POST` | `/api/dispositivos` | App mobile registra o token de push |

Documentação interativa: <http://localhost:8000/docs>.

## Fluxo

```
OpenWeather (a cada 10 min)  ─┐
                              ├─> dispatcher.disparar_alerta()
Painel web (POST manual)     ─┘         │
                                        ├─ grava em alertas_tempo_real
                                        └─ asyncio.gather:
                                             ├─ WebSocket  -> pop-up no site
                                             ├─ WhatsApp   -> Evolution API (opcional; desligado por padrão)
                                             └─ Expo Push  -> app mobile
```

O guia passo a passo de homologação está em
[`GUIA-TESTES-ALERTAS.md`](../../../GUIA-TESTES-ALERTAS.md).

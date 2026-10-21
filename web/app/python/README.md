# Pluvite — Central de Alertas (backend Python)

Ponto único de disparo de alertas. Um evento entra (automático pelo OpenWeather
ou manual pelo painel) e sai simultaneamente pelo site e pelo app. O envio
WhatsApp (pelo chatbot conectado por QR ou pela Evolution API) é opcional e fica
desativado por padrão:

| Canal | Tecnologia | Arquivo |
|---|---|---|
| 🖥️ Pop-up no site | WebSocket | `backend/canais/websocket_hub.py` |
| 💬 WhatsApp | Chatbot QR em `chatbot/` (`WHATSAPP_PROVEDOR=qr`) ou Evolution API | `backend/canais/whatsapp.py` |
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
├── chatbot/                # Chatbot WhatsApp via QR + API local de envio de alertas
├── requirements.txt
└── .env.example
```

### WhatsApp pelo chatbot QR (sem software extra)

Recebem os alertas **só** os contatos que mandarem `pluvite` no privado do
WhatsApp conectado e escolherem um município (os telefones da tabela `cidadao`
não são usados nesse modo). Cada alerta municipal chega apenas aos inscritos
daquela cidade. Envie `cidade` para alterar a escolha ou `sair` para cancelar.
A lista fica em `chatbot/inscritos.json` (ignorado pelo git), sobrevive a
reinícios com Ctrl+C e é **apagada no logout** (comando `logout` no terminal ou
desconectar o aparelho pelo celular).

1. No `.env`: `WHATSAPP_PROVEDOR=qr` e um `CHATBOT_TOKEN` qualquer (secreto).
   `WHATSAPP_NUMEROS_TESTE` é opcional (números que sempre recebem).
2. `cd chatbot && npm install` (uma vez). Depois, `npm run dev` em `web/` já sobe
   o chatbot junto com o site (prefixo `[whatsapp]`): escaneie o QR com o número
   que vai enviar os alertas. O chatbot lê o mesmo `.env` e abre a API local em
   `http://127.0.0.1:3010` (`POST /enviar`, `GET /inscritos`, `GET /status`).
   Para rodar sozinho: `npm start` dentro de `chatbot/`.
3. De outro celular, mande `pluvite` para esse número e responda com a cidade
   desejada entre os 39 municípios do Vale do Paraíba e Litoral Norte.
4. Dispare um alerta no painel `/Servidor` do site: sai o pop-up e, junto, o
   WhatsApp para os inscritos. `/api/status` mostra `whatsapp_chatbot`.
5. Teste só o WhatsApp (não grava no banco nem dispara site/push):
   `python -m backend.canais.whatsapp`

Em conversa privada, qualquer pessoa também pode perguntar **"Qual foi o
último alerta real do OpenWeather?"**. A resposta consulta apenas alertas do
monitoramento com dados reais; mocks e disparos manuais são excluídos. Execute
`sql/alertas.sql` no Supabase para gravar a origem dos novos alertas.

Roteiro completo: `GUIA-TESTES-ALERTAS.md` (Teste 4). Os envios saem um por vez
(`CHATBOT_INTERVALO_SEGUNDOS`) para reduzir o risco de bloqueio do número.

## Monitoramento regional OpenWeather

Por padrão, o monitor consulta os 39 municípios uma vez por hora. Usa as
coordenadas cadastradas em `municipios.json`, pois a busca nominal da API não
reconhece todas as cidades. Isso consome 39 chamadas de clima por ciclo e pode
fazer até outras 39 consultas do One Call: até 1.872 chamadas por dia quando
esse endpoint está habilitado. Confira a cota do plano antes de ativá-lo.
`MONITOR_CIDADES` e `MONITOR_INTERVALO_SEGUNDOS` podem ser ajustados no `.env`.
Os usuários escolhem no perfil/app ou no chatbot WhatsApp qual município querem
acompanhar; push e mensagens WhatsApp são filtrados por essa preferência.

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
| `GET` | `/api/alertas/ultimo-openweather` | Último alerta real do monitor (exclui mocks e disparos manuais) |
| `POST` | `/api/monitor/verificar-agora?forcar=true` | Força um ciclo do monitor |
| `POST` | `/api/dispositivos` | App mobile registra o token de push |

Documentação interativa: <http://localhost:8000/docs>.

## Fluxo

```
OpenWeather (a cada 1 hora)  ─┐
                              ├─> dispatcher.disparar_alerta()
Painel web (POST manual)     ─┘         │
                                        ├─ grava em alertas_tempo_real
                                        └─ asyncio.gather:
                                             ├─ WebSocket  -> pop-up no site
                                             ├─ WhatsApp   -> chatbot QR ou Evolution API (desligado por padrão)
                                             └─ Expo Push  -> app mobile
```

O guia passo a passo de homologação está em
[`GUIA-TESTES-ALERTAS.md`](../../../GUIA-TESTES-ALERTAS.md).

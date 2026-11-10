# Pluvite — Central de Alertas (backend Python)

Ponto único de disparo de alertas. Um evento entra (automático pelo OpenWeather
ou manual pelo painel) e sai simultaneamente pelo site e pelo app. O envio
WhatsApp (pelo chatbot conectado por QR ou pela Evolution API) é opcional e fica
desativado por padrão:

| Canal | Tecnologia | Arquivo |
|---|---|---|
| 🖥️ Pop-up no site | WebSocket | `backend/canais/websocket_hub.py` |
| 💬 WhatsApp | Chatbot QR em `chatbot/` (`qr` local ou `qr-poll` remoto) ou Evolution API | `backend/canais/whatsapp.py` |
| 📱 App mobile | Firebase Cloud Messaging (FCM) | `backend/canais/push_mobile.py` |

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
2. `cd chatbot && npm install` (uma vez). Inicie o chatbot em um terminal:
   `cd chatbot && node chatbot.js` (ou `npm start`). O QR Code será exibido
   nesse terminal; escaneie com o número que vai enviar os alertas. Em outro
   terminal, execute `npm run dev` em `web/` para iniciar o site e os backends.
   O chatbot lê o mesmo `.env` e abre a API local em `http://127.0.0.1:3010`
   (`POST /enviar`, `GET /inscritos`, `GET /status`).
3. De outro celular, mande `pluvite` para esse número e responda com a cidade
   desejada entre os 39 municípios do Vale do Paraíba e Litoral Norte.
4. Dispare um alerta no painel `/Servidor` do site: sai o pop-up e, junto, o
   WhatsApp para os inscritos. `/api/status` mostra `whatsapp_chatbot`.
5. Teste só o WhatsApp (não grava no banco nem dispara site/push):
   `python -m backend.canais.whatsapp`

Esse comando isolado envia somente aos números configurados em
`WHATSAPP_NUMEROS_TESTE`; não envia aos inscritos do chatbot. Sem números de
teste, nenhum destinatário recebe a mensagem.

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

### Publicar com Vercel e Render

O site da Vercel não executa esta API FastAPI nem processos persistentes. O
`render.yaml` configura a API separada (`pluvite-alertas-api`) no Render. Crie/
sincronize o Blueprint e preencha `SUPABASE_URL` e `SUPABASE_KEY` como variáveis
secretas do serviço; sem elas, alertas não serão persistidos e o histórico não
funcionará. O monitor OpenWeather fica desligado por padrão; para ativá-lo,
configure `OPENWEATHER_KEY` e `MONITOR_ATIVO=true`.

Depois que a API estiver no ar, configure na Vercel `NEXT_PUBLIC_API_ALERTAS`
com a URL pública do Render, em Production (e Preview, se necessário), e faça
um novo deploy. Configure `CORS_ORIGENS` no Render com a origem exata do site
(por exemplo, `https://pluvite.vercel.app`). O popup deriva dessa URL o
endereço `wss://` do WebSocket; não é necessário definir
`NEXT_PUBLIC_WS_ALERTAS`. O domínio deve usar HTTPS para que o navegador aceite
o WebSocket seguro.

#### Apresentação sem contratar hospedagem

O `render.yaml` mantém a API no plano Free e configura `WHATSAPP_PROVEDOR=qr-poll`.
O site Vercel usa o WebSocket da API para o popup. O chatbot QR roda no
computador da apresentação: ele consulta periodicamente a API pública do Render
e envia os alertas aos inscritos. Assim, a API não precisa abrir conexão de
entrada para o computador e não é necessário contratar serviço privado nem
disco. O computador precisa ficar ligado, conectado à internet e com o chatbot
aberto durante a demonstração. O Render Free pode suspender a API quando não
estiver sendo usada; iniciar o chatbot antes da apresentação mantém a API sendo
consultada, mas pode haver atraso ao acordá-la.

1. Sincronize o Blueprint `render.yaml` no Render e configure `SUPABASE_URL`,
   `SUPABASE_KEY` e `CHATBOT_TOKEN` como variáveis do serviço. Gere um token
   aleatório e guarde-o; não o coloque no código nem na Vercel. `CHATBOT_TOKEN`
   deve ser o mesmo no Render e no computador da apresentação.
2. Na Vercel, configure `NEXT_PUBLIC_API_ALERTAS` com a URL pública da API e
   faça um novo deploy. Confira que `CORS_ORIGENS` no Render inclui o domínio
   exato do site, por exemplo `https://pluvite.vercel.app`.
3. No computador da apresentação, instale Node.js, clone o projeto e instale
   as dependências do chatbot (`npm --prefix web/app/python/chatbot install`).
   Crie `web/app/python/.env` (não versionado) com:

   ```dotenv
   WHATSAPP_PROVEDOR=qr-poll
   PLUVITE_API_ALERTAS_URL=https://<url-publica-da-api-render>
   CHATBOT_TOKEN=<mesmo-segredo-do-render>
   PLUVITE_CHATBOT_DATA_PATH=<pasta-local-gravavel>
   ```

4. Inicie o chatbot (`npm --prefix web/app/python/chatbot start`), escaneie o QR
   no terminal e confira `GET /api/status`: `whatsapp_chatbot.conectado` deve
   aparecer como `true`. Envie `pluvite` pelo celular que receberá a mensagem e
   escolha o município da demonstração.
5. Com o popup aberto no site e um usuário de servidor autenticado, dispare um
   alerta controlado. O popup chega pelo WebSocket; o chatbot consulta o alerta
   salvo no Supabase e envia a mensagem aos inscritos daquele município.

O cursor de entrega e a sessão QR ficam na pasta local definida por
`PLUVITE_CHATBOT_DATA_PATH`, evitando reenviar o histórico após reiniciar o
chatbot. O modo `qr-poll` requer `CHATBOT_TOKEN` e Supabase configurados; sem
persistência no banco, o chatbot não consegue buscar os alertas. Nunca coloque
`CHATBOT_TOKEN` ou `SUPABASE_KEY` na Vercel como variáveis `NEXT_PUBLIC_*`.

O painel exige uma sessão Supabase válida de uma conta cadastrada como
`servidor` ou `admin`. O backend valida o perfil: servidores só podem emitir
alertas para o próprio município, enquanto admins podem selecionar qualquer
município da lista. A política `servidor le a propria linha` da migration
`supabase/migrations/20260923200000_painel_admin.sql` precisa estar aplicada.
Para scripts de backend, `ADMIN_TOKEN` também pode autorizar chamadas manuais;
ele nunca deve ser exposto no navegador nem em variáveis `NEXT_PUBLIC_`.

No painel, **Revisar alerta real** abre uma confirmação com os dados completos
antes de notificar moradores. **Testar popup (simulação)** abre uma prévia local
marcada como teste: não grava no banco, não aparece para outros usuários e
nunca aciona WebSocket, WhatsApp ou push.

O status dos canais é consultivo: WhatsApp só aparece pronto se o chatbot QR
estiver conectado (ou informa que a Evolution API está configurada, sem testar
a conexão), e push só aparece pronto quando `PUSH_ATIVO=true` e o arquivo de
conta de serviço Firebase apontado por `FCM_SERVICE_ACCOUNT_FILE` existir e
contiver os campos esperados. `EXPO_ACCESS_TOKEN` não configura esse canal.
Admins autenticados também podem verificar o monitor; `ADMIN_TOKEN` é necessário
para scripts sem sessão Supabase.

## Rotas

| Método | Rota | Para que serve |
|---|---|---|
| `GET` | `/api/status` | Saúde do serviço, canais e navegadores conectados |
| `WS` | `/ws/alertas?municipio=Taubaté` | Pop-up em tempo real, restrito ao município inscrito |
| `POST` | `/api/alertas/disparar` | Alerta real autenticado; servidor restrito ao próprio município |
| `POST` | `/api/alertas/simular` | Payload para prévia local; sem broadcast, persistência ou outros canais |
| `GET` | `/api/alertas/historico` | Histórico recente do município do servidor autenticado |
| `GET` | `/api/alertas/ultimo?municipio=Taubaté` | Último alerta do município (site/app que abrem depois) |
| `GET` | `/api/alertas/ultimo-openweather` | Último alerta real do monitor (exclui mocks e disparos manuais) |
| `GET` | `/api/alertas/novos?desde_id=...` | Busca autenticada de alertas pelo chatbot local (`X-Pluvite-Token`) |
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
                                             ├─ WhatsApp   -> chatbot QR (polling local no modo gratuito)
                                             └─ FCM Push    -> app mobile
```

O guia passo a passo de homologação está em
[`GUIA-TESTES-ALERTAS.md`](../../../GUIA-TESTES-ALERTAS.md).

O popup do site e a consulta do último alerta exigem o município de inscrição.
No site, `cidadao.municipio_alertas` tem precedência; quando não estiver
definido, é usada a cidade do perfil (`cidadao.cidade`). Clientes sem um
município válido não recebem alertas pelo WebSocket.

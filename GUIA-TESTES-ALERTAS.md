# Guia de homologação — Ecossistema de Alertas Pluvite

Roteiro passo a passo para validar os alertas no site e no app mobile, além do
chatbot WhatsApp via QR, que ainda funciona separadamente do disparo de alertas.

> Todos os comandos assumem a raiz do repositório (`Pluvite/`) como ponto de
> partida. No Windows, use o PowerShell.

---

## Visão geral do que foi construído

```
                    ┌──────────────────────────────┐
  OpenWeather ─────►│                              │──► WebSocket  ──► Pop-up no site
  (rotina 10 min)   │   dispatcher.disparar_alerta │──► WhatsApp   ──► desativado por padrão
  Painel web  ─────►│   (ponto central, asyncio)   │──► Expo Push  ──► FCM/APNs no celular
  (gatilho manual)  └──────────────────────────────┘
                                  │
                                  └──► Supabase: alertas_tempo_real
```

Arquivos principais:

| Pasta | Arquivo | Papel |
|---|---|---|
| backend python | `web/app/python/backend/dispatcher.py` | Ponto central de disparo |
| backend python | `web/app/python/backend/openweather.py` | Gatilho automático |
| backend python | `web/app/python/backend/main.py` | WebSocket + rotas REST |
| backend python | `web/app/python/backend/canais/*` | Um módulo por canal |
| web | `web/app/components/AlertaPopup.tsx` | Pop-up em tempo real |
| web | `web/app/page.tsx` | Gatilho manual (painel) |
| mobile | `mobile/pluvite/src/services/notificacoes.ts` | Push nativo |
| mobile | `mobile/pluvite/src/components/AlertaEmergenciaModal.tsx` | Modal na tela inicial |

---

## Passo 0 — Preparação (fazer uma vez)

### 0.1 Banco de dados

No painel do Supabase → **SQL Editor** → **New query**, cole e execute o
conteúdo de `web/app/python/sql/alertas.sql`. Ele cria a tabela
`dispositivos` (tokens de push) e garante as colunas usadas pelos 3 canais.

Confira:

```sql
select * from dispositivos;                 -- deve existir, vazia
select * from alertas_tempo_real limit 5;   -- deve existir
```

### 0.2 Backend Python

```powershell
cd web\app\python
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Copie `.env.example` para `.env` (se ainda não existir) e preencha ao menos
`SUPABASE_URL`, `SUPABASE_KEY` e `OPENWEATHER_KEY`. As chaves de WhatsApp e
push podem ficar vazias por enquanto — o canal simplesmente reporta
"não configurado" e os outros dois continuam funcionando.

O backend é iniciado junto com o site no passo 0.3. Não inicie outro Uvicorn
manualmente, pois ele tentará usar a mesma porta 8000.

Ao iniciar o projeto, você deve ver:

```
Monitor OpenWeather ativo - cidades: Taubate, Sao Jose dos Campos | intervalo: 600s
Uvicorn running on http://0.0.0.0:8000
```

Teste rápido: abra <http://localhost:8000/api/status>. Deve responder um JSON
com `navegadores_conectados: 0`.

### 0.3 Site (Next.js)

Na raiz do repositório:

```powershell
cd web
npm install
npm run dev
```

Esse comando inicia Next.js, Express e Uvicorn. O Uvicorn escuta em
`0.0.0.0:8000` para permitir conexões do app na rede local. Confira
<http://localhost:8000/api/status>.

Se o backend Python não estiver em `http://localhost:8000`, crie
`web/.env.local`:

```
NEXT_PUBLIC_API_ALERTAS=http://192.168.0.10:8000
```

### 0.4 App mobile (Expo)

```powershell
cd mobile\pluvite
npm install
npx expo install expo-notifications expo-device expo-constants
```

> O `npx expo install` ajusta as versões para as compatíveis com o SDK 54.

---

## Teste 1 — Gatilho automático (mock do OpenWeather)

**Objetivo:** provar que uma emergência climática detectada pela API dispara
o alerta sozinho, sem ninguém apertar botão.

Já existe um mock pronto em `web/app/python/mocks/openweather_tempestade.json`
(código `212` = trovoada intensa, ventos de 70 km/h, 42 mm de chuva → prioridade
`CRITICA`).

### 1.1 Ligar o modo mock

No `.env` do backend:

```
MOCK_OPENWEATHER=true
MOCK_OPENWEATHER_ARQUIVO=mocks/openweather_tempestade.json
MONITOR_CIDADES=Taubate
```

Depois de alterar `.env`, pare e reinicie `npm run dev`; o Uvicorn não recarrega
automaticamente mudanças nesse arquivo. No log deve aparecer:

```
WARNING | pluvite.openweather | MOCK_OPENWEATHER ativo - lendo ...openweather_tempestade.json
INFO    | pluvite.dispatcher  | >> Disparando alerta [openweather] [CRITICA] Alerta de Tempestade - Taubate
```

### 1.2 Forçar um ciclo sem esperar os 10 minutos

```powershell
curl.exe -X POST "http://localhost:8000/api/monitor/verificar-agora?forcar=true"
```

Resposta esperada:

```json
{
  "ok": true,
  "resultados": [
    {
      "cidade": "Taubate",
      "consultado": true,
      "emergencia": true,
      "disparados": ["[CRITICA] Alerta de Tempestade - Taubate"]
    }
  ]
}
```

> `forcar=true` limpa o *cooldown*. Sem ele, o mesmo alerta não se repete
> dentro de `MONITOR_COOLDOWN_SEGUNDOS` (3h por padrão) — comportamento
> proposital para não spammar a população.

### 1.3 Variações para testar a classificação

Edite `weather[0].id` no arquivo de mock e repita o passo 1.2:

| `id` | Resultado esperado |
|---|---|
| `212` | Tempestade — prioridade **CRITICA** |
| `502` | Chuva Forte — prioridade **ALTA** |
| `781` | Tornado — prioridade **CRITICA** |
| `800` | Nenhum alerta (`"emergencia": false`) |

Há também `mocks/openweather_normal.json` pronto para o caso "céu limpo".

### 1.4 Testar com a API real

Basta `MOCK_OPENWEATHER=false`. Como o tempo real raramente está em
emergência, para ver o disparo acontecer de verdade baixe temporariamente os
limites em `backend/openweather.py`:

```python
LIMITE_VENTO_MS = 1.0        # em vez de 17.0
LIMITE_CHUVA_1H_MM = 0.1     # em vez de 30.0
```

**Não esqueça de voltar os valores originais depois do teste.**

---

## Teste 2 — Gatilho manual

**Objetivo:** provar que a prefeitura consegue disparar um alerta na mão.

### 2.1 Pelo painel do site

1. Abra <http://localhost:3000>.
2. Preencha o formulário **"🚨 Disparar Alerta Meteorológico"**:
   - Tipo: `Enchente`
   - Prioridade: `Crítica`
   - Município: `Taubaté`
   - Endereço: `Av. Tiradentes, altura do nº 500`
   - Descrição: `Rio Paraíba transbordou. Evacuar imediatamente as margens.`
3. Clique em **Registrar e Disparar Alerta**.

O próprio painel mostra o relatório de entrega por canal:

```
Alerta disparado: [CRITICA] Alerta de Enchente - Taubaté
🖥️ Site: 1 navegador(es) receberam o pop-up
💬 WhatsApp: 2/2 mensagens enviadas
📱 App: 1/1 aparelhos notificados
💾 Banco: registrado
```

### 2.2 Pela API (sem interface)

```powershell
curl.exe -X POST http://localhost:8000/api/alertas/disparar `
  -H "Content-Type: application/json" `
  -d "{\"tipo\":\"Deslizamento\",\"prioridade\":\"ALTA\",\"municipio\":\"Taubate\",\"endereco\":\"Bairro Alto\",\"descricao\":\"Encosta instavel apos chuva continua.\"}"
```

No Linux/macOS/Git Bash:

```bash
curl -X POST http://localhost:8000/api/alertas/disparar \
  -H "Content-Type: application/json" \
  -d '{"tipo":"Deslizamento","prioridade":"ALTA","municipio":"Taubate","endereco":"Bairro Alto","descricao":"Encosta instavel apos chuva continua."}'
```

### 2.3 Confirmar a gravação no banco

```sql
select tipo, prioridade, municipio, statusatual, criado_em
from alertas_tempo_real
order by criado_em desc
limit 3;
```

> **Produção:** defina `ADMIN_TOKEN` no `.env` do backend e
> `NEXT_PUBLIC_ADMIN_TOKEN` no `web/.env.local`. Sem o header
> `X-Pluvite-Token`, o endpoint passa a responder `401`.

---

## Teste 3 — Pop-up no site (WebSocket)

**Objetivo:** provar que o alerta aparece sem recarregar a página.

### 3.1 Conexão

1. Abra <http://localhost:3000> em **duas abas** (pode ser em páginas
   diferentes — o pop-up está no layout raiz, vale para o site inteiro).
2. Em desenvolvimento, um **pontinho verde** no canto inferior esquerdo indica
   WebSocket conectado; amarelo = reconectando.
3. Confirme no backend:

```powershell
curl.exe http://localhost:8000/api/status
```

`"navegadores_conectados": 2`.

No console do navegador (F12 → Network → WS) deve haver uma conexão
`ws://localhost:8000/ws/alertas` com status 101.

### 3.2 Recebimento em tempo real

Com as abas abertas e **sem tocar nelas**, dispare pelo terminal (passo 2.2).
O pop-up deve surgir nas duas abas em menos de 1 segundo, com:

- faixa colorida conforme a prioridade (vermelho `CRITICA`, laranja `ALTA`,
  amarelo `MEDIA`, azul `BAIXA`);
- Localização, Endereço/Região, Nível de Prioridade, Status Atual e Descrição
  — exatamente os campos do modelo `notificacao_popup/popups.py`;
- botão **Estou Ciente**.

### 3.3 Comportamentos a validar

| Situação | Esperado |
|---|---|
| Clicar em "Estou Ciente" | Pop-up fecha e **não** reaparece (id salvo no `localStorage`) |
| Tecla `Esc` | Mesmo efeito do botão |
| Abrir o site **depois** do alerta | Pop-up aparece assim que a página carrega (busca em `/api/alertas/ultimo`) |
| Alerta com mais de 6h | Não abre sozinho |
| Derrubar o backend (Ctrl+C) | Pontinho fica amarelo; ao voltar, reconecta em ~5s |
| Recarregar a página (F5) | Se já clicou em "Estou Ciente", não reaparece |

> Para repetir o teste do zero, limpe o histórico local no console do
> navegador: `localStorage.removeItem('pluvite:alertas-vistos')`.

### 3.4 Teste isolado do WebSocket

No console do navegador (qualquer página):

```js
const ws = new WebSocket("ws://localhost:8000/ws/alertas");
ws.onmessage = (e) => console.log("recebido:", JSON.parse(e.data));
```

Dispare um alerta e observe o objeto chegando com `evento: "alerta_emergencia"`.

---

## Teste 4 — Chatbot WhatsApp via QR

O chatbot Node em `web/app/python/chatbot/` conecta ao WhatsApp Web pelo QR e
responde à mensagem privada `pluvite` com a apresentação do assistente.

```powershell
cd web\app\python\chatbot
npm install
node chatbot.js
```

Escaneie o QR pelo WhatsApp em **Aparelhos conectados**, envie `pluvite` para
a conta conectada e confirme a resposta. A sessão fica salva localmente em
`chatbot/.wwebjs_auth/`; `Ctrl+C` encerra o processo sem desvincular a conta.

**Limitação atual:** este chatbot ainda não está ligado ao `dispatcher` de
alertas. O canal WhatsApp do backend Python fica desativado por padrão; enviar
alertas por ele ainda exige integrar o chatbot ao despachante e aplicar o
filtro de cidadãos autorizados.

---

## Teste 5 — App mobile (push + modal na tela inicial)

### 5.1 Pré-requisito: build de desenvolvimento

⚠️ Desde o SDK 53 o **Expo Go não recebe push remoto**. Para testar o push de
verdade é preciso um *development build*:

```powershell
cd mobile\pluvite
npx eas init                  # cria o projectId (uma vez)
npx expo run:android          # build local, exige Android Studio
# ou, na nuvem:
npx eas build --profile development --platform android
```

**Firebase (FCM) para Android:**

1. <https://console.firebase.google.com> → criar projeto.
2. Adicionar app **Android** com o package `com.pluvite.app`
   (o mesmo de `app.json` → `expo.android.package`).
3. Baixar o `google-services.json` e salvar em `mobile/pluvite/`.
4. Acrescentar a linha no `app.json`, dentro de `expo.android`:

```json
"googleServicesFile": "./google-services.json"
```

5. Enviar a credencial para o Expo: `npx eas credentials` → Android →
   **Push Notifications: FCM V1** → subir o JSON da conta de serviço
   (Firebase → ⚙️ → Contas de serviço → Gerar nova chave privada).

### 5.2 Registrar o aparelho

1. Rode o app no celular físico (emulador não recebe push).
2. Aceite a permissão de notificação que aparece na primeira abertura.
3. No terminal do Metro deve aparecer:

```
[push] Token registrado: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
```

4. Confirme a gravação:

```sql
select push_token, plataforma, ativo from dispositivos;
```

Se preferir não depender do banco, copie o token para o `.env` do backend:

```
PUSH_TOKENS_TESTE=ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
```

### 5.3 Testar o push isoladamente (sem o backend)

Ferramenta oficial: <https://expo.dev/notifications> — cole o token, preencha
título/corpo e envie. Ou por linha de comando:

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "title": "🚨 ENCHENTE — Taubaté",
    "body": "Rio transbordou. Evacuar as margens.",
    "channelId": "alertas-emergencia",
    "priority": "high",
    "sound": "default",
    "data": {
      "tipo_evento": "alerta_emergencia",
      "alerta": {
        "id": "teste-1",
        "tipo": "Enchente",
        "prioridade": "CRITICA",
        "municipio": "Taubaté",
        "endereco": "Av. Tiradentes",
        "descricao": "Rio Paraíba transbordou. Evacuar imediatamente as margens.",
        "statusatual": "Ativo",
        "criado_em": "2026-09-25T18:00:00Z",
        "origem": "manual",
        "titulo": "[CRITICA] Alerta de Enchente - Taubaté",
        "mensagem": "",
        "rotulo_severidade": "ALERTA VERMELHO — Perigo Extremo",
        "icone": "🚨",
        "cor": "#b91c1c",
        "botao": "Estou Ciente"
      }
    }
  }'
```

**Com o celular bloqueado**, a tela deve acender, tocar e vibrar (canal
`alertas-emergencia` com importância máxima).

### 5.4 Testar pelo fluxo completo

Dispare pelo painel (passo 2.1) e valide os três cenários:

| Estado do app | Esperado |
|---|---|
| **Fechado** | Notificação nativa; ao tocar, o app abre já com o **modal** do alerta na tela |
| **Aberto** (aba Clima) | Modal aparece na hora, sem push — chega pelo WebSocket |
| **Em segundo plano** | Notificação na bandeja; ao voltar, o modal está aberto |

### 5.5 Tela inicial (in-app)

Na aba **Clima** (tela inicial após o login):

- **Card em destaque** no topo, com barra lateral na cor da severidade,
  prioridade, tipo, município e resumo. Ele continua visível mesmo depois de
  fechar o modal, enquanto o alerta valer (6h).
- **Tocar no card** reabre o modal completo.
- O **modal** traz: tipo, Localização, Endereço/Região, Nível de Prioridade,
  Status Atual, Descrição do Ocorrido e o botão **Estou Ciente**.

### 5.6 Testar sem push configurado

Dá para validar toda a parte visual sem Firebase, porque o app também recebe
pelo **WebSocket** e consulta `/api/alertas/ultimo` ao abrir:

1. Garanta que o celular e o PC estão na **mesma rede Wi-Fi**.
2. Suba o projeto com `npm run dev`; o backend já escuta na rede toda.
3. Se o app não achar o backend sozinho, fixe o IP em `app.json`:

```json
"extra": { "apiAlertas": "http://192.168.0.10:8000" }
```

4. Libere a porta 8000 no firewall do Windows, se necessário:

```powershell
New-NetFirewallRule -DisplayName "Pluvite API" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

5. Abra o app e dispare um alerta — o modal aparece sem nenhum push envolvido.

---

## Teste 6 — Validação integrada (site e app; chatbot separado)

Cenário final de homologação:

1. **Prepare o ambiente:**
   - site, Express e backend Python iniciados com `npm run dev`;
   - site aberto em uma aba (pontinho verde);
   - app aberto no celular, na aba Clima;
   - o chatbot pode ser testado separadamente conforme o Teste 4.

2. **Dispare** pelo painel do site com prioridade `CRITICA`.

3. **Confira, em menos de 5 segundos:**

   | Canal | Evidência |
   |---|---|
   | 🖥️ Site | Pop-up vermelho sobre a página, sem reload |
   | 💬 WhatsApp | Fora deste fluxo; chatbot ainda não recebe os alertas |
   | 📱 App | Modal aberto + card no topo da tela inicial |
   | 💾 Banco | Nova linha em `alertas_tempo_real` |

4. **Confira o relatório** devolvido pelo painel — os três canais devem
   aparecer com `ok`.

5. **Teste de resiliência:** desligue o WhatsApp (`WHATSAPP_PROVEDOR=off`),
   reinicie e dispare de novo. Site e app continuam recebendo; o relatório
   mostra apenas o WhatsApp como não enviado. Nenhum canal derruba os outros.

---

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Pop-up não aparece, pontinho amarelo | Backend fora do ar ou porta errada | `curl http://localhost:8000/api/status`; ajuste `NEXT_PUBLIC_API_ALERTAS` |
| `CORS policy` no console do navegador | Origem não liberada | Inclua a URL em `CORS_ORIGENS` no `.env` |
| Alerta dispara uma vez e para | Cooldown de 3h | Use `?forcar=true` ou reduza `MONITOR_COOLDOWN_SEGUNDOS` |
| `Falha ao gravar alerta no Supabase` | RLS bloqueando a escrita | Rode `sql/alertas.sql`; em produção prefira a `service_role key` |
| WhatsApp "nenhum numero cadastrado" | `cidadao.telefone` vazio | Preencha o telefone ou use `WHATSAPP_NUMEROS_TESTE` |
| `[push] Push notification so funciona em aparelho fisico` | Emulador | Use um celular real |
| `[push] Não foi possível gerar o token` | Falta `projectId` do EAS | `npx eas init` e refaça o build |
| Push não chega, mas o Expo diz "ok" | Credencial FCM ausente | `npx eas credentials` → FCM V1 |
| App não acha o backend | IP errado / firewall | Fixe `extra.apiAlertas` e libere a porta 8000 |

---

## Checklist de homologação

- [ ] `sql/alertas.sql` executado no Supabase
- [ ] Backend Python sobe sem erro e `/api/status` responde
- [ ] Mock do OpenWeather dispara alerta automático (`Teste 1`)
- [ ] Céu limpo **não** dispara alerta (`Teste 1.3`)
- [ ] Cooldown impede alerta duplicado
- [ ] Disparo manual pelo painel funciona (`Teste 2.1`)
- [ ] Disparo manual pela API funciona (`Teste 2.2`)
- [ ] Alerta gravado em `alertas_tempo_real`
- [ ] Pop-up aparece em tempo real, sem reload (`Teste 3.2`)
- [ ] Pop-up aparece para quem abre o site depois (`Teste 3.3`)
- [ ] "Estou Ciente" não reaparece após F5
- [ ] WebSocket reconecta sozinho após queda do backend
- [ ] WhatsApp chega formatado (`Teste 4.2`)
- [ ] WhatsApp respeita os telefones da tabela `cidadao` (`Teste 4.3`)
- [ ] Token de push registrado em `dispositivos` (`Teste 5.2`)
- [ ] Push acende a tela do celular bloqueado (`Teste 5.3`)
- [ ] Modal abre na tela inicial ao tocar na notificação (`Teste 5.4`)
- [ ] Card de destaque fica na tela inicial e reabre o modal (`Teste 5.5`)
- [ ] Os 3 canais disparam juntos (`Teste 6`)
- [ ] Falha de um canal não derruba os outros (`Teste 6.5`)
- [ ] Nenhuma referência a SMS/Twilio no código (`grep -ri "twilio\|sms" web/app mobile/pluvite/src`)

# Guia de homologação — Ecossistema de Alertas Pluvite

Roteiro passo a passo para validar os alertas nos três canais: pop-up no site,
WhatsApp (chatbot conectado por QR) e app mobile. Um único `npm run dev` sobe
tudo, inclusive o chatbot — o alerta disparado no site sai sozinho no WhatsApp.

> Todos os comandos assumem a raiz do repositório (`Pluvite/`) como ponto de
> partida. No Windows, use o PowerShell.

---

## Visão geral do que foi construído

```
                    ┌──────────────────────────────┐
  OpenWeather ─────►│                              │──► WebSocket  ──► Pop-up no site
  (rotina 1 hora)   │   dispatcher.disparar_alerta │──► WhatsApp   ──► chatbot QR (inscritos)
  Painel web  ─────►│   (ponto central, asyncio)   │──► FCM Push   ──► Android nativo
  (/Servidor)       └──────────────────────────────┘
                                  │
                                  └──► Supabase: alertas_tempo_real

  WhatsApp: dispatcher ──► chatbot.js (127.0.0.1:3010) ──► quem mandou "pluvite"
```

Arquivos principais:

| Pasta | Arquivo | Papel |
|---|---|---|
| backend python | `web/app/python/backend/dispatcher.py` | Ponto central de disparo |
| backend python | `web/app/python/backend/openweather.py` | Gatilho automático |
| backend python | `web/app/python/backend/main.py` | WebSocket + rotas REST |
| backend python | `web/app/python/backend/canais/*` | Um módulo por canal |
| chatbot | `web/app/python/chatbot/chatbot.js` | Sessão WhatsApp por QR, inscritos e envio |
| web | `web/app/components/AlertaPopup.tsx` | Pop-up em tempo real |
| web | `web/app/Servidor/page.tsx` | Gatilho manual (painel) |
| mobile | `mobile/pluvite/src/services/notificacoes.ts` | Push nativo |
| mobile | `mobile/pluvite/src/components/AlertaEmergenciaModal.tsx` | Modal na tela inicial |

---

## Passo 0 — Preparação (fazer uma vez)

### 0.1 Backend Python

```powershell
cd web\app\python
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Copie `.env.example` para `.env` (se ainda não existir) e preencha ao menos
`SUPABASE_URL`, `SUPABASE_KEY` e `OPENWEATHER_KEY`. Push pode ficar vazio por
enquanto — o canal reporta "não configurado" e os outros continuam funcionando.

Para o WhatsApp, no mesmo `.env`:

```
WHATSAPP_PROVEDOR=qr
CHATBOT_TOKEN=um-texto-secreto-qualquer
```

E instale as dependências do chatbot (uma vez):

```powershell
cd web\app\python\chatbot
npm install
```

Com `WHATSAPP_PROVEDOR=off`, o chatbot apenas avisa que está desligado e o
resto do projeto sobe normalmente.

O backend é iniciado junto com o site no passo 0.2. Não inicie outro Uvicorn
manualmente, pois ele tentará usar a mesma porta 8000.

O padrão monitora os **39 municípios do Vale do Paraíba e Litoral Norte** uma
vez por hora (`MONITOR_INTERVALO_SEGUNDOS=3600`). Isso usa ao menos 39
consultas de clima por ciclo e até 39 chamadas adicionais do One Call (até
1.872 chamadas/dia, se esse endpoint estiver habilitado). Confira a cota do seu
plano OpenWeather antes de aumentar a frequência.

### Executar os testes automatizados (Windows PowerShell)

Com as dependências instaladas no passo 0.1, a partir da raiz do repositório:

```powershell
cd web\app\python
.\.venv\Scripts\Activate.ps1
python -m unittest discover -s tests -p "test_openweather.py" -v
python -m unittest discover -s tests -p "test_whatsapp.py" -v
python -m unittest discover -s tests -p "test_main.py" -v
node --check chatbot\chatbot.js
```

Os comandos Python executam os testes do monitor OpenWeather, da formatação
WhatsApp e da consulta do último alerta real. O último comando verifica a
sintaxe do chatbot. Para validar a integração dos canais, siga os Testes 1 a 6.

Ao iniciar o projeto, você deve ver:

```
Monitor OpenWeather ativo - cidades: Aparecida, Arapeí, ... | intervalo: 3600s
Uvicorn running on http://0.0.0.0:8000
```

Teste rápido: abra <http://localhost:8000/api/status>. Deve responder um JSON
com `navegadores_conectados: 0`.

### 0.2 Site (Next.js)

Na raiz do repositório:

```powershell
cd web
npm install
npm run dev
```

Esse comando inicia, no mesmo terminal, quatro processos:

| Prefixo | Processo |
|---|---|
| `[web]` | Next.js em <http://localhost:3000> |
| `[api]` | Express em `:3001` |
| `[alertas]` | Uvicorn (backend Python) em `0.0.0.0:8000` |
| `[whatsapp]` | Chatbot WhatsApp (QR + API local em `127.0.0.1:3010`) |

Na primeira vez o `[whatsapp]` mostra um QR Code: escaneie pelo WhatsApp do
número que vai **enviar** os alertas (**Aparelhos conectados → Conectar um
aparelho**). Depois a sessão fica salva e ele conecta sozinho. Espere:

```
[whatsapp] ✅ Tudo certo! WhatsApp conectado.
[whatsapp] 📋 Inscritos nos alertas: 0
```

O que você digitar nesse terminal vai para o chatbot (ex.: `logout`). Confira
<http://localhost:8000/api/status>.

Se o backend Python não estiver em `http://localhost:8000`, crie
`web/.env.local`:

```
NEXT_PUBLIC_API_ALERTAS=http://192.168.0.10:8000
```

### 0.3 App mobile (React Native nativo)

```powershell
cd mobile\pluvite
npm install
npm run android
```

Para abrir pela interface, inicie o Android Studio e escolha
**Open** → `mobile/pluvite/android`. Configure um emulador ou conecte um
aparelho Android com depuração USB habilitada. O guia de configuração completo
está em `mobile/pluvite/README.md`.

---

## Teste 1 — Gatilho automático (mock do OpenWeather)

**Objetivo:** validar a classificação da emergência pelo monitor sem enviar
uma simulação à população.

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
```

O mock serve para testar somente a classificação: não grava alertas nem envia
popup, WhatsApp ou push. Para conferir o visual, use **Testar popup
(simulação)** no painel do servidor; essa prévia aparece só na própria tela.

### 1.2 Forçar um ciclo sem esperar o próximo monitoramento

Configure um `ADMIN_TOKEN` não vazio no `.env` do backend e reinicie o serviço
para chamar a rota por script. Um admin autenticado também pode usar essa rota.

```powershell
$adminToken = "<ADMIN_TOKEN configurado no .env>"
curl.exe -X POST "http://localhost:8000/api/monitor/verificar-agora?forcar=true" `
  -H "X-Pluvite-Token: $adminToken"
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
      "disparados": [],
      "simulados": ["[SIMULAÇÃO] [Alerta Máximo] Alerta de Tempestade - Taubate"]
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

### 1.4 Executar o monitor com dados reais

No `.env`, configure uma chave válida e desligue o mock:

```
MOCK_OPENWEATHER=false
OPENWEATHER_KEY=sua-chave-real
MONITOR_CIDADES=Taubaté
```

Reinicie `npm run dev` e force uma consulta:

```powershell
$adminToken = "<ADMIN_TOKEN configurado no .env>"
curl.exe -X POST "http://localhost:8000/api/monitor/verificar-agora?forcar=true" `
  -H "X-Pluvite-Token: $adminToken"
```

O monitor consulta as condições atuais. Se elas não atingirem os critérios de
emergência, a resposta correta é `"emergencia": false` e nenhum alerta real
será gravado. Não reduza os limites no código para simular uma emergência:
use o Teste 1 com mock para validar disparos previsíveis. Alertas reais e
manuais ficam identificados separadamente no banco.

---

## Teste 2 — Gatilho manual

**Objetivo:** provar que a prefeitura consegue disparar um alerta na mão.

### 2.1 Pelo painel do site

1. Entre em <http://localhost:3000/login> com uma conta de servidor ou admin e abra
   <http://localhost:3000/Servidor>. Servidores ficam restritos ao município do perfil; admins
   podem selecionar um dos municípios autorizados.
2. Preencha o formulário **"Emitir alerta manual"**:
   - Tipo: `Enchente`
   - Prioridade: `Alerta Máximo`
   - Município: preenchido pelo perfil do servidor ou selecionado pelo admin
   - Endereço: `Av. Tiradentes, altura do nº 500`
   - Descrição: `Rio Paraíba transbordou. Evacuar imediatamente as margens.`
4. Clique em **Revisar alerta real**, confira os dados e só então confirme o
   envio. A tela apresenta o resultado de cada canal e o histórico do município.

O próprio painel mostra o relatório de entrega por canal:

```
Alerta disparado: [CRITICA] Alerta de Enchente - Taubaté
🖥️ Site: 1 navegador(es) receberam o pop-up
💬 WhatsApp: 1/1 mensagens enviadas
📱 App: 1/1 aparelhos notificados
💾 Banco: registrado
```

### 2.2 Pela API (sem interface)

O endpoint aceita o `access_token` da sessão de uma conta servidor ou admin.
Servidores ficam limitados ao próprio município; admins podem escolher qualquer
município da lista oficial. Scripts de backend também podem usar o `ADMIN_TOKEN`.
Use a simulação da interface para conferir o visual sem enviar alertas reais.
Não coloque tokens em arquivos versionados nem compartilhe-os.

```powershell
$accessToken = "<access_token da sessão Supabase>"
curl.exe -X POST http://localhost:8000/api/alertas/disparar `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $accessToken" `
  -d "{\"tipo\":\"Deslizamento de terra\",\"prioridade\":\"Estado de Alerta\",\"municipio\":\"Taubaté\",\"endereco\":\"Bairro Alto\",\"descricao\":\"Encosta instável após chuva contínua.\"}"
```

No Linux/macOS/Git Bash:

```bash
access_token="<access_token da sessão Supabase>"
curl -X POST http://localhost:8000/api/alertas/disparar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $access_token" \
  -d '{"tipo":"Deslizamento de terra","prioridade":"Estado de Alerta","municipio":"Taubaté","endereco":"Bairro Alto","descricao":"Encosta instável após chuva contínua."}'
```

### 2.3 Prévia sem envio real

No painel, preencha os campos e clique em **Testar popup (simulação)**. A
prévia marcada como teste aparece somente na tela do servidor: não é transmitida
por WebSocket, não grava no banco e não aciona WhatsApp ou push.

### 2.4 Confirmar a gravação no banco

```sql
select tipo, prioridade, municipio, origem, statusatual, criado_em
from alertas_tempo_real
order by criado_em desc
limit 3;
```

> O backend valida o perfil Supabase. Servidores só operam no próprio município; admins podem
> escolher um município cadastrado. Scripts podem usar `ADMIN_TOKEN`, que nunca deve ser enviado
> ao navegador. A verificação do monitor também exige uma conta admin quando não usa esse token.

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

- faixa colorida conforme a prioridade (verde `Zona Segura`, amarelo
  `Atenção Crítica`, vermelho `Estado de Alerta`, roxo `Alerta Máximo`);
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
const ws = new WebSocket("ws://localhost:8000/ws/alertas?municipio=Taubat%C3%A9");
ws.onmessage = (e) => console.log("recebido:", JSON.parse(e.data));
```

Dispare um alerta para Taubaté e observe o objeto chegando com
`evento: "alerta_emergencia"`. Repita com outro navegador inscrito em Ubatuba:
ele não deve receber o alerta de Taubaté. Sem município ou com município fora
da lista oficial, o servidor deve recusar a conexão.

---

## Teste 4 — WhatsApp automático (chatbot QR)

**Objetivo:** provar que o alerta disparado no site chega sozinho no WhatsApp
de quem pediu, sem abrir outro terminal.

**Quem recebe:** só os contatos que mandaram `pluvite` no privado do WhatsApp
conectado e escolheram um município (mais os números opcionais de
`WHATSAPP_NUMEROS_TESTE`). Cada alerta é entregue apenas aos inscritos na
cidade correspondente. Os telefones da tabela `cidadao` **não** são usados
nesse modo.

### 4.1 Conectar

Com `npm run dev` rodando (passo 0.2), o `[whatsapp]` deve mostrar
`✅ Tudo certo! WhatsApp conectado.` Confira em
<http://localhost:8000/api/status>:

```json
"whatsapp_provedor": "qr",
"whatsapp_chatbot": { "online": true, "conectado": true, "inscritos": 0 }
```

### 4.2 Inscrever um celular

De **outro** celular, mande `pluvite` para o número conectado. O chatbot pede
o município desejado; responda com um dos 39 nomes para concluir a inscrição.
O terminal mostra:

```
[whatsapp] ➕ Novo inscrito aguardando escolha de cidade (1 no total)
```

> Mensagens enviadas pela própria conta conectada são ignoradas. Para testar
> com um celular só, coloque o seu número em `WHATSAPP_NUMEROS_TESTE`
> (`5512XXXXXXXXX`) e reinicie o `npm run dev`; o alerta chega na conversa
> **"Você"** do WhatsApp.

### 4.3 Disparar pelo site (pop-up + WhatsApp juntos)

1. Abra o site em uma aba (pontinho verde = WebSocket conectado).
2. Em outra aba, logado como servidor ou admin, abra <http://localhost:3000/Servidor> e dispare
   um alerta (passo 2.1).
3. Confira:

| Onde | Evidência |
|---|---|
| Aba do site | Pop-up do alerta, sem recarregar |
| Celular inscrito | Mensagem `🚨 *PLUVITE — ...*` com tipo, local, prioridade e descrição |
| Terminal | `[whatsapp] 📤 Alerta enviado para 55...@c.us` |
| Relatório do painel | `💬 WhatsApp: 1/1 mensagens enviadas` |

O alerta automático do OpenWeather (Teste 1) segue o mesmo caminho e também
chega no WhatsApp.

### 4.4 Perguntar pelo último alerta real do OpenWeather

O chatbot responde a perguntas como **"Qual foi o último alerta real do
OpenWeather?"** consultando apenas alertas gravados pelo monitoramento com a
API real. Disparos manuais e alertas simulados no Teste 1 não entram nessa
resposta. A consulta funciona em conversa privada, mesmo antes de escolher
município para receber alertas.

1. No `.env`, defina `MOCK_OPENWEATHER=false` e informe uma chave válida em
   `OPENWEATHER_KEY`; reinicie `npm run dev`.
2. Consulte <http://localhost:8000/api/alertas/ultimo-openweather>. A resposta
   terá `"alerta": null` se nenhum alerta real foi registrado desde que a
   origem passou a ser gravada. Registros antigos sem origem não podem ser
   classificados retroativamente.
3. De outro celular, pergunte **"Qual foi o último alerta real do OpenWeather?"**.
   Com um registro, a resposta mostra tipo, município, prioridade, horário de
   registro e descrição. Sem registro, informa que ainda não há alerta real.
4. Para tentar gerar um registro usando condições atuais, execute o ciclo do
   passo 1.4. O alerta só será criado se o clima real atingir os critérios;
   mock e disparo manual não servem para validar essa consulta.

O texto *registrado pelo Pluvite* indica quando o monitoramento detectou e
disparou a notificação; não é o horário original de emissão de um comunicado
oficial externo.

### 4.5 Teste só do WhatsApp (sem banco, site ou push)

Em outro terminal, com o `npm run dev` rodando:

```powershell
cd web\app\python
.\.venv\Scripts\Activate.ps1
python -m backend.canais.whatsapp
```

O inscrito recebe "🧪 PLUVITE — TESTE" e a resposta mostra `"enviados": 1`.

### 4.6 Sair e logout

| Ação | Esperado |
|---|---|
| Inscrito manda `sair` | Recebe confirmação; `➖ Inscrito saiu` no terminal; não recebe mais alertas |
| Inscrito manda `pluvite` de novo | Volta a receber (sem duplicar) |
| `Ctrl+C` e `npm run dev` de novo | Conecta sem QR; a lista de inscritos é mantida |
| Digitar `logout` no terminal do `npm run dev` | `🧹 Lista de inscritos nos alertas apagada.` e um **QR novo** aparece |
| Desconectar pelo celular (Aparelhos conectados) | Lista apagada e QR novo no terminal |

A lista fica em `web/app/python/chatbot/inscritos.json` (ignorada pelo git).

> **Atenção:** o envio usa uma sessão do WhatsApp Web (não oficial). Use um
> número dedicado; envios em massa podem levar a bloqueio. Por isso as
> mensagens saem uma por vez (`CHATBOT_INTERVALO_SEGUNDOS=2`).

---

## Teste 5 — App mobile (push + modal na tela inicial)

### 5.1 Pré-requisito: Android Studio e Firebase

1. Instale Android Studio, Android SDK 36, JDK 17 e crie/inicie um emulador
   (ou conecte um Android com depuração USB).
2. Abra `mobile/pluvite/android` no Android Studio e aguarde o Gradle sincronizar.
3. Para push remoto, crie um projeto em <https://console.firebase.google.com>
   e adicione um app Android com o package `com.pluvite.app`.
4. Baixe o `google-services.json` e coloque em
   `mobile/pluvite/android/app/google-services.json`.
5. Em Firebase → **Configurações do projeto → Contas de serviço**, gere uma
   chave privada de conta de serviço. Salve-a como
   `web/app/python/firebase-service-account.json` (arquivo ignorado pelo Git).
6. No `.env` do backend, configure:

```
PUSH_ATIVO=true
FCM_SERVICE_ACCOUNT_FILE=firebase-service-account.json
```

Sem os arquivos Firebase, é possível compilar e abrir o app e testar os alertas
em primeiro plano pelo WebSocket; o push remoto fica indisponível.

### 5.2 Registrar o aparelho

1. Rode o app pelo Android Studio ou com `npm run android`.
2. Aceite a permissão de notificação que aparece na primeira abertura.
3. Com o backend ligado, o terminal Metro deve indicar que o token FCM foi
   registrado:

```
[push] Token FCM registrado.
```

4. Confirme a gravação:

```sql
select push_token, plataforma, municipio, ativo from dispositivos;
```

No app, abra **Perfil → Notificações**, escolha o município e salve. O aparelho
receberá push somente para alertas dessa cidade; sem escolha, não recebe push
de alertas municipais.

Se preferir testar sem depender do banco, copie o token FCM completo do
dispositivo para `.env`:

```
PUSH_TOKENS_TESTE=token_fcm_do_dispositivo
```

### 5.3 Testar push pelo fluxo completo

Dispare pelo painel (passo 2.1) e valide os cenários:

| Estado do app | Esperado |
|---|---|
| **Fechado** | FCM mostra notificação; ao tocar, o app abre no alerta quando autenticado e inscrito na cidade |
| **Aberto** (aba Clima) | Modal de alerta aparece imediatamente |
| **Em segundo plano** | Notificação aparece na bandeja; ao tocar, abre o app e mostra o modal |

Com o aparelho bloqueado, valide som e vibração. A notificação Android usa o
canal `alertas-emergencia` de alta importância.

### 5.4 Tela de alerta no app

Na aba **Clima** (tela inicial após login), o modal segue a apresentação do
popup do site:

- **Card em destaque** no topo, com barra lateral na cor da severidade,
  prioridade, tipo, município e resumo. Ele continua visível mesmo depois de
  fechar o modal, enquanto o alerta valer (6h).
- **Tocar no card** reabre o modal completo.
- O **modal** traz: tipo, Localização, Endereço/Região, Nível de Prioridade,
  Status Atual, Descrição do Ocorrido e o botão **Estou Ciente**.

### 5.5 Testar sem Firebase configurado

Dá para validar o modal sem FCM, pois o app também recebe pelo **WebSocket** e
consulta `/api/alertas/ultimo` ao abrir:

1. Garanta que o celular e o PC estão na **mesma rede Wi-Fi**.
2. Suba o projeto com `npm run dev`; o backend já escuta na rede toda.
3. Para emulador, o backend é acessado por `http://10.0.2.2:8000`. Em aparelho
   físico, ajuste `API_ALERTAS` em `src/lib/configuracao.ts` para o IP do PC.

4. Libere a porta 8000 no firewall do Windows, se necessário:

```powershell
New-NetFirewallRule -DisplayName "Pluvite API" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

5. Abra o app e dispare um alerta — o modal aparece sem nenhum push envolvido.

---

## Teste 6 — Validação integrada (site, WhatsApp e app)

Cenário final de homologação:

1. **Prepare o ambiente:**
   - tudo iniciado com `npm run dev` (`[whatsapp]` conectado);
   - site aberto em uma aba (pontinho verde);
   - um celular inscrito no WhatsApp (mandou `pluvite`);
   - app aberto no celular, na aba Clima.

2. **Dispare** pelo painel do site com prioridade `CRITICA`.

3. **Confira, em menos de 5 segundos:**

   | Canal | Evidência |
   |---|---|
   | 🖥️ Site | Pop-up vermelho sobre a página, sem reload |
   | 💬 WhatsApp | Mensagem do alerta no celular inscrito |
   | 📱 App | Modal aberto + card no topo da tela inicial |
   | 💾 Banco | Nova linha em `alertas_tempo_real` |

4. **Confira o relatório** devolvido pelo painel — os três canais devem
   aparecer com `ok`.

5. **Teste de resiliência:** desligue o WhatsApp (`WHATSAPP_PROVEDOR=off`),
   reinicie o `npm run dev` e dispare de novo. Site e app continuam recebendo; o relatório
   mostra apenas o WhatsApp como não enviado. Nenhum canal derruba os outros.

---

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Pop-up não aparece, pontinho amarelo | Backend fora do ar ou porta errada | `curl http://localhost:8000/api/status`; ajuste `NEXT_PUBLIC_API_ALERTAS` |
| `CORS policy` no console do navegador | Origem não liberada | Inclua a URL em `CORS_ORIGENS` no `.env` |
| Alerta dispara uma vez e para | Cooldown de 3h | Use `?forcar=true` ou reduza `MONITOR_COOLDOWN_SEGUNDOS` |
| `Falha ao gravar alerta no Supabase` | Permissões RLS ou configuração de acesso incorreta | Verifique as políticas de acesso no Supabase; em produção prefira a `service_role key` |
| WhatsApp `nenhum inscrito` | Ninguém mandou `pluvite` | Mande `pluvite` de outro celular ou use `WHATSAPP_NUMEROS_TESTE` |
| WhatsApp `chatbot QR indisponivel` | `[whatsapp]` não subiu | Veja a mensagem dele no terminal; rode `npm install` em `web/app/python/chatbot` |
| `[whatsapp] WhatsApp por QR desligado` | `WHATSAPP_PROVEDOR` diferente de `qr` | Ajuste o `.env` e reinicie |
| WhatsApp `Token inválido` / `401` | `CHATBOT_TOKEN` mudou com tudo rodando | Reinicie o `npm run dev` |
| WhatsApp `ainda não conectado` (503) | Sessão carregando ou QR não escaneado | Espere o `✅ WhatsApp conectado` ou escaneie o QR |
| `Não foi possível iniciar o WhatsApp` | Chrome/Edge não encontrado | Instale o Chrome ou defina `PUPPETEER_EXECUTABLE_PATH` |
| Push não registra token | Falta `google-services.json` ou Firebase sem inicializar | Confira o Firebase Android `com.pluvite.app` |
| Backend informa `FCM_SERVICE_ACCOUNT_FILE` ausente | Credencial do servidor não configurada | Configure o JSON de conta de serviço no `.env` |
| App físico não conecta ao backend | IP padrão é do emulador | Ajuste `API_ALERTAS` para o IP do PC e libere a porta 8000 |
| App não acha o backend | IP errado / firewall | Fixe `extra.apiAlertas` e libere a porta 8000 |

---

## Checklist de homologação

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
- [ ] Chatbot conecta pelo `npm run dev`, sem outro terminal (`Teste 4.1`)
- [ ] `pluvite` pede o município e inscreve o contato nessa cidade (`Teste 4.2`)
- [ ] Alerta do site chega no WhatsApp junto com o pop-up (`Teste 4.3`)
- [ ] Pergunta no WhatsApp retorna apenas o último alerta real (`Teste 4.4`)
- [ ] Mock e disparo manual não aparecem como alerta real (`Teste 4.4`)
- [ ] Só inscritos recebem; `sair` remove da lista (`Teste 4.6`)
- [ ] `logout` apaga os inscritos e mostra QR novo (`Teste 4.6`)
- [ ] Token de push registrado em `dispositivos` (`Teste 5.2`)
- [ ] Push acende a tela do celular bloqueado (`Teste 5.3`)
- [ ] Modal abre na tela inicial ao tocar na notificação (`Teste 5.4`)
- [ ] Card de destaque fica na tela inicial e reabre o modal (`Teste 5.5`)
- [ ] Os 3 canais disparam juntos (`Teste 6`)
- [ ] Falha de um canal não derruba os outros (`Teste 6.5`)
- [ ] Nenhuma referência a SMS/Twilio no código (`grep -ri "twilio\|sms" web/app mobile/pluvite/src`)

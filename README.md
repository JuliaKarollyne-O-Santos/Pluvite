# <img src="web/public/Pluvite-png-removebg.png.png" width="35" height="65" style="margin-right:3px;"/>luvite

Pluvite é uma plataforma desenvolvida para monitoramento de riscos climáticos, comunicação de alertas e participação cidadã durante eventos relacionados a desastres naturais.
O sistema permite que cidadãos acompanhem condições meteorológicas, recebam alertas em tempo real e reportem problemas de infraestrutura urbana, enquanto órgãos públicos podem monitorar ocorrências e gerenciar ações de resposta.

## Objetivo

Facilitar a comunicação entre população e prefeitura durante situações de risco, oferecendo informações climáticas, alertas preventivos e um canal para registro de ocorrências.

## Objetivos de Desenvolvimento Sustentável (ODS)

O Pluvite está alinhado aos seguintes Objetivos de Desenvolvimento Sustentável da ONU:

* **ODS 9 – Indústria, Inovação e Infraestrutura:** uso de tecnologia para monitorar e comunicar problemas na infraestrutura urbana.
* **ODS 11 – Cidades e Comunidades Sustentáveis:** fortalece a comunicação entre população e prefeitura, tornando as cidades mais seguras durante desastres.
* **ODS 13 – Ação Contra a Mudança Global do Clima:** alertas preventivos e monitoramento de riscos climáticos, como enchentes e deslizamentos.

## Como Rodar o Projeto

### Executando a Plataforma Web

1. Abra o terminal na pasta raiz do repositório e navegue até a pasta `web`:

```bash
cd web
```

2. Instale as dependências necessárias:

```bash
npm install
```

3. Crie um arquivo `.env.local` na raiz da pasta `web` e adicione as suas credenciais do Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=sua_url_do_supabase_aqui
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_do_supabase_aqui
```

   Opcional: para o trânsito ao vivo nas rotas, crie `web/app/backend/.env` com `TOMTOM_API_KEY=sua_chave_tomtom`
   (passo a passo, teste em campo e calibração em [`GUIA-TESTE-CAMPO-ROTAS.md`](GUIA-TESTE-CAMPO-ROTAS.md)).

4. Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

Acesse `http://localhost:3000` no seu navegador para visualizar.

### Executando o Aplicativo Mobile

**Pré-requisitos:** ter o [Android Studio](https://developer.android.com/studio) instalado, com o Android SDK configurado, e um emulador Android criado (ou um celular Android conectado por USB, com a depuração USB ativada).

1. Abra o terminal na pasta raiz do repositório e navegue até a pasta `mobile`:

```bash
cd mobile
```

2. Instale as dependências necessárias:

```bash
npm install
```

3. Abra o emulador pelo Android Studio (**Device Manager** → ▶) ou conecte o celular.

4. Inicie o servidor do React Native (Metro):

```bash
npx react-native start
```

5. Em outro terminal, também na pasta `mobile`, instale e abra o aplicativo no emulador ou celular:

```bash
npx react-native run-android
```

Também é possível abrir a pasta `mobile/android` no Android Studio e clicar em **Run ▶**.

## Funcionalidades

### Autenticação (Web e Mobile)

* Cadastro de usuários
* Login seguro
* Controle de acesso por perfil

### Mapa Interativo (Web)

* Visualização dos municípios monitorados
* Seleção de cidades através de busca
* Exibição de alertas por região
* Monitoramento geográfico em tempo real

### Clima (Web e Mobile)

* Consulta de condições meteorológicas
* Temperatura atual
* Umidade
* Velocidade do vento
* Previsão do tempo

### Alertas (Web e Mobile)

* Alertas climáticos em tempo real
* Notificações para regiões monitoradas
* Classificação de riscos

### <img src="web/public/whatsapp-icone.svg" width="26" height="26" align="top"/> Alertas via WhatsApp

Além do pop-up no site e do push no aplicativo, o Pluvite envia os alertas de risco pelo WhatsApp,
sem que o cidadão precise instalar nada ou ter o telefone cadastrado.

**Como o cidadão se inscreve**

1. Clica no botão vermelho do WhatsApp, ao lado do título na tela inicial ou na barra de navegação
   depois do login. Uma janela explica o passo a passo.
2. Em **Abrir WhatsApp**, a conversa com o número do Pluvite abre com a palavra **pluvite** já escrita.
   Basta enviar.
3. O assistente responde e pede o município. A pessoa responde com o nome da cidade (um dos 39 do
   Vale do Paraíba e Litoral Norte).
4. A partir daí, recebe os alertas daquela cidade. Comandos na conversa:
   * **CIDADE**: troca o município acompanhado
   * **SAIR**: para de receber os alertas
   * **"Qual foi o último alerta?"**: mostra o último alerta real do monitoramento climático

**Como o alerta chega**

* O alerta nasce de um servidor público, que dispara pelo painel `/Servidor`, ou do monitoramento
  automático do OpenWeather, que consulta os 39 municípios periodicamente.
* O backend de alertas (FastAPI, `web/app/python`) grava o alerta no Supabase e o distribui ao mesmo
  tempo para o site, para o aplicativo e para o WhatsApp.
* No WhatsApp, quem envia é um chatbot (`whatsapp-web.js`) conectado ao número do Pluvite por QR Code.
  Ele manda o alerta só aos inscritos da cidade afetada, uma mensagem por vez, para reduzir o risco de
  bloqueio do número.
* A mensagem traz prioridade, tipo, município, endereço/região, status, descrição e orientações de
  segurança.
* Em produção, a API roda no Render e o chatbot no computador conectado ao WhatsApp. O chatbot consulta
  a API de tempos em tempos e envia os alertas novos (modo `qr-poll`).
* No site, o botão do WhatsApp mostra um aviso nas instruções quando a cidade do usuário está em
  alerta.

Configuração e testes: [web/app/python/README.md](web/app/python/README.md) e
[GUIA-TESTES-ALERTAS.md](GUIA-TESTES-ALERTAS.md).

### Feed Comunitário e Participação (Web e Mobile)

* Visualização de publicações de ocorrências feitas pela população.
* No **Aplicativo Mobile**, os usuários podem enviar novas ocorrências direto do celular com:
  * Registro de localização atual.
  * **Upload de fotos tiradas na hora** para comprovar o incidente.

Relatos de:

* Alagamentos
* Buracos em vias públicas
* Deslizamentos
* Problemas de infraestrutura
* Outros incidentes urbanos

### Painel Administrativo (Web)

* Visualização das ocorrências reportadas
* Gestão de alertas
* Acompanhamento de indicadores
* Alteração de status das ocorrências:
  * Pendente
  * Em andamento
  * Resolvido
* Remoção automática das ocorrências resolvidas do feed público

### Dashboard do Servidor Público (Web)

* Quantidade de alertas ativos
* Estatísticas por Município
* Quantidade de ocorrências registradas
* Indicadores de risco
* Monitoramento em tempo real

## Tecnologias Utilizadas

<p>
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nextjs/nextjs-original.svg" alt="Next.js" title="Next.js" width="40" height="40"/>&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" alt="React" title="React" width="40" height="40"/>&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" alt="TypeScript" title="TypeScript" width="40" height="40"/>&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/tailwindcss/tailwindcss-original.svg" alt="Tailwind CSS" title="Tailwind CSS" width="40" height="40"/>&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/reactnative/reactnative-original.svg" alt="React Native" title="React Native" width="40" height="40"/>&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/androidstudio/androidstudio-original.svg" alt="Android Studio" title="Android Studio" width="40" height="40"/>&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/leaflet" alt="Leaflet" title="Leaflet" width="40" height="40"/>&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/lucide" alt="Lucide" title="Lucide" width="40" height="40"/>&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/supabase/supabase-original.svg" alt="Supabase" title="Supabase" width="40" height="40"/>&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/vercel/8B949E" alt="Vercel" title="Vercel" width="40" height="40"/>&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/render/8B949E" alt="Render" title="Render" width="40" height="40"/>
</p>

### Front-end (Web)

* **Next.js:** projeto organizado e melhor desempenho
* **React:** criação de componentes reutilizáveis
* **TypeScript:** desenvolvimento do site evitando erros
* **Tailwind CSS:** interface moderna e responsiva

### Mobile (Aplicativo)

* **React Native:** criação do aplicativo
* **Android Studio:** emulação e execução do aplicativo Android
* **Lucide React Native:** ícones do aplicativo

### Banco de Dados e Backend

* **Supabase:** autenticação, banco de dados relacional e armazenamento de fotos

### Hospedagem

* **Vercel:** hospedagem do site
* **Render:** hospedagem dos backends web e de alertas

### APIs

* **WeatherAPI:** dados meteorológicos em tempo real

### Bibliotecas

* **Leaflet** e **React Leaflet:** criação e design do mapa interativo
* **Lucide React:** ícones do site
* **Concurrently:** execução de mais de um processo ao mesmo tempo durante o desenvolvimento

## Público-Alvo

* Cidadãos
* Defesa Civil
* Prefeituras

## Principais Módulos

### Plataforma Web

* Login e Cadastro
* Clima
* Perfil do Usuário
* Mapa Interativo
* Feed Comunitário
* Alertas
* Dashboard Administrativo
* Rotas e Navegação
* Emergências e Contatos Úteis

### Aplicativo Mobile

* Login e Cadastro
* Clima
* Perfil do Usuário
* Feed Comunitário (com envio de fotos e localização)
* Alertas
* Rotas e Navegação
* Emergências e Contatos Úteis

## Equipe

| Integrante | Função | GitHub |
|---|---|---|
| **Julia Santos** | Scrum Master e Desenvolvedora Front-end | [@JuliaKarollyne-O-Santos](https://github.com/JuliaKarollyne-O-Santos) |
| **Ana Clara Pereira** | Product Owner e Desenvolvedora Back-end | [@AnaClara-S-Pereira](https://github.com/AnaClara-S-Pereira) |
| **Cauã Sant'anna** | Developer | [@cauamendrot292](https://github.com/cauamendrot292) |
| **Quezia Luiz** | Developer | [@QueziaQueren](https://github.com/QueziaQueren) |
| **Gabrielly Santos** | Developer | [@GabyzGit](https://github.com/GabyzGit) |

- **Orientador: Prof. Me. Gildárcio Souza Gonçalves**

## Projeto Acadêmico

Projeto acadêmico desenvolvido por alunos do **1º AMS** da **Fatec Taubaté (Faculdade de Tecnologia de Taubaté)**, na disciplina de Projeto Integrador I, para fins de estudo e avaliação.

O projeto foi desenvolvido para aplicação de:

* Desenvolvimento Web e Mobile
* Banco de Dados
* Geolocalização
* APIs
* Sistemas de Monitoramento
* Interface Responsiva

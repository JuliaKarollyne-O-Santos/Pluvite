# <img src="web/public/Pluvite-png-removebg.png.png" width="35" height="65" style="margin-right:3px;"/>luvite

Pluvite é uma plataforma desenvolvida para monitoramento de riscos climáticos, comunicação de alertas e participação cidadã durante eventos relacionados a desastres naturais.
O sistema permite que cidadãos acompanhem condições meteorológicas, recebam alertas em tempo real e reportem problemas de infraestrutura urbana, enquanto órgãos públicos podem monitorar ocorrências e gerenciar ações de resposta.


## Objetivo

Facilitar a comunicação entre população e prefeitura durante situações de risco, oferecendo informações climáticas, alertas preventivos e um canal para registro de ocorrências.


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
* **Render:** hospedagem do banco de dados

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
* Mapa Interativo
* Feed Comunitário
* Alertas
* Dashboard Administrativo

### Aplicativo Mobile

* Login e Cadastro
* Clima
* Perfil do Usuário
* Feed Comunitário (com envio de fotos e localização)
* Rotas e Navegação
* Emergências e Contatos Úteis

## Equipe

Projeto acadêmico da matéria de Projeto Integrador I, desenvolvido para aplicação de:

* Desenvolvimento Web e Mobile
* Banco de Dados
* Geolocalização
* APIs
* Sistemas de Monitoramento
* Interface Responsiva

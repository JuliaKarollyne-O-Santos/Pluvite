# 🗺️ Roadmap Pluvite

Checklist das funcionalidades do Pluvite (TCC — prevenção de desastres naturais no Vale do Paraíba e
Litoral Norte). Marque `[x]` ao concluir um item **no mesmo commit** da entrega.
Legenda de prioridade: 🔴 essencial para a banca · 🟡 importante · 🟢 desejável.

> Levantamento feito em 22/09/2026 a partir do código da branch `main`.

---

## ✅ Já entregue

- [x] Landing page institucional (hero, recursos, riscos, emergência, app)
- [x] Login por e-mail/senha, Google e Facebook (web)
- [x] Cadastro de cidadão e redefinição de senha (web)
- [x] Login e cadastro (mobile)
- [x] Mapa interativo do Vale com busca de municípios e clima por cidade (web)
- [x] Página de clima com previsão de 7 dias, UV, qualidade do ar (web)
- [x] Página de clima (mobile, Open-Meteo)
- [x] Feed de ocorrências com publicação, foto, filtros, curtidas, comentários e compartilhamento (web)
- [x] Perfil do cidadão: dados pessoais, saúde, contato de emergência, preferências de notificação, avatar (web)
- [x] Perfil do cidadão (mobile)
- [x] Contatos de emergência com discagem (mobile)
- [x] Painel do servidor com KPIs, gráficos, filtros e mudança de status (web)
- [x] API Express: listar alertas, alterar status, histórico em memória
- [x] Grafos viários (OSMnx) dos 39 municípios em `Rotas/`

---

## Fase 0 — Fundação e dívida técnica 🔴

- [ ] Mover chaves do código para `.env` (Supabase em `banco.ts`/`server.js`/mobile, WeatherAPI em `Clima2`, OpenWeather em `MapaValeComponent`)
- [ ] Revogar/rotacionar as chaves de clima que já foram commitadas
- [x] Corrigir `web/app/backend/supabase.js` (declaração duplicada) e usá-lo no `server.js`
- [ ] Tirar o backend de dentro de `web/app/` (o `next build` trata `backend/node_modules/router/lib/route.js` como rota)
- [ ] URL do backend via `NEXT_PUBLIC_API_URL` (remover `http://localhost:3001` fixo)
- [ ] Criar `web/app/lib/constantes.ts` com municípios, tipos, status e prioridades (remover as 3 listas divergentes; tirar "Potunduva", incluir Canas, Lavrinhas e Queluz no painel)
- [ ] Unificar o mapeamento de status (`aguardando/andamento/resolvido` do mobile → valores canônicos)
- [ ] Corrigir links da sidebar (`/servidor/alertas`, `/feed`, `/perfil`) e dados fixos "Prefeitura de Taubaté"
- [ ] Botão "Sair" funcional na sidebar e na navbar do cidadão
- [ ] Remover dependências não usadas do `web/package.json` (`expo`, `mysql2`, `bcrypt`, `@expo/vector-icons`)
- [ ] Versionar o schema do Supabase em `supabase/migrations/` e apagar `BD-antigo.sql`
- [ ] Ativar e revisar RLS em todas as tabelas e buckets
- [x] Adicionar `cache/` ao `.gitignore` (cache do OSMnx + tiles SRTM)
- [ ] Reduzir `any` em `Clima2`, `Mapa` e `Servidor` com interfaces tipadas
- [ ] Escolher **um** provedor de clima (sugestão: Open-Meteo, gratuito e sem chave) e criar `lib/clima.ts`

## Fase 1 — Autenticação e perfis de acesso 🔴

- [ ] Modelar perfis `cidadao` e `servidor` (tabela `servidor` ligada a `prefeitura`/município)
- [ ] Login do servidor público e redirecionamento para `/Servidor`
- [ ] Proteger rotas (`/Servidor`, `/perfil`, publicação no Feed) — proxy/middleware do Next 16
- [ ] Painel do servidor filtrado automaticamente pelo município da prefeitura logada
- [ ] Rotas de escrita do backend exigindo token Supabase + papel de servidor
- [ ] Sessão persistente e auto-login no mobile (AsyncStorage)
- [ ] 🟢 Aprovação/convite de contas de servidor por um administrador

## Fase 2 — Ocorrências (cidadão ↔ prefeitura) 🔴

- [ ] **Conectar o painel do servidor à tabela `ocorrencias`** (hoje ele lê só `alertas_tempo_real`)
- [ ] Servidor altera status da ocorrência e o autor vê a mudança no Feed
- [ ] Ocultar ocorrências `Concluído` do feed público (manter no histórico/perfil)
- [x] Salvar latitude/longitude na ocorrência (GPS ou ponto marcado no mapa do modal) e exibir no mapa de rotas
- [ ] **Aplicar `supabase/migrations/20260923120000_ocorrencias_localizacao.sql` no Supabase** (colunas + Realtime)
- [x] Tipo de ocorrência "Acidente"
- [ ] Feed mobile conectado ao Supabase (hoje é mock) com FlatList
- [ ] Publicação pelo mobile com câmera (`expo-image-picker`) e localização atual (`expo-location`)
- [ ] Feed em tempo real (Supabase Realtime) em vez de recarregar
- [ ] Reverter curtida otimista quando o Supabase retornar erro
- [ ] Persistir o histórico de ações do servidor no banco (hoje fica na memória do Node)
- [ ] 🟡 Validação de imagem (tipo e tamanho ≤ 5 MB) e compressão
- [ ] 🟡 Denúncia/moderação de publicações impróprias
- [ ] 🟢 Detecção de ocorrências duplicadas próximas (mesmo tipo + raio)

## Fase 3 — Alertas e notificações 🔴

- [ ] Servidor cria e dispara alertas por município com nível de prioridade (Zona Segura → Alerta Máximo)
- [ ] Corrigir o listener de alertas do Mapa (usa cidadão fixo `id = 1`); filtrar pelo usuário/município logado
- [ ] Componente React de pop-up de alerta (portar `python/teste chat/alerta_desastre.js`)
- [ ] Alerta automático por limiar de chuva (portar `teste de chuva.py` para job agendado no backend ou Edge Function)
- [ ] Push notifications no mobile (`expo-notifications`) respeitando `notif_*` do perfil
- [ ] Envio de SMS pelo backend via Twilio (portar `python/Sms/app.py`)
- [x] Protótipo de envio do último alerta por WhatsApp via Twilio (`python/WhatsApp/app.py`)
- [ ] WhatsApp em produção: remetente aprovado pela Meta + template de mensagem (fora do Sandbox / janela de 24 h) e disparo automático pelo backend
- [ ] 🟡 Envio de e-mail de alerta usando o template `web/email.html`
- [ ] 🟡 Página "Alertas" para o cidadão com histórico de alertas da sua cidade
- [ ] 🟢 Integração com fontes oficiais (Defesa Civil SP, CEMADEN, INMET)

## Fase 4 — Mapa de risco e clima 🟡

- [ ] Camada de ocorrências ativas no mapa (marcadores por tipo/status)
- [ ] Camada de áreas de risco (alagamento/deslizamento) por município
- [ ] Mapa de calor de ocorrências por bairro
- [ ] Proxy de clima no backend com cache (esconde chave e reduz chamadas)
- [ ] Indicador de risco por município no mapa (cor da prioridade)
- [ ] 🟢 Radar/acúmulo de chuva das últimas 24 h

## Fase 5 — Rotas seguras 🟡

- [x] Gerar grafos faltantes (Tremembé, Ubatuba)
- [x] Serviço de cálculo de rota no backend (A* por tempo de viagem, `web/app/backend/routes/rotas.js`)
- [x] Página `/Rotas` na web: escolha da cidade, origem/destino por rua, GPS ou clique no mapa, passo a passo
- [x] Modelo realista de tempo de viagem: limites (OSM/CTB), pavimento, curvas, elevação SRTM, semáforos, PARE, cruzamentos, rotatórias, lombadas, conversões e horário de pico
- [x] Grafos regerados com tags extras do OSM e elevação (`Rotas/gerar_grafos.py`)
- [x] Preferências de rota na API (mais rápida/mais curta, evitar terra, rodovias, pedágio, ladeiras)
- [ ] Controles de preferência de rota na interface da página `/Rotas`
- [ ] Calibrar os parâmetros marcados como "estimativa" com medições reais (cronometragem em campo ou Waze for Cities / TomTom)
- [ ] Mapear lombadas e placas de PARE no OpenStreetMap (dados ainda escassos na região)
- [x] Evitar vias com ocorrências ativas (alagamento, via interditada, deslizamento) no cálculo da rota
- [x] Navegação em tempo real na web: GPS, trajeto percorrido/restante, câmera seguindo, recálculo ao sair da rota, chegada
- [x] Recálculo automático quando uma ocorrência do Feed atinge o trajeto (Realtime + consulta periódica)
- [x] Card de seleção de cidade mais largo e baixo (desktop e celular)
- [x] Manter cidade, origem e destino ao sair da página `/Rotas` e voltar (`lib/rotas/sessao.ts`, sessionStorage)
- [x] Interditar só o trecho da via dentro do raio da ocorrência, não a aresta inteira do grafo (até 5,6 km em Taubaté)
- [ ] Calibrar raio/validade de cada tipo de ocorrência (`EFEITO_OCORRENCIA`, hoje estimativa)
- [ ] Testar a navegação em campo no celular (exige HTTPS; em sala use `/Rotas?simular`)
- [ ] 🟢 Avisar "rota mais rápida disponível" quando uma ocorrência evitada for concluída
- [ ] 🟢 Instruções de voz na navegação (`speechSynthesis`)
- [ ] Decidir onde hospedar os grafos em produção (a pasta `Rotas/` tem ~110 MB e ainda não está no git)
- [ ] Tela de Rotas no mobile (citada no README, ainda não existe)
- [ ] 🟡 Pontos de abrigo e rotas de evacuação cadastrados pela prefeitura
- [ ] 🟢 Rota até o abrigo mais próximo com um toque

## Fase 6 — Painel do servidor e indicadores 🟡

- [ ] Substituir polling de 5 s por Realtime
- [ ] Indicadores reais por município (tempo médio de atendimento, taxa de conclusão)
- [ ] Exportar relatório (CSV/PDF) por período e município
- [ ] Gestão de abrigos (capacidade, ocupação, contato)
- [ ] 🟢 Atribuir ocorrência a uma equipe/responsável

## Fase 7 — Acessibilidade, privacidade e qualidade 🟡

- [ ] Configurações de acessibilidade aplicadas na interface (alto contraste, tamanho de fonte)
- [ ] Termo de uso e política de privacidade (LGPD — o perfil guarda dados de saúde)
- [ ] Consentimento explícito para dados sensíveis e opção de excluir conta
- [ ] Responsividade da navbar/sidebar em telas pequenas (menu mobile na web)
- [ ] Testes unitários dos utilitários de `lib/` (Vitest)
- [ ] 🟢 Testes E2E dos fluxos críticos (Playwright): login, publicar ocorrência, mudar status
- [ ] CI no GitHub Actions: lint + build da web e `tsc` do mobile

## Fase 8 — Entrega do TCC 🔴

- [ ] Deploy da web (Vercel) e do backend (Render/Railway) com variáveis de ambiente
- [ ] Build do app (EAS) para demonstração em Android
- [ ] Popular banco com dados de demonstração realistas
- [ ] Atualizar README (funcionalidades reais, variáveis de ambiente, arquitetura)
- [ ] Diagrama de arquitetura e modelo de dados para a monografia
- [ ] `Resultado.md` das Sprints 3 e 4 com link do vídeo
- [ ] Roteiro de demonstração para a banca

# Guia — Trânsito ao vivo, teste em campo e calibração das rotas

Roteiro para ligar o trânsito ao vivo (TomTom), preparar dados de demonstração, testar a navegação
de verdade com o celular e calibrar o tempo de viagem com medições reais.

> Comandos a partir da raiz do repositório (`Pluvite/`). No Windows, use o PowerShell.

---

## 1. Chave da TomTom (trânsito ao vivo e calibração)

Sem a chave, tudo funciona como antes: a rota usa só o modelo de tempo e o horário de pico.

1. Crie uma conta gratuita em <https://my.tomtom.com> (não pede cartão de crédito). O antigo
   developer.tomtom.com foi desativado em 15/09/2026 para contas comuns.
2. Já logado, abra **API & SDK Keys** (<https://my.tomtom.com/keys>). A conta já vem com uma chave
   chamada **"My first API key"**: abra e copie.
3. Cole a chave no arquivo `web/app/backend/.env` (ignorado pelo Git), logo depois do `=`:

   ```env
   TOMTOM_API_KEY=cole_a_chave_aqui
   ```

   Nunca coloque a chave no código, em prints ou em mensagens.
4. Rode `cd web && npm run dev` e calcule uma rota em `/Rotas`. Embaixo do tempo aparece
   "com trânsito ao vivo" e, no painel, "Dados de trânsito © TomTom".

| Uso | API da TomTom | Plano gratuito | Como o Pluvite economiza |
|---|---|---|---|
| Trânsito ao vivo nas rotas | Traffic Incidents | 2.500 consultas/mês | 1 consulta por cidade a cada 10 min, no máximo 80 por dia |
| Calibração (script) | Routing | 20.000 consultas/mês | 2 consultas por par de pontos (≈ 120 por rodada) |

Se aparecer "Trânsito ao vivo indisponível agora", o terminal do backend mostra o motivo:
`HTTP 403` = chave errada ou sem acesso à API (confira em API & SDK Keys quais produtos a chave
cobre); `HTTP 429` = limite atingido. O uso do mês aparece em **Analytics**, no my.tomtom.com. Em produção (Render),
cadastre `TOMTOM_API_KEY` nas variáveis de ambiente do serviço.

**O que muda na rota:** congestionamento medido soma o atraso real ao tempo (e a rota desvia se
compensar); via fechada é evitada; obra, faixa fechada e acidente sem atraso informado são
evitados quando há desvio razoável. No mapa: vermelho = lentidão, vinho tracejado = via fechada,
âmbar tracejado = passagem dificultada.

---

## 2. Ocorrências de demonstração

Oito ocorrências fictícias com ponto exato no mapa (5 em Taubaté, 3 em São José dos Campos),
publicadas pelo cidadão "Demonstração Pluvite" (sem login, notificações desligadas, e-mail que não
recebe mensagens). A descrição de todas começa com `[DEMONSTRAÇÃO]`.

```bash
cd web/app/backend
node scripts/ocorrencias-demonstracao.js criar     # cria ou renova (status Aguardando, data recente)
node scripts/ocorrencias-demonstracao.js remover   # apaga tudo o que o script criou
```

- **Rode `criar` antes de cada apresentação:** cada tipo só vale por algumas horas para o
  roteamento (acidente 6 h, alagamento 12 h).
- **Roteiro de demonstração:** em `/Rotas`, Taubaté, de *Avenida Charles Schneider* para
  *Avenida Independência*. O alagamento na Av. Haroldo de Mattos faz a rota desviar. Depois, um
  servidor muda o status em `/Prefeituras` e o texto da rota passa de "Relato de cidadão" para
  "visto/em atendimento pela prefeitura".

---

## 3. Teste em campo com o celular

O GPS do navegador só funciona em HTTPS. O computador roda o site e o celular acessa por um túnel
HTTPS.

1. No computador:

   ```bash
   cd web
   npm run dev:celular
   ```

2. Em **outro** terminal, abra o túnel (o Windows 10+ já tem o `ssh`):

   ```bash
   ssh -R 80:localhost:3000 nokey@localhost.run
   ```

   Ele mostra um endereço `https://….lhr.life` (o endereço gratuito muda a cada poucas horas; se
   parar, abra o túnel de novo). Enquanto o túnel estiver aberto, qualquer pessoa com esse endereço
   acessa o site de desenvolvimento: feche com `Ctrl+C` ao terminar. Com outro serviço de túnel,
   informe o domínio: `npm run dev:celular -- --origem dominio.do.tunel`.

   *Alternativa sem túnel (mesmo Wi-Fi):* `npm run dev:celular -- --https` e abra no celular o
   endereço `https://<IP do computador>:3000` que o terminal mostrar, aceitando o aviso de
   certificado. O certificado é autoassinado e o navegador pode não liberar o GPS; nesse caso, use
   o túnel.
3. No celular, abra `<endereço>/Rotas?registrar`, escolha a cidade, toque em
   "Usar minha localização atual como origem", escolha o destino e toque em **Iniciar navegação**.
   O selo **GRAVANDO** aparece no topo.
4. **Segurança:** quem dirige não mexe no celular. Um passageiro acompanha a tela.
5. Ao chegar, toque em **Baixar registro do trajeto (teste em campo)**. Isso baixa um `.json` com o
   tempo previsto e as leituras do GPS (uma por segundo). Se a navegação for encerrada antes da
   chegada, o botão aparece no painel, mas esse trajeto não entra na calibração.
6. Junte os arquivos numa pasta fora do repositório. Eles têm o trajeto real de quem testou, que é
   dado pessoal (LGPD): não faça commit nem publique.

**Sugestão de roteiro:** pelo menos 10 trajetos por horário (fora do pico e pico — dias úteis 7–10 h
e 17–20 h), misturando trajetos curtos (< 4 km) e longos (> 8 km) e ruas conhecidas. Anote qualquer
coisa estranha (rota que ninguém faria, recálculo sem motivo, tempo muito diferente do real).

---

## 4. Calibração do tempo de viagem

O script compara o tempo previsto pelo Pluvite com uma referência medida. Ele não muda nenhum
parâmetro: mostra o erro e sugere por onde ajustar.

```bash
cd web/app/backend
node scripts/calibrar-tempos.js --registros C:\caminho\da\pasta-dos-json    # registros de campo
node scripts/calibrar-tempos.js                                            # TomTom (precisa da chave)
node scripts/calibrar-tempos.js --cidades "Taubaté,São José dos Campos" --pares 15 --saida resultado.json
```

- **razão = previsto ÷ referência.** Acima de 1, o modelo prevê mais tempo que o real (pessimista);
  abaixo de 1, menos (otimista).
- **Calibrado:** razão mediana entre 0,90 e 1,10 e pelo menos 70% dos trajetos dentro de ±20%.
- As sugestões (`fatorFluxoLivre`, multiplicador do pico) são um ponto de partida aproximado.
  Depois de ajustar `PARAMETROS` em `web/app/backend/rotas/modeloTempo.js`:
  1. rode o script de novo;
  2. confira os cenários de referência de `SKILLS/rotas-tempo-viagem` (cidade 20–40 km/h,
     rodovia 70–95 km/h);
  3. troque o "estimativa" do parâmetro pela fonte (ex.: "calibrado com 32 trajetos em
     Taubaté, nov/2026").
- Com a TomTom, a referência é o tempo típico do horário numa quarta-feira (histórico de trânsito),
  e os pares cuja extensão difere mais de 25% da rota da TomTom ficam de fora (corredores
  diferentes).

---

## 5. Arquivos

| Arquivo | Papel |
|---|---|
| `web/app/backend/rotas/transito.js` | Consulta a TomTom (cache e cota), encaixa os incidentes nas vias do grafo |
| `web/app/backend/rotas/roteamento.js` | `tempoNaVia`: lentidão medida no custo e no tempo da rota |
| `web/app/backend/routes/rotas.js` | Campo `transito` na resposta de `/calcular` |
| `web/app/Rotas/page.tsx`, `web/app/components/MapaRotasComponent.tsx` | Resumo do trânsito, traçados no mapa, modo `?registrar` |
| `web/app/lib/rotas/registroTrajeto.ts` | Formato e download do registro do teste em campo |
| `web/scripts/dev-celular.mjs` + `web/next.config.ts` | `npm run dev:celular` (proxy de `/api/rotas` e origens do túnel) |
| `web/app/backend/scripts/calibrar-tempos.js` | Calibração (TomTom ou registros de campo) |
| `web/app/backend/scripts/ocorrencias-demonstracao.js` | Cria/renova/remove as ocorrências de demonstração |

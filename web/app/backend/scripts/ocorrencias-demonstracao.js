// OCORRÊNCIAS DE DEMONSTRAÇÃO para a apresentação e para testar o desvio de rotas com pontos exatos.
//
// Todas são publicadas pelo cidadão fictício "Demonstração Pluvite" (e-mail no domínio reservado
// .invalid, que não recebe mensagens, e todas as notificações desligadas), começam com
// "[DEMONSTRAÇÃO]" na descrição e ficam em vias reais de Taubaté e São José dos Campos, com
// latitude/longitude sobre o eixo da via.
//
// Uso (na pasta web/app/backend):
//   node scripts/ocorrencias-demonstracao.js criar     cria ou RENOVA (data recente, status Aguardando)
//   node scripts/ocorrencias-demonstracao.js remover   apaga as ocorrências, curtidas e comentários
//                                                      delas e o cidadão fictício
// Rode "criar" de novo antes de apresentar: cada tipo vale por um tempo para o roteamento
// (EFEITO_OCORRENCIA em rotas/ocorrencias.js — acidente 6 h, alagamento 12 h).
//
// Precisa de SUPABASE_SERVICE_ROLE_KEY (web/app/backend/.env ou web/.env.local): o cidadão
// fictício não tem login, então só a chave de serviço pode publicar em nome dele.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({
  path: [
    fileURLToPath(new URL('../.env', import.meta.url)),
    fileURLToPath(new URL('../../../.env.local', import.meta.url)),
  ],
  quiet: true,
});

const CIDADAO_DEMONSTRACAO = {
  nome_completo: 'Demonstração Pluvite',
  email: 'demonstracao@pluvite.invalid',
  cidade: null,
  municipio_alertas: null,
  notif_chuva_forte: false,
  notif_deslizamento: false,
  notif_email: false,
  notif_push: false,
};

const AVISO = '[DEMONSTRAÇÃO] Ocorrência fictícia para testar o desvio de rotas — não é um evento real.';

// `minutosAtras` define a data de publicação (o app mostra "publicada há ...") e precisa ficar
// dentro da validade do tipo. Pontos tirados dos grafos (eixo da via; ver Rotas/*_graph.json).
// Todas entram como "Aguardando" (relato ainda não verificado): uma confirmação da prefeitura só
// pode vir do painel — na apresentação, um servidor muda o status ao vivo em /Prefeituras.
const OCORRENCIAS = [
  {
    cidade: 'Taubaté', tipo: 'Alagamento', minutosAtras: 25,
    endereco: 'Avenida Haroldo de Mattos (ponto de demonstração)', latitude: -23.032647, longitude: -45.592981,
    detalhe: 'Água acima do meio-fio nos dois sentidos.',
  },
  {
    cidade: 'Taubaté', tipo: 'Buraco na via', minutosAtras: 2 * 24 * 60,
    endereco: 'Avenida Marrocos (ponto de demonstração)', latitude: -23.031535, longitude: -45.57894,
    detalhe: 'Buraco grande na faixa da direita.',
  },
  {
    cidade: 'Taubaté', tipo: 'Acidente', minutosAtras: 40,
    endereco: 'Avenida Tiradentes (ponto de demonstração)', latitude: -23.03086, longitude: -45.565406,
    detalhe: 'Colisão entre dois carros, pista parcialmente ocupada.',
  },
  {
    cidade: 'Taubaté', tipo: 'Árvore caída', minutosAtras: 3 * 60,
    endereco: 'Rua Visconde do Rio Branco (ponto de demonstração)', latitude: -23.025978, longitude: -45.556177,
    detalhe: 'Árvore atravessada na rua depois da chuva.',
  },
  {
    cidade: 'Taubaté', tipo: 'Deslizamento de terra', minutosAtras: 6 * 60,
    endereco: 'Rua Bento Soares da Mota (ponto de demonstração)', latitude: -23.036218, longitude: -45.547715,
    detalhe: 'Terra do barranco sobre a pista na ladeira.',
  },
  {
    cidade: 'São José dos Campos', tipo: 'Alagamento', minutosAtras: 15,
    endereco: 'Avenida São João (ponto de demonstração)', latitude: -23.20921, longitude: -45.90899,
    detalhe: 'Pista alagada, carros voltando.',
  },
  {
    cidade: 'São José dos Campos', tipo: 'Via interditada', minutosAtras: 60,
    endereco: 'Avenida Jorge Zarur (ponto de demonstração)', latitude: -23.216225, longitude: -45.887016,
    detalhe: 'Trecho fechado pela Defesa Civil.',
  },
  {
    cidade: 'São José dos Campos', tipo: 'Árvore caída', minutosAtras: 4 * 60,
    endereco: 'Avenida Andrômeda (ponto de demonstração)', latitude: -23.21708, longitude: -45.894531,
    detalhe: 'Galhos grandes bloqueando uma faixa.',
  },
];

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.log('Configure SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY em web/app/backend/.env ou web/.env.local.');
  process.exit(1);
}
const supabase = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });

const falhar = (contexto, error) => {
  console.error(`Erro ao ${contexto}: [${error.code ?? '?'}] ${error.message}`);
  process.exit(1);
};

const buscarCidadao = async () => {
  const { data, error } = await supabase
    .from('cidadao').select('id').eq('email', CIDADAO_DEMONSTRACAO.email).maybeSingle();
  if (error) falhar('buscar o cidadão de demonstração', error);
  return data?.id ?? null;
};

const criar = async () => {
  let autorId = await buscarCidadao();
  if (!autorId) {
    const { data, error } = await supabase.from('cidadao').insert(CIDADAO_DEMONSTRACAO).select('id').single();
    if (error) falhar('criar o cidadão de demonstração', error);
    autorId = data.id;
    console.log('Cidadão "Demonstração Pluvite" criado (sem login, notificações desligadas).');
  }

  const { data: existentes, error: erroExistentes } = await supabase
    .from('ocorrencias').select('id, endereco').eq('autor_id', autorId);
  if (erroExistentes) falhar('ler as ocorrências de demonstração', erroExistentes);
  const idPorEndereco = new Map(existentes.map((linha) => [linha.endereco, linha.id]));

  for (const { minutosAtras, detalhe, ...item } of OCORRENCIAS) {
    const linha = {
      ...item,
      autor_id: autorId,
      bairro: null,
      status: 'Aguardando',
      descricao: `${AVISO} ${detalhe}`,
      imagem_url: null,
      criado_em: new Date(Date.now() - minutosAtras * 60000).toISOString(),
    };
    const id = idPorEndereco.get(item.endereco);
    const { error } = id
      ? await supabase.from('ocorrencias').update(linha).eq('id', id)
      : await supabase.from('ocorrencias').insert(linha);
    if (error) falhar(`gravar "${item.tipo} — ${item.endereco}"`, error);
    console.log(`${id ? 'Renovada' : 'Criada  '}  ${item.cidade.padEnd(20)} ${item.tipo.padEnd(22)} ${item.endereco}`);
  }
  console.log(`\n${OCORRENCIAS.length} ocorrências de demonstração ativas. Para apagar: node scripts/ocorrencias-demonstracao.js remover`);
};

const remover = async () => {
  const autorId = await buscarCidadao();
  if (!autorId) return console.log('Nenhum dado de demonstração encontrado.');

  const { data: linhas, error } = await supabase.from('ocorrencias').select('id').eq('autor_id', autorId);
  if (error) falhar('ler as ocorrências de demonstração', error);
  const ids = linhas.map((linha) => linha.id);

  if (ids.length > 0) {
    for (const tabela of ['curtidas', 'comentarios']) {
      const { error: erroTabela } = await supabase.from(tabela).delete().in('ocorrencia_id', ids);
      if (erroTabela) falhar(`apagar ${tabela} das ocorrências de demonstração`, erroTabela);
    }
    const { error: erroOcorrencias } = await supabase.from('ocorrencias').delete().in('id', ids);
    if (erroOcorrencias?.code === '23503') {
      // historico_acoes.ocorrencia_id aponta para elas (um servidor mudou o status no painel):
      // o histórico é registro do painel e não é apagado automaticamente
      console.error('Alguma ocorrência de demonstração tem ações no histórico do painel (historico_acoes).');
      console.error(`Desvincule no SQL Editor e rode de novo: update historico_acoes set ocorrencia_id = null where ocorrencia_id in ('${ids.join("','")}');`);
      process.exit(1);
    }
    if (erroOcorrencias) falhar('apagar as ocorrências de demonstração', erroOcorrencias);
  }

  const { error: erroCidadao } = await supabase.from('cidadao').delete().eq('id', autorId);
  if (erroCidadao) falhar('apagar o cidadão de demonstração', erroCidadao);
  console.log(`${ids.length} ocorrência(s) de demonstração e o cidadão "Demonstração Pluvite" apagados.`);
};

const comando = process.argv[2];
if (comando === 'criar') await criar();
else if (comando === 'remover') await remover();
else console.log('Uso: node scripts/ocorrencias-demonstracao.js criar | remover');

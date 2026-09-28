import express from 'express';
import cors from 'cors';
import { supabase } from './supabase.js';
import rotasRouter from './routes/rotas.js';

const app = express();
app.use(cors());
app.use(express.json());

// Rotas seguras: grafos viários por município, cálculo de trajeto e ocorrências do Feed na rota
app.use('/api/rotas', rotasRouter);

// Histórico em memória (não usa o banco de dados)
let historicoMemoriaLocal = [];

/**
 * 1. ROTA GET: Busca os alertas em tempo real relacionando com o cidadão
 */
app.get('/api/alertas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('alertas_tempo_real')
      .select(`
        id,
        tipo,
        prioridade,
        municipio,
        endereco,
        descricao,
        statusatual,
        criado_em,
        cidadao!fk_cidadao (
          nome_completo,
          bairro
        )
      `)
      .order('criado_em', { ascending: false });

    if (error) {
      console.error("Erro na consulta do Supabase (Alertas):", error);
      return res.status(500).json({ error: error.message });
    }

    const respostaFormatada = data.map(alerta => {
      let statusTratado = alerta.statusatual || 'Aguardando';
      const statusLower = statusTratado.toLowerCase();

      if (statusLower === 'visualizado') statusTratado = 'Visualizado';
      else if (statusLower === 'em andamento' || statusLower === 'em_andamento') statusTratado = 'Em Andamento';
      else if (statusLower === 'concluído' || statusLower === 'concluido') statusTratado = 'Concluído';
      else statusTratado = 'Aguardando';

      return {
        id: alerta.id,
        tipo: alerta.tipo,
        prioridade: alerta.prioridade,
        municipio: alerta.municipio,
        endereco: alerta.endereco,
        descricao: alerta.descricao || 'Sem descrição.',
        statusAtual: statusTratado,
        criado_em: alerta.criado_em,
        usuario: alerta.cidadao?.nome_completo || 'Cidadão Anônimo',
        bairro: alerta.cidadao?.bairro || 'Não Informado'
      };
    });

    return res.json(respostaFormatada);
  } catch (err) {
    console.error("Erro interno no servidor (Alertas):", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

/**
 * 2. ROTA PATCH: Atualiza o status do alerta no banco de dados
 */
app.patch('/api/alertas/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status_atual } = req.body;

  try {
    const { data, error } = await supabase
      .from('alertas_tempo_real')
      .update({ statusatual: status_atual })
      .eq('id', id)
      .select();

    if (error) {
      console.error("Erro ao atualizar status no Supabase:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error("Erro ao processar atualização:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
});

/**
 * 3. ROTA GET: Busca as últimas ações da memória local para alimentar o Frontend
 */
app.get('/api/historico', (req, res) => {
  // Retorna os logs salvos na memória ram do node sem bater no Supabase
  return res.json(historicoMemoriaLocal.slice(0, 20));
});

/**
 * 4. ROTA POST: Cria o log de ação apenas na memória local
 */
app.post('/api/historico', (req, res) => {
  const { alertaId, cidade, acao, corAcao } = req.body;

  const novoLog = {
    id: Math.random().toString(36).substring(2, 9), // Gera um ID temporário
    alerta_id: alertaId,
    cidade: cidade || "Geral",
    acao: acao,
    cor_acao: corAcao,
    criado_at: new Date().toISOString()
  };

  // Adiciona o log no topo da lista na memória
  historicoMemoriaLocal.unshift(novoLog);

  return res.status(201).json(novoLog);
});

// Inicialização do Servidor (PORT é definida pelo host em produção, ex.: Render)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor operacional rodando na porta http://localhost:${PORT}`);
});
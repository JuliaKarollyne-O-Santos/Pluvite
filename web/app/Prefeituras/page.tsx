"use client";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/banco";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area,
} from "recharts";
import {
  Layers,
  AlertTriangle,
  Wrench,
  CheckCircle,
  Eye,
  Navigation,
  Clock,
  History,
  LayoutGrid,
  ClipboardList,
  MapPinned,
  Percent,
  TrendingUp,
  Bell,
  Loader2,
  X,
} from "lucide-react";
import Navbar3 from "../components/sidebar";
import { CORES_PRIORIDADE, PRIORIDADE_POR_TIPO_PADRAO } from "@/app/lib/constantes";

// Deriva uma "prioridade" visual a partir do tipo da ocorrência — a tabela
// "ocorrencias" (a mesma usada pelo Feed) não tem coluna de prioridade,
// então mapeamos por tipo. Esse mapeamento agora é editável pela equipe
// Pluvite em /Adm > "Níveis de Risco" (tabela "config_prioridades"); aqui
// começamos com o padrão de app/lib/constantes.ts e sobrescrevemos assim
// que a configuração carrega (ver carregarConfigPrioridades abaixo).

type Aba = "visao" | "ocorrencias";

interface Chamado {
  id: string;
  tipo: string;
  prioridade: string;
  bairro: string;
  municipio: string;
  usuario: string;
  endereco: string;
  tempo: string;
  criadoEm: string;
  descricao: string;
  statusAtual: string;
}

interface Notificacao {
  id: string;
  texto: string;
  criadoEm: number;
}

// Anel de progresso com o valor centralizado
function AnelProgresso({
  label,
  valor,
  cor,
}: {
  label: string;
  valor: number;
  cor: string;
}) {
  const dados = [
    { name: "valor", value: valor },
    { name: "resto", value: Math.max(0, 100 - valor) },
  ];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24 sm:w-28 sm:h-28">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dados}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius="72%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              <Cell fill={cor} />
              <Cell fill="#eef1f6" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg sm:text-xl font-black text-slate-900">
            {valor}%
          </span>
        </div>
      </div>
      <p className="text-[11px] font-bold text-slate-600 text-center leading-tight">
        {label}
      </p>
    </div>
  );
}

export default function PainelServidor() {
  const router = useRouter();

  const [abaAtiva, setAbaAtiva] = useState<Aba>("visao");
  const [prioridadeFiltro, setPrioridadeFiltro] = useState(
    "Todas as Prioridades",
  );
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [historicoLogs, setHistoricoLogs] = useState<any[]>([]);

  const [sidebarExpandida, setSidebarExpandida] = useState(false);

  // ───── AUTENTICAÇÃO DO SERVIDOR (PREFEITURA) ─────
  // meuMunicipio vem da tabela "servidor" — é ele que filtra tudo (dados do
  // painel e notificações) pra só mostrar o que é da cidade desse servidor.
  const [meuMunicipio, setMeuMunicipio] = useState<string | null>(null);
  const [nomeServidor, setNomeServidor] = useState("");
  const [verificandoLogin, setVerificandoLogin] = useState(true);

  // Mapeamento tipo de ocorrência -> prioridade. Começa com o padrão de
  // app/lib/constantes.ts e é sobrescrito pelo que a equipe Pluvite configurou
  // em /Adm > "Níveis de Risco" (tabela "config_prioridades"), se já existir.
  const [prioridadePorTipo, setPrioridadePorTipo] = useState<
    Record<string, string>
  >(PRIORIDADE_POR_TIPO_PADRAO);

  useEffect(() => {
    const carregarConfigPrioridades = async () => {
      const { data, error } = await supabase
        .from("config_prioridades")
        .select("tipo, prioridade");

      // Se a tabela ainda não existe (migration não rodada) ou está vazia,
      // fica com o padrão — não é um erro fatal pro painel.
      if (error || !data || data.length === 0) return;

      setPrioridadePorTipo((prev) => {
        const novo = { ...prev };
        data.forEach((linha: any) => {
          novo[linha.tipo] = linha.prioridade;
        });
        return novo;
      });
    };
    carregarConfigPrioridades();
  }, []);

  useEffect(() => {
    const verificarServidor = async () => {
      const { data } = await supabase.auth.getUser();
      const usuario = data.user;
      if (!usuario) {
        router.replace("/login");
        return;
      }

      const { data: servidorRow, error } = await supabase
        .from("servidor")
        .select("nome_completo, municipio")
        .eq("auth_id", usuario.id)
        .maybeSingle();

      if (error || !servidorRow) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setNomeServidor(servidorRow.nome_completo || "Servidor");
      setMeuMunicipio(servidorRow.municipio);
      setVerificandoLogin(false);
    };
    verificarServidor();
  }, [router]);

  // ───── NOTIFICAÇÕES (toast + sininho) ─────
  const [notifAberta, setNotifAberta] = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [toastAtual, setToastAtual] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispararNotificacao = (texto: string) => {
    setNotificacoes((prev) => [
      { id: `${Date.now()}`, texto, criadoEm: Date.now() },
      ...prev,
    ].slice(0, 20));
    setNaoLidas((n) => n + 1);

    setToastAtual(texto);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastAtual(null), 6000);
  };

  const calcularTempo = (criadoEm: string) => {
    if (!criadoEm) return "Agora mesmo";
    const diffMin = Math.floor(
      (Date.now() - new Date(criadoEm).getTime()) / 60000,
    );
    if (diffMin < 1) return "Agora mesmo";
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHoras = Math.floor(diffMin / 60);
    return `há ${diffHoras} ${diffHoras === 1 ? "hora" : "horas"}`;
  };

  // ───── BUSCA DE DADOS (Supabase, filtrado pela própria cidade) ─────
  const buscarDadosBanco = async () => {
    if (!meuMunicipio) return;

    const { data: linhas, error } = await supabase
      .from("ocorrencias")
      .select("*, cidadao!ocorrencias_autor_id_fkey(nome_completo)")
      .eq("cidade", meuMunicipio)
      .order("criado_em", { ascending: false });

    if (!error && linhas) {
      const formatados: Chamado[] = linhas.map((o: any) => ({
        id: o.id,
        tipo: o.tipo,
        prioridade: prioridadePorTipo[o.tipo] || "Zona Segura",
        bairro: o.bairro,
        municipio: o.cidade,
        usuario: o.cidadao?.nome_completo || "Cidadão",
        endereco: o.endereco,
        tempo: calcularTempo(o.criado_em),
        criadoEm: o.criado_em,
        descricao: o.descricao || "",
        statusAtual: o.status || "Aguardando",
      }));
      setChamados(formatados);
    } else if (error) {
      console.error("Erro ao buscar ocorrências:", error);
    }

    const { data: logs, error: erroLogs } = await supabase
      .from("historico_acoes")
      .select("*")
      .eq("cidade", meuMunicipio)
      .order("criado_at", { ascending: false })
      .limit(50);

    if (!erroLogs && logs) setHistoricoLogs(logs);
  };

  useEffect(() => {
    if (!meuMunicipio) return;
    buscarDadosBanco();
    // Refaz a busca quando a configuração de prioridades chega (ela pode
    // carregar depois do município, já que são dois efeitos independentes) —
    // assim os chamados já existentes ganham a prioridade certa sem precisar
    // recarregar a página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meuMunicipio, prioridadePorTipo]);

  // ───── REALTIME — só dispara para ocorrências da própria cidade ─────
  useEffect(() => {
    if (!meuMunicipio) return;

    const canal = supabase
      .channel(`ocorrencias-${meuMunicipio}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ocorrencias",
          filter: `cidade=eq.${meuMunicipio}`,
        },
        (payload: any) => {
          const nova = payload.new;
          dispararNotificacao(
            `Nova ocorrência: ${nova.tipo} em ${nova.bairro || nova.cidade}`,
          );
          buscarDadosBanco();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meuMunicipio]);

  // ───── AÇÕES: mudar status (grava no banco + histórico) ─────
  const sincronizarStatusBanco = async (
    id: string,
    novoStatus: string,
    logMsg: string,
    corLog: string,
  ) => {
    const { error: erroUpdate } = await supabase
      .from("ocorrencias")
      .update({ status: novoStatus })
      .eq("id", id);

    if (erroUpdate) {
      console.error("Erro ao atualizar status:", erroUpdate);
      alert("Não foi possível atualizar o status dessa ocorrência.");
      return;
    }

    await supabase.from("historico_acoes").insert({
      ocorrencia_id: id,
      cidade: meuMunicipio,
      acao: logMsg,
      cor_acao: corLog,
    });

    buscarDadosBanco();
  };

  const handleMarcarComoVisto = (id: string) => {
    setChamados((prev) =>
      prev.map((c) => (c.id === id ? { ...c, statusAtual: "Visualizado" } : c)),
    );
    sincronizarStatusBanco(
      id,
      "Visualizado",
      "Comando operacional visualizou o risco iminente.",
      "text-blue-500",
    );
  };

  const handleDespacharEquipe = (id: string) => {
    setChamados((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, statusAtual: "Em Andamento" } : c,
      ),
    );
    sincronizarStatusBanco(
      id,
      "Em Andamento",
      "Equipes de mitigação de crise foram enviadas.",
      "text-amber-500",
    );
  };

  const handleMarcarConcluido = (id: string) => {
    setChamados((prev) =>
      prev.map((c) => (c.id === id ? { ...c, statusAtual: "Concluído" } : c)),
    );
    sincronizarStatusBanco(
      id,
      "Concluído",
      "Ocorrência controlada e vias públicas limpas.",
      "text-emerald-500",
    );
  };

  const chamadosFiltrados = useMemo(() => {
    return chamados.filter((chamado) => {
      const atendePrioridade =
        prioridadeFiltro === "Todas as Prioridades" ||
        chamado.prioridade === prioridadeFiltro;
      return atendePrioridade;
    });
  }, [chamados, prioridadeFiltro]);

  const metricas = useMemo(() => {
    const totalVisiveis = chamadosFiltrados.length;
    let ativos = 0,
      criticos = 0,
      emAndamento = 0,
      concluidos = 0,
      aguardando = 0,
      visualizados = 0;
    const contagemBairros: Record<string, number> = {};
    const contagemTipos: Record<string, number> = {};

    chamadosFiltrados.forEach((c) => {
      if (c.statusAtual !== "Concluído") ativos++;
      if (
        c.prioridade === "Alerta Máximo" ||
        c.prioridade === "Estado de Alerta"
      )
        criticos++;
      if (c.statusAtual === "Em Andamento") emAndamento++;
      if (c.statusAtual === "Concluído") concluidos++;
      if (c.statusAtual === "Aguardando") aguardando++;
      if (c.statusAtual === "Visualizado") visualizados++;
      contagemBairros[c.bairro] = (contagemBairros[c.bairro] || 0) + 1;
      contagemTipos[c.tipo] = (contagemTipos[c.tipo] || 0) + 1;
    });

    const dadosBarras = Object.keys(contagemBairros).map((bairro) => {
      const amostra = chamadosFiltrados.find((c) => c.bairro === bairro);
      return {
        name: bairro,
        total: contagemBairros[bairro],
        color: amostra ? CORES_PRIORIDADE[amostra.prioridade as keyof typeof CORES_PRIORIDADE] : "#64748b",
      };
    });

    const dadosPorTipo = Object.keys(contagemTipos)
      .map((tipo) => ({ name: tipo, total: contagemTipos[tipo] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    const pctVis =
      totalVisiveis > 0 ? Math.round((visualizados / totalVisiveis) * 100) : 0;
    const pctAgu =
      totalVisiveis > 0 ? Math.round((aguardando / totalVisiveis) * 100) : 0;
    const pctCon =
      totalVisiveis > 0 ? Math.round((concluidos / totalVisiveis) * 100) : 0;
    const pctAnd =
      totalVisiveis > 0 ? Math.round((emAndamento / totalVisiveis) * 100) : 0;

    const dadosPizza = [
      { name: "Visualizado", value: pctVis, color: "#3267bd" },
      { name: "Aguardando", value: pctAgu, color: "#787a7e" },
      { name: "Concluído", value: pctCon, color: "#179168" },
      { name: "Em Andamento", value: pctAnd, color: "#f59e0b" },
    ];

    const bairrosAfetados = Object.keys(contagemBairros).length;
    const taxaConclusao = pctCon;

    return {
      ativos,
      criticos,
      emAndamento,
      concluidos,
      dadosBarras,
      dadosPorTipo,
      dadosPizza,
      bairrosAfetados,
      taxaConclusao,
    };
  }, [chamadosFiltrados]);

  const tendencia7dias = useMemo(() => {
    const dias: { chave: string; label: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const data = new Date();
      data.setDate(data.getDate() - i);
      const chave = data.toISOString().slice(0, 10);
      const label = data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      dias.push({ chave, label, total: 0 });
    }
    historicoLogs.forEach((log) => {
      if (!log.criado_at) return;
      const chave = new Date(log.criado_at).toISOString().slice(0, 10);
      const dia = dias.find((d) => d.chave === chave);
      if (dia) dia.total += 1;
    });
    return dias;
  }, [historicoLogs]);

  const abas: { id: Aba; label: string; icon: any }[] = [
    { id: "visao", label: "Visão Geral", icon: LayoutGrid },
    { id: "ocorrencias", label: "Ocorrências", icon: ClipboardList },
  ];

  if (verificandoLogin) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#fbfcfe]">
        <Loader2 size={22} className="text-[#0d43af] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen -mt-15 w-full font-sans text-slate-800 bg-[#fbfcfe]">
      <Navbar3 expandida={sidebarExpandida} onToggle={setSidebarExpandida} />

      {/* TOAST — notificação de nova ocorrência */}
      {toastAtual && (
        <div className="fixed top-5 right-5 z-[10001] bg-[#091c4b] text-white rounded-2xl shadow-xl px-4 py-3.5 flex items-start gap-3 max-w-sm animate-[fadeIn_0.2s_ease]">
          <Bell size={18} className="text-amber-300 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold leading-snug flex-1">
            {toastAtual}
          </p>
          <button
            onClick={() => setToastAtual(null)}
            className="text-white/60 hover:text-white shrink-0 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div
        className={`pt-8 pr-6 md:pr-10 pb-16 transition-all duration-300 ease-in-out ${
          sidebarExpandida ? "pl-64" : "pl-[84px]"
        }`}
      >
      <div className="max-w-7xl mx-auto px-6 md:px-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-bold text-[#2C4A6F] uppercase tracking-widest">
              Painel da Prefeitura · {meuMunicipio}
            </span>
            <h1 className="text-4xl font-extrabold text-slate-950 tracking-tight mt-1">
              Olá, {nomeServidor}
            </h1>
            <p className="text-slate-500 text-sm font-medium mt-1">
              Acompanhe ocorrências, tendências e despache equipes em tempo real
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* SININHO DE NOTIFICAÇÕES */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifAberta((v) => !v);
                  if (!notifAberta) setNaoLidas(0);
                }}
                className="relative w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-[#0d43af] hover:border-[#0d43af]/30 transition cursor-pointer"
                title="Notificações"
              >
                <Bell size={17} />
                {naoLidas > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {naoLidas > 9 ? "9+" : naoLidas}
                  </span>
                )}
              </button>

              {notifAberta && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-xl z-50">
                  <div className="p-3 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-800">
                      Notificações · {meuMunicipio}
                    </p>
                  </div>
                  {notificacoes.length === 0 ? (
                    <p className="text-xs text-slate-400 font-medium p-4 text-center">
                      Nenhuma notificação ainda.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {notificacoes.map((n) => (
                        <div key={n.id} className="p-3 text-xs">
                          <p className="text-slate-700 font-semibold leading-snug">
                            {n.texto}
                          </p>
                          <p className="text-slate-400 mt-1">
                            {new Date(n.criadoEm).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Menu de abas */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-fit">
              {abas.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setAbaAtiva(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer
                    ${abaAtiva === id
                      ? "bg-[#0d43af] text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50"
                    }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid de Cards de Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-blue-600 rounded-2xl p-6 text-white flex flex-col justify-between h-36 shadow-sm lg:col-span-1">
            <Layers className="w-6 h-6 opacity-90" />
            <div>
              <h2 className="text-3xl font-black mb-1">{metricas.ativos}</h2>
              <p className="text-xs font-semibold opacity-90">Ativos</p>
            </div>
          </div>
          <div className="bg-red-600 rounded-2xl p-6 text-white flex flex-col justify-between h-36 shadow-sm lg:col-span-1">
            <AlertTriangle className="w-6 h-6 opacity-90" />
            <div>
              <h2 className="text-3xl font-black mb-1">{metricas.criticos}</h2>
              <p className="text-xs font-semibold opacity-90">Críticos</p>
            </div>
          </div>
          <div className="bg-amber-500 rounded-2xl p-6 text-white flex flex-col justify-between h-36 shadow-sm lg:col-span-1">
            <Wrench className="w-6 h-6 opacity-90" />
            <div>
              <h2 className="text-3xl font-black mb-1">{metricas.emAndamento}</h2>
              <p className="text-xs font-semibold opacity-90">Em Andamento</p>
            </div>
          </div>
          <div className="bg-emerald-700 rounded-2xl p-6 text-white flex flex-col justify-between h-36 shadow-sm lg:col-span-1">
            <CheckCircle className="w-6 h-6 opacity-90" />
            <div>
              <h2 className="text-3xl font-black mb-1">{metricas.concluidos}</h2>
              <p className="text-xs font-semibold opacity-90">Concluídos</p>
            </div>
          </div>
          <div className="bg-[#091c4b] rounded-2xl p-6 text-white flex flex-col justify-between h-36 shadow-sm lg:col-span-1">
            <MapPinned className="w-6 h-6 opacity-90" />
            <div>
              <h2 className="text-3xl font-black mb-1">
                {metricas.bairrosAfetados}
              </h2>
              <p className="text-xs font-semibold opacity-90">Bairros Afetados</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-900 flex flex-col justify-between h-36 shadow-sm lg:col-span-1">
            <Percent className="w-6 h-6 text-emerald-600" />
            <div>
              <h2 className="text-3xl font-black mb-1">
                {metricas.taxaConclusao}%
              </h2>
              <p className="text-xs font-semibold text-slate-500">Taxa de Conclusão</p>
            </div>
          </div>
        </div>

        {abaAtiva === "visao" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 text-base mb-6">
                  Ocorrências por Bairro
                </h3>
                <div className="h-64 w-full">
                  {metricas.dadosBarras.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">
                      Nenhum dado para exibir
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={metricas.dadosBarras}
                        margin={{ top: 10, right: 10, left: -25, bottom: 30 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#f1f5f9"
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: "#64748b", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                          angle={-25}
                          textAnchor="end"
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: "#64748b", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={35}>
                          {metricas.dadosBarras.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="font-bold text-slate-800 text-base mb-6">
                  Status dos Chamados (%)
                </h3>
                <div className="flex-1 grid grid-cols-2 gap-y-6 place-items-center">
                  {metricas.dadosPizza.map((item) => (
                    <AnelProgresso
                      key={item.name}
                      label={item.name}
                      valor={item.value}
                      cor={item.color}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                  <TrendingUp size={16} className="text-[#0d43af]" />
                  <h3 className="font-bold text-slate-800 text-base">
                    Tendência de Ocorrências (7 dias)
                  </h3>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={tendencia7dias}
                      margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="corTendencia" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0d43af" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0d43af" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#f1f5f9"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#0d43af"
                        strokeWidth={2.5}
                        fill="url(#corTendencia)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 text-base mb-6">
                  Principais Tipos de Ocorrência
                </h3>
                <div className="h-56 w-full">
                  {metricas.dadosPorTipo.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">
                      Nenhum dado para exibir
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={metricas.dadosPorTipo}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={false}
                          stroke="#f1f5f9"
                        />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          tick={{ fill: "#64748b", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={110}
                          tick={{ fill: "#334155", fontSize: 11, fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={18} fill="#0d43af" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <History className="w-5 h-5 text-slate-500" />
                <h3 className="font-bold text-slate-800 text-base">
                  Histórico de Ações Operacionais
                </h3>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-3 pr-2">
                {historicoLogs.length === 0 ? (
                  <div className="text-xs text-slate-400 py-2">
                    Nenhuma ação operacional registrada ainda.
                  </div>
                ) : (
                  historicoLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex justify-between items-center text-xs bg-slate-50 p-3 rounded-xl border border-slate-100"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`font-black uppercase tracking-wider ${log.cor_acao || "text-blue-500"}`}
                        >
                          • REGISTRO
                        </span>
                        <p className="text-slate-600 font-semibold">{log.acao}</p>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400 font-bold shrink-0">
                        <Clock size={12} />
                        <span>
                          {log.criado_at
                            ? new Date(log.criado_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                            : "--:--"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {abaAtiva === "ocorrencias" && (
          <>
            <div className="flex flex-col sm:flex-row gap-4 pb-6 mb-6 border-b border-slate-200">
              <div className="flex-1 max-w-xs relative">
                <select
                  value={prioridadeFiltro}
                  onChange={(e) => setPrioridadeFiltro(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                >
                  <option value="Todas as Prioridades">Todas as Prioridades</option>
                  <option value="Alerta Máximo">Alerta Máximo</option>
                  <option value="Estado de Alerta">Estado de Alerta</option>
                  <option value="Atenção Crítica">Atenção Crítica</option>
                  <option value="Zona Segura">Zona Segura</option>
                </select>
                <span className="absolute right-4 top-3.5 text-[9px] text-slate-400 pointer-events-none">
                  ▼
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {chamadosFiltrados.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 border border-slate-200 text-center text-slate-400 text-xs font-semibold">
                  Nenhuma ocorrência encontrada para esta combinação de filtros.
                </div>
              ) : (
                chamadosFiltrados.map((chamado) => (
                  <div
                    key={chamado.id}
                    className="flex flex-col md:flex-row bg-white rounded-2xl p-5 md:p-6 border border-slate-200 shadow-sm justify-between items-start md:items-center gap-6"
                  >
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          className="p-1.5 rounded-lg text-white shadow-sm"
                          style={{
                            backgroundColor:
                              CORES_PRIORIDADE[chamado.prioridade as keyof typeof CORES_PRIORIDADE]
                          }}
                        >
                          <AlertTriangle size={15} />
                        </div>
                        <h4 className="font-black text-slate-900 text-sm md:text-base">
                          {chamado.tipo}
                        </h4>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                          style={{
                            backgroundColor:
                              CORES_PRIORIDADE[chamado.prioridade as keyof typeof CORES_PRIORIDADE]
                          }}
                        >
                          {chamado.prioridade}
                        </span>
                        <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {chamado.bairro}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 font-semibold items-center">
                        <span>👤 {chamado.usuario}</span>
                        <span>📍 {chamado.endereco}</span>
                        <span>🕒 {chamado.tempo}</span>
                      </div>
                      <p className="text-slate-600 text-xs md:text-sm font-medium pt-1">
                        {chamado.descricao}
                      </p>
                    </div>

                    <div className="flex flex-col items-stretch md:items-end gap-2 shrink-0 w-full md:w-auto min-w-[170px]">
                      {chamado.statusAtual === "Aguardando" && (
                        <div className="flex flex-col gap-2 w-full">
                          <button
                            onClick={() => handleMarcarComoVisto(chamado.id)}
                            className="w-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm"
                          >
                            Marcar como Visto
                          </button>
                          <button
                            onClick={() => handleDespacharEquipe(chamado.id)}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all"
                          >
                            <Navigation size={12} className="fill-white" /> Despachar
                            Equipe
                          </button>
                        </div>
                      )}

                      {chamado.statusAtual === "Visualizado" && (
                        <div className="flex flex-col gap-2 w-full">
                          <span className="bg-blue-50 text-blue-600 border border-blue-100 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 justify-center">
                            <Eye size={12} /> Visualizado
                          </span>
                          <button
                            onClick={() => handleDespacharEquipe(chamado.id)}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all"
                          >
                            <Navigation size={12} className="fill-white" /> Despachar
                            Equipe
                          </button>
                        </div>
                      )}

                      {chamado.statusAtual === "Em Andamento" && (
                        <div className="flex flex-col gap-2 w-full">
                          <span className="bg-amber-50 text-amber-600 border border-amber-100 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 justify-center">
                            <Wrench size={12} /> Em Andamento
                          </span>
                          <button
                            onClick={() => handleMarcarConcluido(chamado.id)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all"
                          >
                            <CheckCircle size={12} /> Marcar Concluído
                          </button>
                        </div>
                      )}

                      {chamado.statusAtual === "Concluído" && (
                        <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-4 py-2 rounded-xl flex items-center justify-center gap-1 w-full text-center border border-emerald-200">
                          ✓ Finalizado
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
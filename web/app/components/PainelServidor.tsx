"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  Clock3,
  Loader2,
  Search,
  ShieldAlert,
  Smartphone,
  Wifi,
  X,
} from "lucide-react";
import { supabase } from "@/app/lib/banco";
import {
  MUNICIPIOS,
  normalizar,
  PRIORIDADES,
  TIPOS_ALERTA_MANUAL,
} from "@/app/lib/constantes";
import {
  buscarHistoricoAlertas,
  buscarStatusCanais,
  dispararAlertaManual,
  simularAlertaManual,
  type Alerta,
  type Prioridade,
  type RegistroHistoricoAlerta,
  type RelatorioDisparo,
  type StatusCanaisAlerta,
} from "@/app/lib/alertas";
const CAMPO_CLASSE =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#0f2a8f] focus:ring-2 focus:ring-[#0f2a8f]/10 disabled:bg-slate-100";

type PapelAcesso = "admin" | "servidor";

function rotuloOrigem(origem: string | null): string {
  if (origem === "openweather") return "OpenWeather";
  if (origem === "manual") return "Manual";
  if (origem === "openweather_mock") return "Teste OpenWeather";
  return origem || "Alerta";
}

export default function PainelServidor({
  somenteEmissao = false,
}: {
  somenteEmissao?: boolean;
}) {
  const router = useRouter();
  const [papelAcesso, setPapelAcesso] = useState<PapelAcesso | null>(null);
  const [municipioServidor, setMunicipioServidor] = useState("");
  const [carregandoPagina, setCarregandoPagina] = useState(true);
  const [erroPermissao, setErroPermissao] = useState<string | null>(null);

  const [tipo, setTipo] = useState<(typeof TIPOS_ALERTA_MANUAL)[number] | "">("");
  const [prioridade, setPrioridade] = useState<Prioridade>("Atenção Crítica");
  const [endereco, setEndereco] = useState("");
  const [descricao, setDescricao] = useState("");
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroDisparo, setErroDisparo] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioDisparo | null>(null);
  const [popupSimulado, setPopupSimulado] = useState<Alerta | null>(null);

  const [statusCanais, setStatusCanais] = useState<StatusCanaisAlerta | null>(null);
  const [erroStatus, setErroStatus] = useState<string | null>(null);
  const [historico, setHistorico] = useState<RegistroHistoricoAlerta[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);
  const [buscaHistorico, setBuscaHistorico] = useState("");

  useEffect(() => {
    let ativo = true;

    const verificarAcesso = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Erro ao validar acesso ao painel de alertas:", error);
      }
      if (!data.user) {
        router.replace("/login");
        return;
      }

      const { data: administrador, error: erroAdministrador } = await supabase
        .from("admin")
        .select("id")
        .eq("auth_id", data.user.id)
        .maybeSingle();
      if (erroAdministrador) {
        console.error("Erro ao validar perfil administrativo:", erroAdministrador);
        if (ativo) {
          setErroPermissao("Não foi possível confirmar sua permissão de acesso.");
          setCarregandoPagina(false);
        }
        return;
      }
      if (administrador) {
        if (ativo) {
          setPapelAcesso("admin");
          setMunicipioServidor(MUNICIPIOS[0]);
          setCarregandoPagina(false);
        }
        return;
      }

      const { data: servidor, error: erroServidor } = await supabase
        .from("servidor")
        .select("municipio")
        .eq("auth_id", data.user.id)
        .maybeSingle();

      if (erroServidor) {
        console.error("Erro ao validar perfil de servidor:", erroServidor);
        if (ativo) {
          setErroPermissao("Não foi possível confirmar sua permissão de servidor.");
          setCarregandoPagina(false);
        }
        return;
      }
      if (!servidor?.municipio) {
        router.replace("/Mapa");
        return;
      }
      const municipioOficial = MUNICIPIOS.find(
        (municipio) => normalizar(municipio) === normalizar(servidor.municipio),
      );
      if (!municipioOficial) {
        if (ativo) {
          setErroPermissao("O perfil de servidor não possui um município válido.");
          setCarregandoPagina(false);
        }
        return;
      }

      if (ativo) {
        setPapelAcesso("servidor");
        setMunicipioServidor(municipioOficial);
        setCarregandoPagina(false);
      }
    };

    void verificarAcesso();
    return () => {
      ativo = false;
    };
  }, [router]);

  useEffect(() => {
    if (somenteEmissao || carregandoPagina || erroPermissao || !municipioServidor) return;
    let ativo = true;

    const carregarDados = async () => {
      setCarregandoHistorico(true);
      const [resultadoHistorico, resultadoStatus] = await Promise.allSettled([
        buscarHistoricoAlertas(municipioServidor),
        buscarStatusCanais(),
      ]);

      if (!ativo) return;
      if (resultadoHistorico.status === "fulfilled") {
        setHistorico(resultadoHistorico.value);
        setErroHistorico(null);
      } else {
        console.error("Erro ao carregar histórico de alertas:", resultadoHistorico.reason);
        setErroHistorico("Não foi possível carregar o histórico de alertas.");
      }
      if (resultadoStatus.status === "fulfilled") {
        setStatusCanais(resultadoStatus.value);
        setErroStatus(null);
      } else {
        console.error("Erro ao consultar canais de alerta:", resultadoStatus.reason);
        setErroStatus("Não foi possível consultar a disponibilidade dos canais.");
      }
      setCarregandoHistorico(false);
    };

    void carregarDados();
    return () => {
      ativo = false;
    };
  }, [carregandoPagina, erroPermissao, municipioServidor, somenteEmissao]);

  const historicoFiltrado = useMemo(() => {
    const consulta = buscaHistorico.trim().toLocaleLowerCase("pt-BR");
    if (!consulta) return historico;
    return historico.filter((alerta) =>
      [
        alerta.tipo,
        alerta.prioridade,
        alerta.municipio ?? "",
        alerta.endereco ?? "",
        alerta.descricao ?? "",
        rotuloOrigem(alerta.origem),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(consulta),
    );
  }, [buscaHistorico, historico]);

  const entradaAlerta = () => ({
    tipo,
    prioridade,
    municipio: municipioServidor,
    endereco: endereco.trim() || "Toda a área do município",
    descricao: descricao.trim(),
  });

  const handleRevisar = (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setErroDisparo(null);
    setRelatorio(null);
    setPopupSimulado(null);
    setConfirmacaoAberta(true);
  };

  const handleAtualizarHistorico = async () => {
    setCarregandoHistorico(true);
    setErroHistorico(null);
    try {
      setHistorico(await buscarHistoricoAlertas(municipioServidor));
    } catch (erro) {
      console.error("Erro ao atualizar histórico de alertas:", erro);
      setErroHistorico("Não foi possível atualizar o histórico de alertas.");
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const handleEnviarAlerta = async () => {
    setEnviando(true);
    setErroDisparo(null);
    setRelatorio(null);
    setPopupSimulado(null);
    try {
      const resultado = await dispararAlertaManual(entradaAlerta());
      setRelatorio(resultado);
      setConfirmacaoAberta(false);
      if (!somenteEmissao) await handleAtualizarHistorico();
    } catch (erro) {
      console.error("Falha ao disparar alerta manual:", erro);
      setErroDisparo(
        erro instanceof Error
          ? erro.message
          : "Não foi possível falar com o servidor de alertas.",
      );
    } finally {
      setEnviando(false);
    }
  };

  const handleSimularPopup = async () => {
    setEnviando(true);
    setErroDisparo(null);
    setRelatorio(null);
    setPopupSimulado(null);
    try {
      const resultado = await simularAlertaManual(entradaAlerta());
      setRelatorio(resultado);
      setPopupSimulado(resultado.alerta);
    } catch (erro) {
      console.error("Falha ao simular popup:", erro);
      setErroDisparo(
        erro instanceof Error
          ? erro.message
          : "Não foi possível simular o popup.",
      );
    } finally {
      setEnviando(false);
    }
  };

  if (carregandoPagina) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 size={24} className="animate-spin text-[#0f35a0]" />
        <span className="sr-only">Verificando acesso...</span>
      </main>
    );
  }

  if (erroPermissao) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {erroPermissao}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-[#0f35a0]">
            {papelAcesso === "admin" ? "Painel Administrativo" : "Painel da Prefeitura"} · {municipioServidor}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            {somenteEmissao ? "Emitir alerta" : "Central de alertas"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {somenteEmissao
              ? "Preencha os dados do alerta e revise a mensagem antes de confirmar o envio."
              : "Revise cada mensagem antes do envio. Alertas reais notificam a população pelos canais disponíveis."}
          </p>
          {somenteEmissao && (
            <Link
              href={papelAcesso === "admin" ? "/Adm" : "/Prefeituras"}
              className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#0f35a0] hover:underline"
            >
              <ArrowLeft size={16} />
              Voltar ao painel
            </Link>
          )}
        </header>

        {!somenteEmissao && (
          <section aria-label="Disponibilidade dos canais" className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Wifi size={17} className="text-[#0f35a0]" />
              Popup do site
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {statusCanais
                ? `${statusCanais.navegadores_conectados} navegador(es) conectado(s)`
                : erroStatus ?? "Consultando..."}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <BellRing size={17} className="text-[#0f35a0]" />
              WhatsApp
            </div>
            <p className={`mt-2 text-sm ${statusCanais?.whatsapp_configurado ? "text-emerald-700" : "text-amber-700"}`}>
              {statusCanais?.whatsapp_configurado
                ? statusCanais.whatsapp_motivo ?? "Conectado e pronto"
                : statusCanais?.whatsapp_motivo ?? erroStatus ?? "Consultando..."}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Smartphone size={17} className="text-[#0f35a0]" />
              Notificação no app
            </div>
            <p className={`mt-2 text-sm ${statusCanais?.push_configurado ? "text-emerald-700" : "text-amber-700"}`}>
              {statusCanais?.push_configurado
                ? "Firebase configurado"
                : statusCanais?.push_motivo ?? erroStatus ?? "Consultando..."}
            </p>
          </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 border-t-4 border-t-red-500 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
              <ShieldAlert size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Emitir alerta manual</h2>
              <p className="mt-1 text-sm text-slate-600">
                O alerta será restrito a {municipioServidor}. A simulação abaixo só exibe o popup e não envia notificações.
              </p>
            </div>
          </div>

          <form onSubmit={handleRevisar} className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              Tipo de alerta
              <select
                required
                value={tipo}
                onChange={(evento) => setTipo(evento.target.value as typeof tipo)}
                className={`${CAMPO_CLASSE} mt-1.5`}
              >
                <option value="" disabled>Selecione um tipo</option>
                {TIPOS_ALERTA_MANUAL.map((opcao) => (
                  <option key={opcao} value={opcao}>{opcao}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Prioridade
              <select
                value={prioridade}
                onChange={(evento) => setPrioridade(evento.target.value as Prioridade)}
                className={`${CAMPO_CLASSE} mt-1.5`}
              >
                {PRIORIDADES.map((opcao) => (
                  <option key={opcao} value={opcao}>{opcao}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              {papelAcesso === "admin" ? "Município" : "Município autorizado"}
              {papelAcesso === "admin" ? (
                <select
                  value={municipioServidor}
                  onChange={(evento) => setMunicipioServidor(evento.target.value)}
                  className={`${CAMPO_CLASSE} mt-1.5`}
                >
                  {MUNICIPIOS.map((municipio) => (
                    <option key={municipio} value={municipio}>{municipio}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={municipioServidor}
                  readOnly
                  className={`${CAMPO_CLASSE} mt-1.5`}
                />
              )}
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Endereço ou região afetada
              <input
                value={endereco}
                onChange={(evento) => setEndereco(evento.target.value)}
                maxLength={200}
                placeholder="Ex.: região central ou toda a cidade"
                className={`${CAMPO_CLASSE} mt-1.5`}
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700 md:col-span-2">
              Descrição e instruções de segurança
              <textarea
                required
                minLength={5}
                maxLength={2000}
                rows={4}
                value={descricao}
                onChange={(evento) => setDescricao(evento.target.value)}
                placeholder="Informe o risco, a área afetada e as orientações para a população."
                className={`${CAMPO_CLASSE} mt-1.5 resize-y`}
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row md:col-span-2">
              <button
                type="submit"
                disabled={enviando || !tipo || descricao.trim().length < 5}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0d1b54] px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#0d163b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f2a8f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShieldAlert size={17} />
                Revisar alerta real
              </button>
              <button
                type="button"
                onClick={handleSimularPopup}
                disabled={enviando || !tipo || descricao.trim().length < 5}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enviando ? <Loader2 size={17} className="animate-spin" /> : <AlertTriangle size={17} />}
                Testar popup (simulação)
              </button>
            </div>
          </form>

          {confirmacaoAberta && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-700" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-red-900">Confirme o envio de um alerta real</h3>
                  <p className="mt-1 text-sm text-red-800">
                    Esta ação pode notificar moradores por WhatsApp e pelo aplicativo.
                  </p>
                  <dl className="mt-4 grid gap-2 text-sm text-slate-800 sm:grid-cols-2">
                    <div><dt className="font-bold">Tipo</dt><dd>{tipo}</dd></div>
                    <div><dt className="font-bold">Prioridade</dt><dd>{prioridade}</dd></div>
                    <div><dt className="font-bold">Município</dt><dd>{municipioServidor}</dd></div>
                    <div><dt className="font-bold">Região</dt><dd>{endereco.trim() || "Toda a área do município"}</dd></div>
                    <div className="sm:col-span-2"><dt className="font-bold">Descrição</dt><dd className="whitespace-pre-wrap">{descricao.trim()}</dd></div>
                  </dl>
                  <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setConfirmacaoAberta(false)}
                      disabled={enviando}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Voltar e revisar
                    </button>
                    <button
                      type="button"
                      onClick={handleEnviarAlerta}
                      disabled={enviando}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
                    >
                      {enviando && <Loader2 size={16} className="animate-spin" />}
                      Confirmar e enviar alerta
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {erroDisparo && (
            <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {erroDisparo}
            </p>
          )}

          {relatorio && (
            <div
              role="status"
              className={`mt-4 rounded-xl border p-4 text-sm ${
                relatorio.simulacao
                  ? "border-amber-200 bg-amber-50 text-amber-950"
                  : relatorio.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              <strong>
                {relatorio.simulacao
                  ? "Prévia local criada — nenhum outro usuário ou canal externo foi notificado."
                  : relatorio.ok
                    ? "Alerta processado."
                    : "O alerta foi registrado, mas nenhum canal confirmou entrega."}
              </strong>
              <p className="mt-1 font-semibold">{relatorio.alerta.titulo}</p>
              <ul className="mt-3 space-y-1 text-xs">
                <li>
                  Popup: {relatorio.simulacao
                    ? "prévia somente nesta tela"
                    : `${relatorio.canais.web.entregues ?? 0} navegador(es) receberam`}
                </li>
                <li>
                  WhatsApp: {relatorio.canais.whatsapp.ok
                    ? `${relatorio.canais.whatsapp.enviados ?? 0}/${relatorio.canais.whatsapp.total ?? 0} enviados`
                    : relatorio.canais.whatsapp.motivo ?? "não enviado"}
                </li>
                <li>
                  Aplicativo: {relatorio.canais.push.ok
                    ? `${relatorio.canais.push.enviados ?? 0}/${relatorio.canais.push.total ?? 0} enviados`
                    : relatorio.canais.push.motivo ?? "não enviado"}
                </li>
                <li>Histórico: {relatorio.persistido ? "registrado" : "não gravado"}</li>
              </ul>
            </div>
          )}
        </section>

        {popupSimulado && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-popup-simulado"
            className="fixed inset-0 z-[10002] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 pt-8 backdrop-blur-sm"
          >
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div
                className="flex items-start gap-3 px-5 py-4 text-white"
                style={{ backgroundColor: popupSimulado.cor }}
              >
                <span className="text-2xl leading-none">{popupSimulado.icone}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider">
                    SIMULAÇÃO — NÃO É UM ALERTA REAL
                  </p>
                  <h2 id="titulo-popup-simulado" className="text-lg font-black">
                    {popupSimulado.tipo.toUpperCase()}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setPopupSimulado(null)}
                  aria-label="Fechar prévia do popup"
                  className="rounded-lg p-1 hover:bg-white/20"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
                <p><strong>Localização: </strong>{popupSimulado.municipio}</p>
                <p><strong>Endereço/região: </strong>{popupSimulado.endereco}</p>
                <p>
                  <strong>Prioridade: </strong>
                  <span style={{ color: popupSimulado.cor }}>{popupSimulado.prioridade}</span>
                </p>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Descrição do ocorrido
                  </p>
                  <p className="whitespace-pre-line leading-relaxed">{popupSimulado.descricao}</p>
                </div>
                <p className="text-xs font-semibold text-amber-800">
                  Esta prévia aparece apenas para você e não foi enviada à população.
                </p>
              </div>
              <div className="flex justify-end border-t border-slate-100 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setPopupSimulado(null)}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                  style={{ backgroundColor: popupSimulado.cor }}
                >
                  Fechar prévia
                </button>
              </div>
            </div>
          </div>
        )}

        {!somenteEmissao && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Clock3 size={18} className="text-[#0f35a0]" />
                <h2 className="text-lg font-bold text-slate-900">Histórico de alertas</h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Registros recentes de {municipioServidor}.
              </p>
            </div>
            <label className="relative block w-full sm:max-w-xs">
              <span className="sr-only">Pesquisar no histórico</span>
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={buscaHistorico}
                onChange={(evento) => setBuscaHistorico(evento.target.value)}
                placeholder="Pesquisar alertas"
                className={`${CAMPO_CLASSE} pl-9`}
              />
            </label>
          </div>

          {erroHistorico && (
            <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erroHistorico}
            </p>
          )}
          {carregandoHistorico ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 size={17} className="animate-spin" />
              Carregando histórico...
            </div>
          ) : erroHistorico ? null : historicoFiltrado.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {buscaHistorico ? "Nenhum alerta corresponde à pesquisa." : "Ainda não há alertas registrados para este município."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {historicoFiltrado.map((alerta) => (
                <li key={alerta.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{alerta.tipo}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                        {alerta.prioridade}
                      </span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800">
                        {rotuloOrigem(alerta.origem)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {alerta.endereco || "Toda a área do município"} · {alerta.descricao || "Sem descrição"}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-500">
                    {new Date(alerta.criado_em).toLocaleString("pt-BR")}
                  </time>
                </li>
              ))}
            </ul>
          )}
          </section>
        )}
      </div>
    </main>
  );
}

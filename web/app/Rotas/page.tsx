"use client";

import { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowUp,
  ArrowUpDown,
  Check,
  Clock,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  RotateCcw,
  Route,
  Search,
  X,
} from "lucide-react";
import { MUNICIPIOS, normalizar, type Municipio } from "@/app/lib/constantes";
import type { Coordenada } from "@/app/lib/geo";
import { obterPosicaoAtual, type EstadoLocalizacao } from "@/app/lib/localizacao";
import {
  ERRO_CONEXAO,
  carregarDadosCidade,
  listarCidadesComRotas,
  mensagemDeErro,
  type DadosCidade,
  type Ponto,
  type ResultadoRota,
  type TipoManobra,
} from "@/app/lib/rotas/api";
import {
  descreverOcorrencia,
  dividirTracado,
  type ProgressoNavegacao,
  type RotaNavegacao,
} from "@/app/lib/rotas/navegacao";
import {
  CAMPO_VAZIO,
  assinarSessao,
  gravarSessao,
  lerSessao,
  lerSessaoNoServidor,
  type CampoPonto,
} from "@/app/lib/rotas/sessao";
import { useNavegacao, type AvisoRota, type EtapaNavegacao } from "@/app/lib/rotas/useNavegacao";

const MapaRotasSemSSR = dynamic(() => import("@/app/components/MapaRotasComponent"), {
  ssr: false,
  loading: () => <CarregandoMapa texto="Carregando mapa..." />,
});

const CHAVE_CIDADE_SALVA = "pluvite:rotas:cidade";
const MAX_SUGESTOES = 8;

// ?simular (ou ?simular=20, em m/s) faz o "veículo" percorrer a rota sozinho ao navegar —
// demonstração da navegação em sala, sem GPS
const VELOCIDADE_SIMULACAO_PADRAO = 12; // m/s ≈ 43 km/h

const ICONE_MANOBRA: Record<TipoManobra, typeof ArrowUp> = {
  inicio: Navigation,
  reto: ArrowUp,
  direita: CornerUpRight,
  esquerda: CornerUpLeft,
  retorno: RotateCcw,
  chegada: Flag,
};

const MENSAGEM_LOCALIZACAO: Record<EstadoLocalizacao, string | null> = {
  desligada: null,
  ativa: null,
  buscando: "Obtendo sua localização...",
  negada:
    "Permita o acesso à localização no navegador (o site precisa estar em HTTPS) para acompanhar o trajeto.",
  falha: "Sinal de GPS fraco. Tentando novamente...",
  indisponivel: "Seu navegador não permite obter a localização.",
};

const ESTILO_AVISO: Record<AvisoRota["tipo"], string> = {
  ocorrencia: "bg-amber-50 border-amber-200 text-amber-800",
  desvio: "bg-blue-50 border-blue-200 text-[#0f35a0]",
  erro: "bg-red-50 border-red-200 text-red-600",
};

// Campo usado nos inputs de origem/destino (mesmo padrão do Feed)
const CAMPO_CLASSE =
  "w-full bg-white border border-slate-200 rounded-2xl pl-9 pr-9 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#0f2a8f] focus:ring-2 focus:ring-[#0f2a8f]/10 placeholder:text-slate-400";

// Painéis flutuantes da navegação: largura total no celular, centralizados no desktop
const PAINEL_NAVEGACAO =
  "absolute inset-x-3 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[520px] z-[1000]";

const formatarDistancia = (metros: number) =>
  metros < 1000
    ? `${Math.round(metros)} m`
    : `${(metros / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;

const formatarDuracao = (segundos: number) => {
  const minutos = Math.max(1, Math.round(segundos / 60));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `${horas} h ${String(minutos % 60).padStart(2, "0")} min`;
};

const horaDeChegada = (segundos: number) =>
  new Date(Date.now() + segundos * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

const coordenadaDoPonto = (ponto: Ponto | null): Coordenada | null =>
  ponto && "lat" in ponto ? [ponto.lat, ponto.lng] : null;

const semAssinatura = () => () => {};

const lerCidadeSalva = (): Municipio | null => {
  try {
    const salva = localStorage.getItem(CHAVE_CIDADE_SALVA);
    return MUNICIPIOS.find((m) => m === salva) ?? null;
  } catch {
    // Sem acesso ao localStorage: o usuário só escolhe a cidade manualmente
    return null;
  }
};

const lerVelocidadeSimulacao = (): number | null => {
  const valor = new URLSearchParams(window.location.search).get("simular");
  if (valor === null) return null;
  const velocidade = Number(valor);
  return Number.isFinite(velocidade) && velocidade > 0 ? velocidade : VELOCIDADE_SIMULACAO_PADRAO;
};

function CarregandoMapa({ texto }: { texto: string }) {
  return (
    <div className="h-full w-full bg-slate-900 flex items-center justify-center text-white">
      <p className="animate-pulse tracking-wide text-sm font-medium">{texto}</p>
    </div>
  );
}

/**
 * Campo de rua com autocompletar a partir das ruas do grafo da cidade.
 * O ponto só é considerado escolhido quando o usuário seleciona uma sugestão
 * (ou usa GPS / clique no mapa), garantindo que o backend conheça a rua.
 */
function CampoRua({
  id,
  placeholder,
  corMarcador,
  valor,
  ruas,
  onChange,
}: {
  id: string;
  placeholder: string;
  corMarcador: string;
  valor: CampoPonto;
  ruas: string[];
  onChange: (valor: CampoPonto) => void;
}) {
  const [focado, setFocado] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(0);

  const sugestoes = useMemo(() => {
    const termo = normalizar(valor.texto);
    if (valor.ponto || termo.length < 2) return [];
    const encontradas = ruas.filter((rua) => normalizar(rua).includes(termo));
    // Prioriza ruas em que alguma palavra começa com o termo digitado
    const comecaCom = (rua: string) =>
      normalizar(rua)
        .split(" ")
        .some((palavra) => palavra.startsWith(termo));
    return [...encontradas.filter(comecaCom), ...encontradas.filter((r) => !comecaCom(r))].slice(
      0,
      MAX_SUGESTOES,
    );
  }, [valor, ruas]);

  const aberto = focado && sugestoes.length > 0;

  const selecionar = (rua: string) => {
    onChange({ texto: rua, ponto: { rua } });
    setFocado(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!aberto) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceAtivo((i) => Math.min(sugestoes.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceAtivo((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selecionar(sugestoes[indiceAtivo]);
    } else if (e.key === "Escape") {
      setFocado(false);
    }
  };

  return (
    <div className="relative">
      <span
        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ring-2 ring-white shadow"
        style={{ backgroundColor: corMarcador }}
      />
      <input
        id={id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        placeholder={placeholder}
        value={valor.texto}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        onChange={(e) => {
          setIndiceAtivo(0);
          setFocado(true);
          onChange({ texto: e.target.value, ponto: null });
        }}
        onKeyDown={handleKeyDown}
        className={CAMPO_CLASSE}
      />
      {valor.texto && (
        <button
          type="button"
          aria-label="Limpar campo"
          onClick={() => onChange(CAMPO_VAZIO)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          <X size={15} />
        </button>
      )}

      {aberto && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-64 overflow-y-auto rounded-2xl border border-[#3d5cc9] bg-[#091f75] p-1.5 shadow-xl shadow-[#091f75]/30"
        >
          {sugestoes.map((rua, i) => (
            <li
              key={rua}
              role="option"
              aria-selected={i === indiceAtivo}
              // onMouseDown evita que o blur do input feche a lista antes do clique
              onMouseDown={(e) => {
                e.preventDefault();
                selecionar(rua);
              }}
              onMouseEnter={() => setIndiceAtivo(i)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer transition-colors ${
                i === indiceAtivo ? "bg-white/15 text-white" : "text-white/85"
              }`}
            >
              <MapPin size={13} className="shrink-0 opacity-70" />
              <span className="truncate">{rua}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Caixa inicial: pergunta em qual cidade do Vale o usuário está (larga e baixa: busca no
// cabeçalho e municípios em várias colunas)
function ModalCidade({
  cidadeAtual,
  cidadesDisponiveis,
  erroServidor,
  onConfirmar,
  onFechar,
}: {
  cidadeAtual: Municipio | null;
  cidadesDisponiveis: string[] | null;
  erroServidor: boolean;
  onConfirmar: (cidade: Municipio) => void;
  onFechar: (() => void) | null;
}) {
  const [busca, setBusca] = useState("");
  const [escolhida, setSelecionada] = useState<Municipio | null>(cidadeAtual);
  // Pré-seleciona a última cidade usada; no servidor é sempre null, então o HTML não diverge
  const cidadeSalva = useSyncExternalStore(semAssinatura, lerCidadeSalva, () => null);
  const selecionada = escolhida ?? cidadeSalva;

  const cidadesFiltradas = MUNICIPIOS.filter((m) => normalizar(m).includes(normalizar(busca)));
  const disponivel = (cidade: string) =>
    !cidadesDisponiveis || cidadesDisponiveis.includes(normalizar(cidade));

  const botaoFechar = onFechar && (
    <button
      type="button"
      aria-label="Fechar"
      onClick={onFechar}
      className="shrink-0 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
    >
      <X size={18} />
    </button>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[10001] flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-modal-cidade"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
      >
        {/* CABEÇALHO: título e busca na mesma faixa (empilham no celular) */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#091f75]/[0.08] text-[#091f75] flex items-center justify-center shrink-0">
              <Route size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="titulo-modal-cidade" className="font-bold text-slate-800 text-base leading-tight">
                Em qual cidade você está?
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Escolha um dos 39 municípios do Vale do Paraíba e Litoral Norte para carregar o mapa
                de ruas.
              </p>
            </div>
            <div className="md:hidden">{botaoFechar}</div>
          </div>

          {/* BUSCA */}
          <div className="relative md:w-72 shrink-0">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              autoFocus
              placeholder="Buscar cidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className={CAMPO_CLASSE}
            />
          </div>
          <div className="hidden md:block">{botaoFechar}</div>
        </div>

        {erroServidor && (
          <p className="mx-4 sm:mx-5 mt-3 bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-3 py-2 rounded-xl">
            {ERRO_CONEXAO}
          </p>
        )}

        {/* LISTA DE MUNICÍPIOS */}
        <div className="px-4 sm:px-5 py-3 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 content-start">
          {cidadesFiltradas.map((cidade) => {
            const ativa = cidade === selecionada;
            const habilitada = disponivel(cidade);
            return (
              <button
                key={cidade}
                type="button"
                disabled={!habilitada}
                onClick={() => setSelecionada(cidade)}
                onDoubleClick={() => habilitada && onConfirmar(cidade)}
                className={`flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-xl text-[13px] text-left border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                  ativa
                    ? "bg-[#091f75] border-[#091f75] text-white font-semibold"
                    : "bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="truncate">{cidade}</span>
                {ativa && <Check size={14} className="shrink-0" />}
                {!habilitada && (
                  <span className="text-[10px] font-bold uppercase tracking-wider shrink-0">
                    Em breve
                  </span>
                )}
              </button>
            );
          })}
          {cidadesFiltradas.length === 0 && (
            <p className="col-span-full text-center text-sm text-slate-500 py-6">
              Nenhuma cidade encontrada.
            </p>
          )}
        </div>

        {/* RODAPÉ */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex sm:justify-end">
          <button
            type="button"
            disabled={!selecionada || !disponivel(selecionada)}
            onClick={() => selecionada && onConfirmar(selecionada)}
            className="w-full sm:w-auto sm:px-6 bg-[#0d1b54] hover:bg-[#0d163b] text-white text-sm font-bold py-2.5 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MapPin size={16} />
            {selecionada ? `Carregar mapa de ${selecionada}` : "Selecione uma cidade"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Aviso de recálculo (ocorrência nova no trajeto, saída da rota ou falha ao recalcular)
function AvisoRecalculo({
  aviso,
  calculando,
  rota,
  onFechar,
}: {
  aviso: AvisoRota;
  calculando: boolean;
  rota: RotaNavegacao | null;
  onFechar: () => void;
}) {
  let complemento = "";
  if (aviso.tipo === "ocorrencia") {
    const semAlternativa = rota?.ocorrencias.naRota.some((o) => aviso.ocorrencias?.includes(o.id));
    complemento = calculando
      ? " Recalculando a rota..."
      : semAlternativa
        ? " Não há caminho alternativo: a rota ainda passa pela área."
        : " Rota recalculada para desviar.";
  }

  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-medium shadow-sm ${ESTILO_AVISO[aviso.tipo]}`}
    >
      {calculando ? (
        <Loader2 size={15} className="animate-spin shrink-0 mt-px" />
      ) : (
        <AlertTriangle size={15} className="shrink-0 mt-px" />
      )}
      <p className="flex-1 leading-snug">
        {aviso.texto}
        {complemento}
      </p>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={onFechar}
        className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Ocorrências do Feed que a rota evitou ou não conseguiu evitar
function ResumoOcorrencias({ ocorrencias }: { ocorrencias: ResultadoRota["ocorrencias"] }) {
  if (ocorrencias.indisponiveis) {
    return (
      <p className="px-4 pt-3 text-[11px] text-slate-500">
        Não foi possível consultar as ocorrências do Feed agora: a rota não considera alagamentos e
        bloqueios recentes.
      </p>
    );
  }
  if (ocorrencias.evitadas.length === 0 && ocorrencias.naRota.length === 0) return null;

  return (
    <div className="px-4 pt-3 space-y-2">
      {ocorrencias.evitadas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle size={14} className="shrink-0" />
            Rota desviada de{" "}
            {ocorrencias.evitadas.length === 1
              ? "1 ocorrência do Feed"
              : `${ocorrencias.evitadas.length} ocorrências do Feed`}
          </p>
          <ul className="mt-1 space-y-0.5 pl-5 list-disc">
            {ocorrencias.evitadas.map((o) => (
              <li key={o.id}>{descreverOcorrencia(o)}</li>
            ))}
          </ul>
        </div>
      )}
      {ocorrencias.naRota.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle size={14} className="shrink-0" />
            Sem caminho alternativo: a rota passa por
          </p>
          <ul className="mt-1 space-y-0.5 pl-5 list-disc">
            {ocorrencias.naRota.map((o) => (
              <li key={o.id}>{descreverOcorrencia(o)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// NAVEGAÇÃO: próxima manobra (topo da tela)
function PainelManobra({
  rota,
  progresso,
  estadoLocalizacao,
  simulando,
  children,
}: {
  rota: RotaNavegacao;
  progresso: ProgressoNavegacao | null;
  estadoLocalizacao: EstadoLocalizacao;
  simulando: boolean;
  children: React.ReactNode;
}) {
  // Antes da primeira leitura do GPS mostra a primeira instrução da rota
  const manobra = progresso
    ? (rota.instrucoes[progresso.passoAtual + 1] ?? rota.instrucoes[progresso.passoAtual])
    : rota.instrucoes[0];
  const distancia = progresso ? progresso.distanciaProximaManobra : rota.instrucoes[0].distancia;
  const Icone = ICONE_MANOBRA[manobra.tipo];
  const mensagemGps = MENSAGEM_LOCALIZACAO[estadoLocalizacao];

  return (
    <div className={`${PAINEL_NAVEGACAO} top-3 space-y-2`}>
      <div className="bg-[#091f75] text-white rounded-2xl shadow-xl p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
          <Icone size={30} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-black leading-none">{formatarDistancia(distancia)}</p>
          <p className="text-sm text-white/75 mt-1.5 leading-snug">{manobra.texto}</p>
          <p className="text-base font-bold truncate">{manobra.rua}</p>
        </div>
        {simulando && (
          <span className="self-start text-[10px] font-bold uppercase tracking-wider bg-white/15 px-2 py-1 rounded-lg">
            Simulação
          </span>
        )}
      </div>
      {children}
      {mensagemGps && (
        <p className="bg-white border border-slate-200 shadow-sm text-slate-700 text-xs font-medium px-3 py-2.5 rounded-xl flex items-center gap-2">
          <LocateFixed size={14} className="shrink-0 text-[#0f35a0]" />
          {mensagemGps}
        </p>
      )}
    </div>
  );
}

// NAVEGAÇÃO: tempo e distância restantes / chegada (rodapé da tela)
function ResumoNavegacao({
  rota,
  progresso,
  etapa,
  onEncerrar,
}: {
  rota: RotaNavegacao;
  progresso: ProgressoNavegacao | null;
  etapa: EtapaNavegacao;
  onEncerrar: () => void;
}) {
  if (etapa === "chegada") {
    return (
      <div className={`${PAINEL_NAVEGACAO} bottom-3 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 flex items-center gap-3`}>
        <div className="w-11 h-11 rounded-xl bg-[#0a9667]/10 text-[#0a9667] flex items-center justify-center shrink-0">
          <Flag size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-900 text-lg leading-tight">Você chegou ao destino</p>
          <p className="text-xs text-slate-500 truncate">{rota.destinoTexto}</p>
        </div>
        <button
          type="button"
          onClick={onEncerrar}
          className="shrink-0 bg-[#0d1b54] hover:bg-[#0d163b] text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-md cursor-pointer"
        >
          Concluir
        </button>
      </div>
    );
  }

  const tempo = progresso?.tempoRestante ?? rota.duracaoSegundos;
  const distancia = progresso?.restante ?? rota.distanciaMetros;
  return (
    <div className={`${PAINEL_NAVEGACAO} bottom-3 bg-white rounded-2xl border border-slate-200 shadow-xl p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-black text-slate-900 leading-none">{formatarDuracao(tempo)}</p>
          <p className="text-xs text-slate-500 mt-1.5">
            {formatarDistancia(distancia)} · chegada às {horaDeChegada(tempo)}
          </p>
        </div>
        <button
          type="button"
          onClick={onEncerrar}
          className="shrink-0 text-xs font-bold text-red-500 hover:text-white bg-red-50 hover:bg-red-500 border border-red-100 hover:border-red-500 rounded-xl px-4 py-2.5 transition-all cursor-pointer"
        >
          Encerrar
        </button>
      </div>
      {rota.ocorrencias.naRota.length > 0 && (
        <p className="mt-2.5 text-[11px] font-semibold text-red-600 flex items-center gap-1.5">
          <AlertTriangle size={13} className="shrink-0" />
          Trecho com ocorrência sem desvio possível:{" "}
          {rota.ocorrencias.naRota.map(descreverOcorrencia).join("; ")}
        </p>
      )}
    </div>
  );
}

export default function RotasPage() {
  // Cidade e trajeto ficam no store de sessão: sair para o Feed e voltar não apaga o que já foi
  // preenchido. Antes de hidratar o valor é null (o servidor não lê sessionStorage).
  const sessao = useSyncExternalStore(assinarSessao, lerSessao, lerSessaoNoServidor);
  const cidade = sessao?.cidade ?? null;
  const origem = sessao?.origem ?? CAMPO_VAZIO;
  const destino = sessao?.destino ?? CAMPO_VAZIO;

  const [trocandoCidade, setTrocandoCidade] = useState(false);
  const [cidadesDisponiveis, setCidadesDisponiveis] = useState<string[] | null>(null);
  const [erroServidor, setErroServidor] = useState(false);

  // Guarda de qual cidade é o mapa carregado: o da cidade anterior nunca aparece na nova
  const [mapaCidade, setMapaCidade] = useState<{ cidade: Municipio; dados: DadosCidade } | null>(
    null,
  );
  // Incrementar repete a busca do mapa (usado quando a mesma cidade falhou ao carregar)
  const [tentativaCidade, setTentativaCidade] = useState(0);

  const [localizando, setLocalizando] = useState(false);
  // Erros da página (cidade, GPS da origem); os do cálculo da rota vêm de useNavegacao
  const [erroPagina, setErroPagina] = useState<string | null>(null);
  // Na navegação a câmera acompanha o usuário até ele arrastar o mapa
  const [seguirUsuario, setSeguirUsuario] = useState(true);

  const velocidadeSimulacao = useSyncExternalStore(semAssinatura, lerVelocidadeSimulacao, () => null);
  const navegacao = useNavegacao(cidade, velocidadeSimulacao);
  const { rota, etapa, progresso, calculando, aviso } = navegacao;
  const erro = erroPagina ?? navegacao.erro;
  const navegando = etapa !== "planejamento";

  const dadosCidade = mapaCidade && mapaCidade.cidade === cidade ? mapaCidade.dados : null;
  const carregandoCidade = cidade !== null && !dadosCidade && !erroPagina;
  // A caixa de cidade abre sozinha enquanto não houver cidade; "Trocar cidade" a reabre depois
  const modalAberto = sessao !== null && (trocandoCidade || !cidade);

  // CIDADES COM GRAFO DISPONÍVEL NO BACKEND
  useEffect(() => {
    listarCidadesComRotas()
      .then(setCidadesDisponiveis)
      .catch((err) => {
        console.error("Erro ao listar cidades de rotas:", err);
        setErroServidor(true);
      });
  }, []);

  // CARREGAMENTO DO MAPA DA CIDADE (na escolha e ao voltar para a página com uma cidade guardada)
  useEffect(() => {
    if (!cidade) return;
    let cancelado = false;
    carregarDadosCidade(cidade)
      .then((dados) => {
        if (!cancelado) setMapaCidade({ cidade, dados });
      })
      .catch((err) => {
        if (cancelado) return;
        console.error("Erro ao carregar mapa da cidade:", err);
        setErroPagina(mensagemDeErro(err));
      });
    return () => {
      cancelado = true;
    };
  }, [cidade, tentativaCidade]);

  const handleConfirmarCidade = (novaCidade: Municipio) => {
    setTrocandoCidade(false);
    if (novaCidade === cidade && dadosCidade) return;

    try {
      localStorage.setItem(CHAVE_CIDADE_SALVA, novaCidade);
    } catch {
      // Sem localStorage (aba anônima, bloqueio) a cidade só não fica lembrada
    }

    gravarSessao({ cidade: novaCidade, origem: CAMPO_VAZIO, destino: CAMPO_VAZIO });
    navegacao.limpar();
    setErroPagina(null);
    setTentativaCidade((v) => v + 1);
  };

  // CÁLCULO AUTOMÁTICO DA ROTA QUANDO ORIGEM E DESTINO ESTÃO DEFINIDOS
  const calcularRotaPlanejada = useEffectEvent((de: Ponto, para: Ponto, textoDestino: string) =>
    navegacao.calcular(de, para, textoDestino),
  );

  useEffect(() => {
    if (!cidade || !dadosCidade || !origem.ponto || !destino.ponto) return;
    calcularRotaPlanejada(origem.ponto, destino.ponto, destino.texto);
  }, [cidade, dadosCidade, origem.ponto, destino.ponto, destino.texto]);

  // Ao apagar/editar um ponto a rota atual deixa de valer (e respostas pendentes são descartadas)
  const invalidarRota = (campo: CampoPonto) => {
    setErroPagina(null);
    if (!campo.ponto) navegacao.limpar();
  };

  const handleAlterarOrigem = (campo: CampoPonto) => {
    gravarSessao({ origem: campo });
    invalidarRota(campo);
  };

  const handleAlterarDestino = (campo: CampoPonto) => {
    gravarSessao({ destino: campo });
    invalidarRota(campo);
  };

  // Clique no mapa preenche a origem e depois o destino
  const handleCliqueMapa = (lat: number, lng: number) => {
    const campo: CampoPonto = { texto: "Ponto marcado no mapa", ponto: { lat, lng } };
    setErroPagina(null);
    gravarSessao(origem.ponto ? { destino: campo } : { origem: campo });
  };

  const handleUsarLocalizacao = async () => {
    setLocalizando(true);
    try {
      const [lat, lng] = await obterPosicaoAtual();
      setErroPagina(null);
      gravarSessao({ origem: { texto: "Minha localização", ponto: { lat, lng } } });
    } catch (err) {
      // obterPosicaoAtual rejeita com Error quando o navegador não tem geolocalização
      setErroPagina(
        err instanceof Error
          ? "Seu navegador não permite obter a localização. Digite a rua de origem."
          : "Não foi possível obter sua localização. Permita o acesso ou digite a rua.",
      );
    } finally {
      setLocalizando(false);
    }
  };

  const handleInverter = () => {
    gravarSessao({ origem: destino, destino: origem });
  };

  const handleIniciarNavegacao = () => {
    setSeguirUsuario(true);
    navegacao.iniciarNavegacao();
  };

  const marcadorOrigem = rota ? rota.coordenadas[0] : coordenadaDoPonto(origem.ponto);
  const marcadorDestino = rota
    ? rota.coordenadas[rota.coordenadas.length - 1]
    : coordenadaDoPonto(destino.ponto);
  // Na navegação o traçado se divide em percorrido (cinza) e restante (azul)
  const tracado = rota && progresso && navegando ? dividirTracado(rota, progresso) : null;

  const avisoRecalculo = aviso && (
    <AvisoRecalculo
      aviso={aviso}
      calculando={calculando}
      rota={rota}
      onFechar={navegacao.dispensarAviso}
    />
  );

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 top-[68px] bg-slate-100">
        {/* MAPA */}
        {dadosCidade ? (
          <MapaRotasSemSSR
            limites={dadosCidade.limites}
            rota={tracado ? tracado.restante : (rota?.coordenadas ?? null)}
            percorrido={tracado?.percorrido ?? null}
            origem={marcadorOrigem}
            destino={marcadorDestino}
            ocorrencias={navegacao.ocorrencias}
            usuario={navegacao.posicao}
            navegando={navegando}
            seguirUsuario={seguirUsuario}
            onPararDeSeguir={() => setSeguirUsuario(false)}
            onCliqueMapa={navegando ? null : handleCliqueMapa}
          />
        ) : (
          <CarregandoMapa
            texto={
              carregandoCidade
                ? `Carregando ruas de ${cidade}...`
                : "Escolha uma cidade para ver o mapa de rotas"
            }
          />
        )}

        {/* PAINEL DE ROTA (estilo GPS) */}
        {cidade && !modalAberto && !navegando && (
          <div className="absolute top-3 left-3 right-3 md:right-auto md:w-[380px] max-h-[calc(100%-1.5rem)] overflow-y-auto z-[1000] bg-white rounded-2xl border border-slate-200 shadow-xl">
            {/* CABEÇALHO */}
            <div className="p-4 pb-3 flex items-center justify-between gap-2 border-b border-slate-100">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Rotas em
                </p>
                <h1 className="font-black text-slate-900 text-lg leading-tight truncate">
                  {cidade}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setTrocandoCidade(true)}
                className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-[#0f35a0] bg-[#0f35a0]/10 hover:bg-[#0f35a0]/15 px-3 py-2 rounded-xl transition cursor-pointer"
              >
                <MapPin size={14} />
                Trocar cidade
              </button>
            </div>

            {/* ORIGEM E DESTINO */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-2">
                  <CampoRua
                    id="campo-origem"
                    placeholder="De onde você está saindo? (rua)"
                    corMarcador="#0a9667"
                    valor={origem}
                    ruas={dadosCidade?.ruas ?? []}
                    onChange={handleAlterarOrigem}
                  />
                  <CampoRua
                    id="campo-destino"
                    placeholder="Para onde você vai? (rua)"
                    corMarcador="#ef4444"
                    valor={destino}
                    ruas={dadosCidade?.ruas ?? []}
                    onChange={handleAlterarDestino}
                  />
                </div>
                <button
                  type="button"
                  aria-label="Inverter origem e destino"
                  title="Inverter origem e destino"
                  onClick={handleInverter}
                  className="w-9 h-9 shrink-0 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 flex items-center justify-center cursor-pointer"
                >
                  <ArrowUpDown size={16} />
                </button>
              </div>

              <button
                type="button"
                disabled={!dadosCidade || localizando}
                onClick={handleUsarLocalizacao}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#0f35a0] px-1 py-1 cursor-pointer disabled:opacity-50"
              >
                {localizando ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <LocateFixed size={14} />
                )}
                Usar minha localização atual como origem
              </button>

              {!rota && !calculando && !erro && dadosCidade && (
                <p className="text-[11px] text-slate-500 px-1">
                  Digite e escolha as ruas na lista ou clique no mapa para marcar a origem e o
                  destino.
                </p>
              )}

              {erro && (
                <p className="bg-red-50 border border-red-200 text-red-600 text-sm font-medium px-4 py-2.5 rounded-xl">
                  {erro}
                </p>
              )}

              {avisoRecalculo}

              {calculando && !aviso && (
                <div className="flex items-center gap-2 text-sm text-slate-600 px-1 py-2">
                  <Loader2 size={16} className="animate-spin text-[#0f35a0]" />
                  Calculando a melhor rota...
                </div>
              )}
            </div>

            {/* RESULTADO */}
            {rota && (!calculando || aviso) && (
              <div className="border-t border-slate-100">
                <div className="p-4 flex items-end justify-between gap-3 bg-[#091f75] text-white">
                  <div>
                    <p className="text-3xl font-black leading-none">
                      {formatarDuracao(rota.duracaoSegundos)}
                    </p>
                    <p className="text-xs text-white/70 mt-1.5">
                      {formatarDistancia(rota.distanciaMetros)} · rota mais rápida
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold bg-white/15 px-3 py-1.5 rounded-xl">
                    <Clock size={13} />
                    Chegada às {horaDeChegada(rota.duracaoSegundos)}
                  </div>
                </div>

                <ResumoOcorrencias ocorrencias={rota.ocorrencias} />

                <div className="px-4 pt-3">
                  <button
                    type="button"
                    disabled={calculando}
                    onClick={handleIniciarNavegacao}
                    className="w-full bg-[#0d1b54] hover:bg-[#0d163b] text-white text-sm font-bold py-2.5 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Navigation size={16} />
                    Iniciar navegação
                  </button>
                </div>

                <ol className="p-2">
                  {rota.instrucoes.map((passo, i) => {
                    const Icone = ICONE_MANOBRA[passo.tipo];
                    return (
                      <li
                        key={i}
                        className="flex items-center gap-3 px-2 py-2.5 border-b border-slate-100 last:border-b-0"
                      >
                        <div className="w-8 h-8 rounded-xl bg-[#091f75]/[0.08] text-[#091f75] flex items-center justify-center shrink-0">
                          <Icone size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-500 leading-snug">{passo.texto}</p>
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {passo.rua}
                          </p>
                        </div>
                        {passo.distancia > 0 && (
                          <span className="text-xs font-bold text-slate-500 shrink-0">
                            {formatarDistancia(passo.distancia)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* NAVEGAÇÃO EM TEMPO REAL */}
        {navegando && rota && (
          <>
            {etapa === "navegacao" && (
              <PainelManobra
                rota={rota}
                progresso={progresso}
                estadoLocalizacao={navegacao.estadoLocalizacao}
                simulando={velocidadeSimulacao !== null}
              >
                {avisoRecalculo}
              </PainelManobra>
            )}

            {etapa === "navegacao" && !seguirUsuario && (
              <button
                type="button"
                onClick={() => setSeguirUsuario(true)}
                className="absolute right-3 bottom-32 z-[1000] flex items-center gap-1.5 bg-white border border-slate-200 shadow-lg text-[#0f35a0] text-xs font-bold px-3.5 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                <LocateFixed size={15} />
                Recentralizar
              </button>
            )}

            <ResumoNavegacao
              rota={rota}
              progresso={progresso}
              etapa={etapa}
              onEncerrar={navegacao.encerrarNavegacao}
            />
          </>
        )}
      </div>

      {/* CAIXA DE ESCOLHA DA CIDADE — fora do container fixo para ficar acima da navbar */}
      {modalAberto && (
        <ModalCidade
          cidadeAtual={cidade}
          cidadesDisponiveis={cidadesDisponiveis}
          erroServidor={erroServidor}
          onConfirmar={handleConfirmarCidade}
          onFechar={cidade ? () => setTrocandoCidade(false) : null}
        />
      )}
    </>
  );
}

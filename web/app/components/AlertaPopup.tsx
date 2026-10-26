"use client";

/**
 * ALERTA 1 — Pop-up do site.
 *
 * Fica montado no layout raiz, entao vale para todas as paginas. Abre uma
 * conexao WebSocket com o backend Python e exibe o alerta em tempo real,
 * sem recarregar a pagina.
 *
 * O conteudo reproduz o modelo de `web/app/python/notificacao_popup/popups.py`:
 * titulo `[PRIORIDADE] Alerta de X - Cidade` e as linhas de localizacao,
 * endereco, prioridade, status e descricao.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, MapPin, Navigation, Activity, X } from "lucide-react";
import { supabase } from "@/app/lib/banco";
import { MUNICIPIOS, normalizar } from "@/app/lib/constantes";
import {
  buscarUltimoAlerta,
  WS_ALERTAS,
  type Alerta,
  type EventoAlerta,
} from "@/app/lib/alertas";

const CHAVE_CIENTES = "pluvite:alertas-vistos";
const RECONECTAR_MS = 5000;
const PING_MS = 25000;
/** Alertas mais antigos que isso nao aparecem para quem acabou de abrir o site */
const VALIDADE_HORAS = 6;

function lerVistos(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CIENTES) ?? "[]");
  } catch {
    return [];
  }
}

function marcarVisto(id: string) {
  try {
    const vistos = [...lerVistos(), id].slice(-50);
    localStorage.setItem(CHAVE_CIENTES, JSON.stringify(vistos));
  } catch {
    /* modo anonimo / storage bloqueado: apenas ignora */
  }
}

function aindaVale(alerta: Alerta): boolean {
  const criadoEm = new Date(alerta.criado_em).getTime();
  if (Number.isNaN(criadoEm)) return true;
  return Date.now() - criadoEm < VALIDADE_HORAS * 60 * 60 * 1000;
}

export default function AlertaPopup() {
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const [conectado, setConectado] = useState(false);
  const [municipioAlertas, setMunicipioAlertas] = useState<string | null>(null);
  const municipioAtualRef = useRef<string | null>(null);

  const exibir = useCallback((novo: Alerta) => {
    if (
      !municipioAlertas ||
      normalizar(novo.municipio) !== normalizar(municipioAlertas)
    ) {
      return;
    }
    if (lerVistos().includes(novo.id)) return;
    if (!aindaVale(novo)) return;
    setAlerta(novo);
  }, [municipioAlertas]);

  const fechar = useCallback(() => {
    setAlerta((atual) => {
      if (atual) marcarVisto(atual.id);
      return null;
    });
  }, []);

  /* Município de alertas do cidadão; a cidade do perfil é o padrão. */
  useEffect(() => {
    let ativo = true;

    const carregarMunicipio = async (authId?: string | null) => {
      let id = authId;
      if (id === undefined) {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.error("Erro ao identificar cidadão para alertas:", error);
          if (ativo) {
            municipioAtualRef.current = null;
            setAlerta(null);
            setConectado(false);
            setMunicipioAlertas(null);
          }
          return;
        }
        id = data.user?.id ?? null;
      }

      if (!id) {
        if (ativo) {
          municipioAtualRef.current = null;
          setAlerta(null);
          setConectado(false);
          setMunicipioAlertas(null);
        }
        return;
      }

      const { data, error } = await supabase
        .from("cidadao")
        .select("municipio_alertas, cidade")
        .eq("auth_id", id)
        .maybeSingle();

      if (error) {
        console.error("Erro ao carregar município para alertas:", error);
        if (ativo) {
          municipioAtualRef.current = null;
          setAlerta(null);
          setConectado(false);
          setMunicipioAlertas(null);
        }
        return;
      }

      const municipioInformado = data?.municipio_alertas || data?.cidade;
      const municipio =
        MUNICIPIOS.find(
          (nome) => normalizar(nome) === normalizar(municipioInformado || ""),
        ) ?? null;
      if (ativo) {
        if (municipioAtualRef.current !== municipio) {
          setAlerta(null);
          setConectado(false);
        }
        municipioAtualRef.current = municipio;
        setMunicipioAlertas(municipio);
      }
    };

    void carregarMunicipio();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_evento, sessao) => {
        window.setTimeout(() => {
          void carregarMunicipio(sessao?.user.id ?? null);
        }, 0);
      },
    );

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  /* Conexão WebSocket restrita ao município, com reconexão automática. */
  useEffect(() => {
    if (!municipioAlertas) return;
    let desmontado = false;
    let reconexao: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let socket: WebSocket | null = null;

    const conectar = () => {
      if (desmontado) return;

      try {
        const parametros = new URLSearchParams({ municipio: municipioAlertas });
        const socketAtual = new WebSocket(`${WS_ALERTAS}?${parametros}`);
        socket = socketAtual;
        socketAtual.onopen = () => {
          if (desmontado) {
            socketAtual.close();
            return;
          }
          setConectado(true);
          ping = setInterval(() => {
            if (socketAtual.readyState === WebSocket.OPEN) socketAtual.send("ping");
          }, PING_MS);
        };

        socketAtual.onmessage = (evento) => {
          try {
            const mensagem: EventoAlerta = JSON.parse(evento.data);
            if (mensagem.evento === "alerta_emergencia" && mensagem.dados) {
              exibir(mensagem.dados as Alerta);
            }
          } catch {
            /* mensagem fora do formato esperado */
          }
        };

        const encerrar = () => {
          if (desmontado) return;
          setConectado(false);
          if (ping) clearInterval(ping);
          reconexao = setTimeout(conectar, RECONECTAR_MS);
        };

        socketAtual.onclose = encerrar;
        socketAtual.onerror = () => socketAtual.close();
      } catch {
        reconexao = setTimeout(conectar, RECONECTAR_MS);
      }
    };

    conectar();

    // Rede fora do ar quando o alerta foi emitido? Busca o ultimo ao abrir.
    buscarUltimoAlerta(municipioAlertas)
      .then((ultimo) => ultimo && exibir(ultimo))
      .catch(() => {
        console.error("Não foi possível buscar o último alerta; o WebSocket continuará tentando.");
      });

    return () => {
      desmontado = true;
      if (reconexao) clearTimeout(reconexao);
      if (ping) clearInterval(ping);
      socket?.close();
    };
  }, [exibir, municipioAlertas]);

  /* Fecha com ESC */
  useEffect(() => {
    if (!alerta) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [alerta, fechar]);

  if (!alerta) {
    // Indicador discreto de que o monitoramento esta ativo (so em dev)
    return process.env.NODE_ENV === "development" ? (
      <span
        title={
          conectado
            ? "Monitoramento de alertas conectado"
            : "Reconectando ao servidor de alertas..."
        }
        className={`fixed bottom-3 left-3 z-[9999] h-2.5 w-2.5 rounded-full ${
          conectado ? "bg-emerald-500" : "bg-amber-400"
        }`}
      />
    ) : null;
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="titulo-alerta"
      className="alerta-overlay fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 p-4 pt-8 backdrop-blur-[2px]"
    >
      <div className="alerta-caixa w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Faixa de severidade */}
        <div
          className="flex items-start gap-3 px-5 py-4 text-white"
          style={{ backgroundColor: alerta.cor }}
        >
          <span className="text-2xl leading-none">{alerta.icone}</span>
          <div className="flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-90">
              {alerta.origem === "simulacao" || alerta.origem === "openweather_mock"
                ? "SIMULAÇÃO — NÃO É UM ALERTA REAL"
                : alerta.rotulo_severidade}
            </p>
            <h2 id="titulo-alerta" className="text-lg font-black leading-tight">
              {alerta.tipo.toUpperCase()}
            </h2>
          </div>
          <button
            onClick={fechar}
            aria-label="Fechar alerta"
            className="rounded-lg p-1 transition-colors hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo — mesmos campos do pop-up original */}
        <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
          <div className="flex items-start gap-2">
            <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
            <p>
              <span className="font-semibold text-slate-900">Localização: </span>
              {alerta.municipio}
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Navigation size={16} className="mt-0.5 shrink-0 text-slate-400" />
            <p>
              <span className="font-semibold text-slate-900">Endereço/Região: </span>
              {alerta.endereco}
            </p>
          </div>

          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-slate-400" />
            <p>
              <span className="font-semibold text-slate-900">Nível de Prioridade: </span>
              <span className="font-bold" style={{ color: alerta.cor }}>
                {alerta.prioridade}
              </span>
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Activity size={16} className="mt-0.5 shrink-0 text-slate-400" />
            <p>
              <span className="font-semibold text-slate-900">Status Atual: </span>
              {alerta.statusatual}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Descrição do ocorrido
            </p>
            <p className="whitespace-pre-line leading-relaxed">{alerta.descricao}</p>
          </div>

          <p className="text-xs italic text-slate-500">
            Mantenha-se em segurança e siga as orientações da Defesa Civil.
          </p>
        </div>

        {/* Rodape */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <span className="text-[11px] text-slate-400">
            {alerta.origem === "simulacao" || alerta.origem === "openweather_mock"
              ? "Teste visual · sem envio externo"
              : alerta.origem === "openweather"
                ? "Detecção automática"
                : "Emitido pela prefeitura"}
            {" · "}
            {new Date(alerta.criado_em).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button
            onClick={fechar}
            className="rounded-lg px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: alerta.cor }}
          >
            {alerta.botao}
          </button>
        </div>
      </div>

    </div>
  );
}

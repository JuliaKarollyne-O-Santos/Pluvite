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
  const socketRef = useRef<WebSocket | null>(null);
  const reconexaoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const desmontadoRef = useRef(false);

  const exibir = useCallback((novo: Alerta) => {
    if (lerVistos().includes(novo.id)) return;
    if (!aindaVale(novo)) return;
    setAlerta(novo);
  }, []);

  const fechar = useCallback(() => {
    setAlerta((atual) => {
      if (atual) marcarVisto(atual.id);
      return null;
    });
  }, []);

  /* Conexao WebSocket com reconexao automatica */
  useEffect(() => {
    desmontadoRef.current = false;

    const conectar = () => {
      if (desmontadoRef.current) return;

      let socket: WebSocket;
      try {
        socket = new WebSocket(WS_ALERTAS);
      } catch {
        reconexaoRef.current = setTimeout(conectar, RECONECTAR_MS);
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        setConectado(true);
        pingRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send("ping");
        }, PING_MS);
      };

      socket.onmessage = (evento) => {
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
        setConectado(false);
        if (pingRef.current) clearInterval(pingRef.current);
        socketRef.current = null;
        if (!desmontadoRef.current) {
          reconexaoRef.current = setTimeout(conectar, RECONECTAR_MS);
        }
      };

      socket.onclose = encerrar;
      socket.onerror = () => socket.close();
    };

    conectar();

    // Rede fora do ar quando o alerta foi emitido? Busca o ultimo ao abrir.
    buscarUltimoAlerta()
      .then((ultimo) => ultimo && exibir(ultimo))
      .catch(() => {
        /* backend offline: o WebSocket segue tentando */
      });

    return () => {
      desmontadoRef.current = true;
      if (reconexaoRef.current) clearTimeout(reconexaoRef.current);
      if (pingRef.current) clearInterval(pingRef.current);
      socketRef.current?.close();
    };
  }, [exibir]);

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
              {alerta.rotulo_severidade}
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
            {alerta.origem === "openweather" ? "Detecção automática" : "Emitido pela prefeitura"}
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

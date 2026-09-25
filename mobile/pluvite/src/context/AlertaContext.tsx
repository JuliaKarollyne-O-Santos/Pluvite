/**
 * Estado global do alerta de emergencia no app.
 *
 * Tres entradas alimentam o mesmo estado:
 *   1. push notification recebida/tocada (expo-notifications);
 *   2. WebSocket do backend, enquanto o app esta aberto;
 *   3. consulta ao backend quando o app abre (caso a push tenha sido perdida).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";

import {
  alertaAindaVale,
  buscarUltimoAlerta,
  WS_ALERTAS,
  type Alerta,
} from "../services/alertas";
import {
  alertaQueAbriuOApp,
  escutarNotificacoes,
  registrarParaPush,
} from "../services/notificacoes";

interface ValorContexto {
  /** Alerta que deve abrir o modal em destaque na tela inicial */
  alerta: Alerta | null;
  /** Ultimo alerta conhecido, mesmo depois de dispensado (para o card fixo) */
  ultimoAlerta: Alerta | null;
  dispensar: () => void;
  reabrir: () => void;
  pushToken: string | null;
  conectado: boolean;
}

const AlertaContext = createContext<ValorContexto>({
  alerta: null,
  ultimoAlerta: null,
  dispensar: () => {},
  reabrir: () => {},
  pushToken: null,
  conectado: false,
});

export const useAlerta = () => useContext(AlertaContext);

const RECONECTAR_MS = 5000;
const PING_MS = 25000;

export function AlertaProvider({ children }: { children: React.ReactNode }) {
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const [ultimoAlerta, setUltimoAlerta] = useState<Alerta | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);

  const dispensadosRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const reconexaoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const desmontadoRef = useRef(false);

  const receber = useCallback((novo: Alerta | null) => {
    if (!novo) return;
    setUltimoAlerta(novo);
    if (dispensadosRef.current.has(novo.id)) return;
    if (!alertaAindaVale(novo)) return;
    setAlerta(novo);
  }, []);

  const dispensar = useCallback(() => {
    setAlerta((atual) => {
      if (atual) dispensadosRef.current.add(atual.id);
      return null;
    });
  }, []);

  const reabrir = useCallback(() => {
    if (ultimoAlerta) setAlerta(ultimoAlerta);
  }, [ultimoAlerta]);

  /* 1. Push notification */
  useEffect(() => {
    registrarParaPush().then(setPushToken);
    alertaQueAbriuOApp().then(receber);
    return escutarNotificacoes(receber);
  }, [receber]);

  /* 2. WebSocket com reconexao automatica */
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
          const mensagem = JSON.parse(evento.data as string);
          if (mensagem.evento === "alerta_emergencia" && mensagem.dados) {
            receber(mensagem.dados as Alerta);
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

    return () => {
      desmontadoRef.current = true;
      if (reconexaoRef.current) clearTimeout(reconexaoRef.current);
      if (pingRef.current) clearInterval(pingRef.current);
      socketRef.current?.close();
    };
  }, [receber]);

  /* 3. Consulta ao abrir e cada vez que o app volta do segundo plano */
  useEffect(() => {
    buscarUltimoAlerta().then(receber);

    const aoMudarEstado = (estado: AppStateStatus) => {
      if (estado === "active") buscarUltimoAlerta().then(receber);
    };

    const inscricao = AppState.addEventListener("change", aoMudarEstado);
    return () => inscricao.remove();
  }, [receber]);

  return (
    <AlertaContext.Provider
      value={{ alerta, ultimoAlerta, dispensar, reabrir, pushToken, conectado }}
    >
      {children}
    </AlertaContext.Provider>
  );
}

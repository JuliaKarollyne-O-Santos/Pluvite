/**
 * Estado global do alerta de emergencia no app.
 *
 * Tres entradas alimentam o mesmo estado:
 *   1. push notification FCM recebida/tocada;
 *   2. WebSocket do backend, enquanto o app esta aberto;
 *   3. consulta ao backend quando o app abre ou volta ao primeiro plano.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus, Platform } from "react-native";

import { normalizar } from "../lib/constantes";
import { supabase } from "../pages/lib/supabase";
import {
  alertaAindaVale,
  buscarUltimoAlerta,
  registrarDispositivo,
  urlWebSocketAlertas,
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
  municipioAlertas: string | null;
  atualizarMunicipioAlertas: (municipio: string, authId: string) => Promise<boolean>;
  conectado: boolean;
}

const AlertaContext = createContext<ValorContexto>({
  alerta: null,
  ultimoAlerta: null,
  dispensar: () => {},
  reabrir: () => {},
  pushToken: null,
  municipioAlertas: null,
  atualizarMunicipioAlertas: async () => false,
  conectado: false,
});

export const useAlerta = () => useContext(AlertaContext);

const RECONECTAR_MS = 5000;
const PING_MS = 25000;

export function AlertaProvider({ children }: { children: React.ReactNode }) {
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const [ultimoAlerta, setUltimoAlerta] = useState<Alerta | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [municipioAlertas, setMunicipioAlertas] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);

  const dispensadosRef = useRef<Set<string>>(new Set());
  const municipioRef = useRef<string | null>(null);

  const receber = useCallback((novo: Alerta | null) => {
    if (!novo) return;
    if (
      !municipioRef.current ||
      normalizar(novo.municipio) !== normalizar(municipioRef.current)
    ) {
      return;
    }
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

  const atualizarMunicipioAlertas = useCallback(
    async (municipio: string, authId: string) => {
      municipioRef.current = municipio;
      setMunicipioAlertas(municipio);
      setConectado(false);
      setAlerta((atual) =>
        atual && normalizar(atual.municipio) !== normalizar(municipio) ? null : atual,
      );
      setUltimoAlerta((atual) =>
        atual && normalizar(atual.municipio) !== normalizar(municipio) ? null : atual,
      );
      const atualizado =
        !pushToken ||
        (await registrarDispositivo({
          push_token: pushToken,
          plataforma: Platform.OS,
          auth_id: authId,
          municipio,
        }));
      if (atualizado) await buscarUltimoAlerta(municipio).then(receber);
      return atualizado;
    },
    [pushToken, receber],
  );

  /* 1. Push notification */
  useEffect(() => {
    let ativo = true;
    async function iniciarPush() {
      try {
        const {
          data: { user },
          error: erroUsuario,
        } = await supabase.auth.getUser();
        if (erroUsuario) {
          console.error("Erro ao identificar usuário para alertas:", erroUsuario);
          return;
        }

        let municipio: string | null = null;
        if (user) {
          const { data, error } = await supabase
            .from("cidadao")
            .select("municipio_alertas, cidade")
            .eq("auth_id", user.id)
            .maybeSingle();
          if (error) {
            console.error("Erro ao carregar município dos alertas:", error);
            return;
          } else {
            municipio = data?.municipio_alertas || data?.cidade || null;
          }
        }

        municipioRef.current = municipio;
        if (ativo) setMunicipioAlertas(municipio);

        const token = await registrarParaPush({
          authId: user?.id,
          municipio,
        });
        if (token && user && municipioRef.current !== municipio) {
          const atualizado = await registrarDispositivo({
            push_token: token,
            plataforma: Platform.OS,
            auth_id: user.id,
            municipio: municipioRef.current,
          });
          if (!atualizado) {
            console.warn("[alertas] Não foi possível atualizar a cidade escolhida no aparelho.");
          }
        }
        if (ativo) setPushToken(token);
        await alertaQueAbriuOApp().then(receber);
        await buscarUltimoAlerta(municipio).then(receber);
      } catch (error) {
        console.error("Erro ao iniciar notificações de alerta:", error);
      }
    }

    void iniciarPush();
    return escutarNotificacoes(receber);
  }, [receber]);

  /* 2. WebSocket com reconexao automatica */
  useEffect(() => {
    if (!municipioAlertas) return;
    let desmontado = false;
    let reconexao: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let socket: WebSocket | null = null;

    const conectar = () => {
      if (desmontado) return;

      try {
        const socketAtual = new WebSocket(urlWebSocketAlertas(municipioAlertas));
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
            const mensagem = JSON.parse(evento.data as string);
            if (mensagem.evento === "alerta_emergencia" && mensagem.dados) {
              receber(mensagem.dados as Alerta);
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

    return () => {
      desmontado = true;
      if (reconexao) clearTimeout(reconexao);
      if (ping) clearInterval(ping);
      socket?.close();
    };
  }, [municipioAlertas, receber]);

  /* 3. Consulta ao abrir e cada vez que o app volta do segundo plano */
  useEffect(() => {
    buscarUltimoAlerta(municipioAlertas).then(receber);

    const aoMudarEstado = (estado: AppStateStatus) => {
      if (estado === "active") {
        buscarUltimoAlerta(municipioRef.current).then(receber);
      }
    };

    const inscricao = AppState.addEventListener("change", aoMudarEstado);
    return () => inscricao.remove();
  }, [municipioAlertas, receber]);

  return (
    <AlertaContext.Provider
      value={{
        alerta,
        ultimoAlerta,
        dispensar,
        reabrir,
        pushToken,
        municipioAlertas,
        atualizarMunicipioAlertas,
        conectado,
      }}
    >
      {children}
    </AlertaContext.Provider>
  );
}

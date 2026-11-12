/**
 * ROTAS SEGURAS — versão mobile do /Rotas do site.
 *
 * Planejamento: cidade + origem (GPS, rua ou toque no mapa) + destino (rua ou toque no mapa);
 * o backend Express calcula a rota com o modelo realista de tempo de viagem e desvia das
 * ocorrências ativas do Feed. Navegação: acompanha o GPS, mostra a próxima manobra e recalcula
 * quando a pessoa sai da rota ou quando surge uma ocorrência nova no caminho.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  Flag,
  LocateFixed,
  MapPin,
  Navigation,
  RotateCcw,
  Route as IconeRota,
  ShieldAlert,
  X,
} from "lucide-react-native";

import Cabecalho from "../../components/Cabecalho";
import MapaRotas, { type EstadoMapa } from "../../components/MapaRotas";
import SeletorOpcoes, { paraOpcoes } from "../../components/SeletorOpcoes";
import { useAlerta } from "../../context/AlertaContext";
import { CENTRO_MUNICIPIO, MUNICIPIOS, normalizar, type Municipio } from "../../lib/constantes";
import {
  distanciaMetros,
  formatarDistancia,
  formatarDuracao,
  localizarNaRota,
  type Coordenada,
} from "../../lib/geo";
import {
  acompanharPosicao,
  obterPosicaoAtual,
  type PosicaoUsuario,
} from "../../lib/localizacao";
import { COR, SOMBRA } from "../../lib/tema";
import {
  buscarOcorrenciasDaCidade,
  calcularRota,
  carregarDadosCidade,
  listarCidadesComRotas,
  mensagemDeErro,
  type Instrucao,
  type OcorrenciaRota,
  type Ponto,
  type ResultadoRota,
  type TipoManobra,
} from "../../services/rotas";

// Origem/destino escolhidos pela pessoa
type Local =
  | { modo: "gps" }
  | { modo: "rua"; rua: string }
  | { modo: "mapa"; coordenada: Coordenada };

/** Fora da rota por mais que isso (m), em duas leituras seguidas, recalcula */
const DESVIO_RECALCULO_M = 40;
/** Intervalo mínimo entre recálculos automáticos */
const INTERVALO_RECALCULO_MS = 10_000;
/** Recarrega as ocorrências do Feed durante a navegação */
const ATUALIZAR_OCORRENCIAS_MS = 60_000;
/** Chegou quando falta menos que isso (m) */
const CHEGADA_M = 25;

const ICONE_MANOBRA: Record<TipoManobra, typeof ArrowUp> = {
  inicio: Navigation,
  reto: ArrowUp,
  direita: ArrowRight,
  esquerda: ArrowLeft,
  retorno: RotateCcw,
  chegada: Flag,
};

const descreverLocal = (local: Local | null) =>
  !local
    ? null
    : local.modo === "gps"
      ? "Minha localização"
      : local.modo === "rua"
        ? local.rua
        : "Ponto marcado no mapa";

export default function Rotas() {
  const { municipioAlertas } = useAlerta();

  // CIDADE E RUAS
  const [cidadesDisponiveis, setCidadesDisponiveis] = useState<Set<string> | null>(null);
  const [cidade, setCidade] = useState<Municipio>("Taubaté");
  const [ruas, setRuas] = useState<string[]>([]);
  const [carregandoCidade, setCarregandoCidade] = useState(false);
  const [erroCidade, setErroCidade] = useState<string | null>(null);
  const cidadeEscolhidaRef = useRef(false);

  // PLANEJAMENTO
  const [origem, setOrigem] = useState<Local | null>({ modo: "gps" });
  const [destino, setDestino] = useState<Local | null>(null);
  const [marcandoNoMapa, setMarcandoNoMapa] = useState<"origem" | "destino" | null>(null);
  const [painelAberto, setPainelAberto] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRota | null>(null);
  const [indiceRota, setIndiceRota] = useState(0);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaRota[]>([]);

  // NAVEGAÇÃO
  const [navegando, setNavegando] = useState(false);
  const [posicao, setPosicao] = useState<PosicaoUsuario | null>(null);
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const foraDaRotaRef = useRef(0);
  const ultimoRecalculoRef = useRef(0);

  const opcoesRota = useMemo(
    () => (resultado ? [resultado, ...(resultado.alternativas ?? [])] : []),
    [resultado],
  );
  const rotaAtual = opcoesRota[indiceRota] ?? null;

  // CARREGAMENTO DAS CIDADES COM GRAFO
  useEffect(() => {
    listarCidadesComRotas()
      .then(setCidadesDisponiveis)
      .catch((erro) => {
        console.warn("[rotas] Lista de cidades indisponível:", erro);
        setErroCidade(mensagemDeErro(erro));
      });
  }, []);

  // CIDADE PADRÃO = MUNICÍPIO DOS ALERTAS DO PERFIL
  useEffect(() => {
    if (cidadeEscolhidaRef.current || !municipioAlertas) return;
    const encontrado = MUNICIPIOS.find((m) => normalizar(m) === normalizar(municipioAlertas));
    if (encontrado) setCidade(encontrado);
  }, [municipioAlertas]);

  // CARREGAMENTO DAS RUAS E OCORRÊNCIAS DA CIDADE
  const carregarCidade = useCallback(async (nome: Municipio) => {
    setCarregandoCidade(true);
    setErroCidade(null);
    try {
      const dados = await carregarDadosCidade(nome);
      setRuas([...dados.ruas].sort((a, b) => a.localeCompare(b, "pt-BR")));
    } catch (erro) {
      console.error("Erro ao carregar dados da cidade:", erro);
      setRuas([]);
      setErroCidade(mensagemDeErro(erro));
    } finally {
      setCarregandoCidade(false);
    }
    try {
      setOcorrencias(await buscarOcorrenciasDaCidade(nome));
    } catch (erro) {
      console.warn("[rotas] Ocorrências indisponíveis:", erro);
      setOcorrencias([]);
    }
  }, []);

  useEffect(() => {
    void carregarCidade(cidade);
  }, [cidade, carregarCidade]);

  // Atualiza as ocorrências ao voltar para a aba (pode ter publicado algo no Feed)
  useFocusEffect(
    useCallback(() => {
      if (!navegando) {
        buscarOcorrenciasDaCidade(cidade)
          .then(setOcorrencias)
          .catch(() => {});
      }
    }, [cidade, navegando]),
  );

  const handleTrocarCidade = (valor: string) => {
    cidadeEscolhidaRef.current = true;
    setCidade(valor as Municipio);
    setResultado(null);
    setIndiceRota(0);
    setDestino(null);
    setOrigem({ modo: "gps" });
  };

  // CONVERSÃO DO LOCAL ESCOLHIDO NO PONTO DO BACKEND
  const resolverPonto = async (local: Local): Promise<{ ponto: Ponto; coordenada: Coordenada | null }> => {
    if (local.modo === "rua") return { ponto: { rua: local.rua }, coordenada: null };
    if (local.modo === "mapa") {
      return { ponto: { lat: local.coordenada[0], lng: local.coordenada[1] }, coordenada: local.coordenada };
    }
    const atual = await obterPosicaoAtual();
    setPosicao(atual);
    const [lat, lng] = atual.coordenada;
    return {
      ponto: atual.rumo != null ? { lat, lng, rumo: atual.rumo } : { lat, lng },
      coordenada: atual.coordenada,
    };
  };

  const handleCalcular = async () => {
    if (!origem || !destino) {
      Alert.alert("Rotas", "Escolha a origem e o destino.");
      return;
    }
    setCalculando(true);
    try {
      const [o, d] = await Promise.all([resolverPonto(origem), resolverPonto(destino)]);
      const rota = await calcularRota(cidade, o.ponto, d.ponto, { alternativas: true });
      setResultado(rota);
      setIndiceRota(0);
      setPainelAberto(false);
      setMarcandoNoMapa(null);
    } catch (erro) {
      console.error("Erro ao calcular rota:", erro);
      Alert.alert("Não foi possível calcular a rota", mensagemDeErro(erro));
    } finally {
      setCalculando(false);
    }
  };

  const handleTocarMapa = (coordenada: Coordenada) => {
    if (!marcandoNoMapa || navegando) return;
    const local: Local = { modo: "mapa", coordenada };
    if (marcandoNoMapa === "origem") setOrigem(local);
    else setDestino(local);
    setMarcandoNoMapa(null);
    setPainelAberto(true);
  };

  const handleLimpar = () => {
    setResultado(null);
    setIndiceRota(0);
    setDestino(null);
    setOrigem({ modo: "gps" });
    setPainelAberto(true);
  };

  // ───── NAVEGAÇÃO ─────
  // Distância acumulada de cada ponto da rota a partir do início (para a próxima manobra)
  const acumulado = useMemo(() => {
    const linha = rotaAtual?.coordenadas ?? [];
    const lista = [0];
    for (let i = 1; i < linha.length; i++) {
      lista.push(lista[i - 1] + distanciaMetros(linha[i - 1], linha[i]));
    }
    return lista;
  }, [rotaAtual]);

  const progresso = useMemo(() => {
    if (!navegando || !rotaAtual || !posicao) return null;
    const linha = rotaAtual.coordenadas;
    const { segmento, distanciaDaRota, restante } = localizarNaRota(posicao.coordenada, linha);
    const total = acumulado[acumulado.length - 1] || 1;
    const proxima: Instrucao | undefined = rotaAtual.instrucoes.find(
      (instrucao) => instrucao.inicio > segmento && instrucao.tipo !== "inicio",
    );
    const ateManobra = proxima ? restante - (total - (acumulado[proxima.inicio] ?? total)) : restante;
    return {
      distanciaDaRota,
      restante,
      // ETA restante proporcional ao tempo do modelo (o backend é a fonte do tempo)
      tempoRestante: rotaAtual.duracaoSegundos * (restante / total),
      proxima,
      ateManobra: Math.max(0, ateManobra),
    };
  }, [navegando, rotaAtual, posicao, acumulado]);

  const recalcular = useCallback(
    async (motivo: string) => {
      if (!destino || !posicao) return;
      ultimoRecalculoRef.current = Date.now();
      setRecalculando(true);
      try {
        const [lat, lng] = posicao.coordenada;
        const { ponto } = await resolverPontoSemGps(destino);
        const rota = await calcularRota(
          cidade,
          posicao.rumo != null ? { lat, lng, rumo: posicao.rumo } : { lat, lng },
          ponto,
        );
        setResultado(rota);
        setIndiceRota(0);
        console.log(`[rotas] Rota recalculada: ${motivo}`);
      } catch (erro) {
        console.warn("[rotas] Falha ao recalcular:", erro);
      } finally {
        setRecalculando(false);
      }
    },
    [cidade, destino, posicao],
  );

  // GPS CONTÍNUO DURANTE A NAVEGAÇÃO
  useEffect(() => {
    if (!navegando) return;
    return acompanharPosicao(
      (nova) => {
        setAvisoGps(null);
        setPosicao(nova);
      },
      setAvisoGps,
    );
  }, [navegando]);

  // DESVIO DA ROTA E CHEGADA
  useEffect(() => {
    if (!progresso || recalculando) return;
    if (progresso.restante < CHEGADA_M) {
      setNavegando(false);
      Alert.alert("Você chegou!", "Destino alcançado com segurança.");
      return;
    }
    if (progresso.distanciaDaRota > DESVIO_RECALCULO_M) {
      foraDaRotaRef.current += 1;
      if (
        foraDaRotaRef.current >= 2 &&
        Date.now() - ultimoRecalculoRef.current > INTERVALO_RECALCULO_MS
      ) {
        foraDaRotaRef.current = 0;
        void recalcular("saiu da rota");
      }
    } else {
      foraDaRotaRef.current = 0;
    }
  }, [progresso, recalculando, recalcular]);

  // OCORRÊNCIAS NOVAS NO CAMINHO → RECALCULA
  useEffect(() => {
    if (!navegando) return;
    const intervalo = setInterval(async () => {
      try {
        const novas = await buscarOcorrenciasDaCidade(cidade);
        const conhecidas = new Set(ocorrencias.map((o) => o.id));
        setOcorrencias(novas);
        if (novas.some((o) => !conhecidas.has(o.id))) void recalcular("nova ocorrência no Feed");
      } catch {
        /* backend fora do ar: mantém a rota atual */
      }
    }, ATUALIZAR_OCORRENCIAS_MS);
    return () => clearInterval(intervalo);
  }, [navegando, cidade, ocorrencias, recalcular]);

  const handleIniciarNavegacao = async () => {
    try {
      setPosicao(await obterPosicaoAtual());
      foraDaRotaRef.current = 0;
      ultimoRecalculoRef.current = Date.now();
      setNavegando(true);
    } catch (erro) {
      Alert.alert("Localização", erro instanceof Error ? erro.message : "GPS indisponível.");
    }
  };

  // ESTADO DO MAPA
  const estadoMapa: EstadoMapa = useMemo(
    () => ({
      centro: CENTRO_MUNICIPIO[cidade],
      rota: rotaAtual?.coordenadas ?? [],
      alternativas: navegando
        ? []
        : opcoesRota.filter((_, i) => i !== indiceRota).map((r) => r.coordenadas),
      origem: rotaAtual?.coordenadas[0] ?? (origem?.modo === "mapa" ? origem.coordenada : null),
      destino:
        rotaAtual?.coordenadas[rotaAtual.coordenadas.length - 1] ??
        (destino?.modo === "mapa" ? destino.coordenada : null),
      posicao: posicao?.coordenada ?? null,
      ocorrencias: ocorrencias.map((o) => ({
        id: o.id,
        tipo: o.tipo,
        efeito: o.efeito,
        posicao: o.posicao,
        trechos: o.trechos,
      })),
      seguir: navegando,
    }),
    [cidade, rotaAtual, opcoesRota, indiceRota, origem, destino, posicao, ocorrencias, navegando],
  );

  const disponivel = !cidadesDisponiveis || cidadesDisponiveis.has(normalizar(cidade));
  const opcoesCidade = paraOpcoes(
    cidadesDisponiveis ? MUNICIPIOS.filter((m) => cidadesDisponiveis.has(normalizar(m))) : MUNICIPIOS,
  );
  const opcoesRua = useMemo(() => paraOpcoes(ruas), [ruas]);

  const IconeProxima = progresso?.proxima ? ICONE_MANOBRA[progresso.proxima.tipo] : Navigation;
  const evitadas = rotaAtual?.ocorrencias.evitadas.length ?? 0;
  const naRota = rotaAtual?.ocorrencias.naRota ?? [];

  return (
    <View style={styles.container}>
      <Cabecalho />

      <View style={{ flex: 1 }}>
        <MapaRotas estado={estadoMapa} aoTocarMapa={handleTocarMapa} />

        {/* AVISO DE MARCAÇÃO NO MAPA */}
        {marcandoNoMapa && (
          <View style={[styles.faixaTopo, SOMBRA]}>
            <Crosshair size={16} color={COR.azul} />
            <Text style={styles.faixaTexto}>
              Toque no mapa para marcar {marcandoNoMapa === "origem" ? "a origem" : "o destino"}
            </Text>
            <TouchableOpacity onPress={() => setMarcandoNoMapa(null)} accessibilityLabel="Cancelar marcação">
              <X size={18} color={COR.textoSuave} />
            </TouchableOpacity>
          </View>
        )}

        {/* PAINEL DE NAVEGAÇÃO — PRÓXIMA MANOBRA */}
        {navegando && (
          <View style={[styles.manobra, SOMBRA]}>
            <View style={styles.manobraIcone}>
              <IconeProxima size={28} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.manobraDistancia}>
                {progresso ? formatarDistancia(progresso.ateManobra) : "..."}
              </Text>
              <Text style={styles.manobraTexto} numberOfLines={2}>
                {progresso?.proxima
                  ? `${progresso.proxima.texto}${progresso.proxima.rua ? ` — ${progresso.proxima.rua}` : ""}`
                  : "Siga em frente até o destino"}
              </Text>
              {(recalculando || avisoGps) && (
                <Text style={styles.manobraAviso}>{recalculando ? "Recalculando rota..." : avisoGps}</Text>
              )}
            </View>
          </View>
        )}

        {/* PAINEL DE PLANEJAMENTO */}
        {!navegando && !marcandoNoMapa && (
          <View style={[styles.painel, SOMBRA]}>
            <TouchableOpacity
              style={styles.painelCabecalho}
              onPress={() => setPainelAberto((v) => !v)}
              accessibilityLabel={painelAberto ? "Recolher painel" : "Expandir painel"}
            >
              <View style={styles.iconeTile}>
                <IconeRota size={16} color={COR.primaria} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.painelTitulo}>Rotas seguras</Text>
                <Text style={styles.painelSubtitulo} numberOfLines={1}>
                  {painelAberto
                    ? "Desvia de alagamentos, quedas e vias interditadas"
                    : `${descreverLocal(origem) ?? "Origem"} → ${descreverLocal(destino) ?? "Destino"}`}
                </Text>
              </View>
              {painelAberto ? (
                <ChevronUp size={18} color={COR.textoApagado} />
              ) : (
                <ChevronDown size={18} color={COR.textoApagado} />
              )}
            </TouchableOpacity>

            {painelAberto && (
              <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
                <Text style={styles.rotulo}>Cidade</Text>
                <SeletorOpcoes
                  titulo="Cidade"
                  opcoes={opcoesCidade}
                  valor={cidade}
                  aoSelecionar={handleTrocarCidade}
                  icone={<MapPin size={15} color={COR.textoApagado} />}
                />
                {!disponivel && (
                  <Text style={styles.erro}>Esta cidade ainda não tem mapa de rotas.</Text>
                )}
                {erroCidade && <Text style={styles.erro}>{erroCidade}</Text>}

                {/* ORIGEM */}
                <Text style={styles.rotulo}>Origem</Text>
                <View style={styles.linhaLocal}>
                  <View style={{ flex: 1 }}>
                    <SeletorOpcoes
                      titulo="Rua de origem"
                      opcoes={opcoesRua}
                      valor={origem?.modo === "rua" ? origem.rua : ""}
                      aoSelecionar={(rua) => setOrigem({ modo: "rua", rua })}
                      placeholder={descreverLocal(origem) ?? "Escolha a rua"}
                      desabilitado={carregandoCidade || ruas.length === 0}
                      icone={<View style={[styles.bolinha, { backgroundColor: COR.sucesso }]} />}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.botaoQuadrado, origem?.modo === "gps" && styles.botaoQuadradoAtivo]}
                    onPress={() => setOrigem({ modo: "gps" })}
                    accessibilityLabel="Usar minha localização como origem"
                  >
                    <LocateFixed size={18} color={origem?.modo === "gps" ? "#ffffff" : COR.azul} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.botaoQuadrado}
                    onPress={() => setMarcandoNoMapa("origem")}
                    accessibilityLabel="Marcar origem no mapa"
                  >
                    <Crosshair size={18} color={COR.azul} />
                  </TouchableOpacity>
                </View>

                {/* DESTINO */}
                <Text style={styles.rotulo}>Destino</Text>
                <View style={styles.linhaLocal}>
                  <View style={{ flex: 1 }}>
                    <SeletorOpcoes
                      titulo="Rua de destino"
                      opcoes={opcoesRua}
                      valor={destino?.modo === "rua" ? destino.rua : ""}
                      aoSelecionar={(rua) => setDestino({ modo: "rua", rua })}
                      placeholder={descreverLocal(destino) ?? "Escolha a rua"}
                      desabilitado={carregandoCidade || ruas.length === 0}
                      icone={<View style={[styles.bolinha, { backgroundColor: COR.perigo }]} />}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.botaoQuadrado}
                    onPress={() => setMarcandoNoMapa("destino")}
                    accessibilityLabel="Marcar destino no mapa"
                  >
                    <Crosshair size={18} color={COR.azul} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.botaoPrimario, (calculando || !disponivel) && { opacity: 0.6 }]}
                  onPress={handleCalcular}
                  disabled={calculando || !disponivel}
                >
                  {calculando ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <IconeRota size={16} color="#ffffff" />
                      <Text style={styles.botaoPrimarioTexto}>Calcular rota segura</Text>
                    </>
                  )}
                </TouchableOpacity>
                {carregandoCidade && <Text style={styles.dica}>Carregando ruas de {cidade}...</Text>}
              </ScrollView>
            )}
          </View>
        )}

        {/* RESUMO DA ROTA / NAVEGAÇÃO */}
        {rotaAtual && !marcandoNoMapa && (
          <View style={[styles.resumo, SOMBRA]}>
            <View style={styles.resumoLinha}>
              <View>
                <Text style={styles.resumoTempo}>
                  {formatarDuracao(progresso?.tempoRestante ?? rotaAtual.duracaoSegundos)}
                </Text>
                <Text style={styles.resumoDistancia}>
                  {formatarDistancia(progresso?.restante ?? rotaAtual.distanciaMetros)}
                  {navegando ? " restantes" : ""}
                </Text>
              </View>
              {navegando ? (
                <TouchableOpacity style={styles.botaoEncerrar} onPress={() => setNavegando(false)}>
                  <X size={16} color="#ffffff" />
                  <Text style={styles.botaoPrimarioTexto}>Encerrar</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={styles.botaoSecundario}
                    onPress={handleLimpar}
                    accessibilityLabel="Nova rota"
                  >
                    <X size={16} color={COR.textoMedio} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.botaoIniciar} onPress={handleIniciarNavegacao}>
                    <Navigation size={16} color="#ffffff" />
                    <Text style={styles.botaoPrimarioTexto}>Iniciar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ALTERNATIVAS */}
            {!navegando && opcoesRota.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                {opcoesRota.map((opcao, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.chip, i === indiceRota && styles.chipAtivo]}
                    onPress={() => setIndiceRota(i)}
                  >
                    <Clock size={12} color={i === indiceRota ? "#ffffff" : COR.textoSuave} />
                    <Text style={[styles.chipTexto, i === indiceRota && { color: "#ffffff" }]}>
                      {i === 0 ? "Melhor" : `Opção ${i + 1}`} · {formatarDuracao(opcao.duracaoSegundos)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* OCORRÊNCIAS */}
            {(evitadas > 0 || naRota.length > 0) && (
              <View style={styles.ocorrenciasLinha}>
                <ShieldAlert size={14} color={naRota.length > 0 ? "#b45309" : COR.sucesso} />
                <Text style={styles.ocorrenciasTexto}>
                  {evitadas > 0 && `${evitadas} ocorrência${evitadas > 1 ? "s" : ""} evitada${evitadas > 1 ? "s" : ""}`}
                  {evitadas > 0 && naRota.length > 0 && " · "}
                  {naRota.length > 0 && `Atenção: ${naRota.map((o) => o.tipo).join(", ")} no caminho`}
                </Text>
              </View>
            )}
            {rotaAtual.avisos?.map((aviso) => (
              <Text key={aviso} style={styles.dica}>
                {aviso}
              </Text>
            ))}
            {rotaAtual.ocorrencias.indisponiveis && (
              <Text style={styles.dica}>Ocorrências do Feed indisponíveis no momento.</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

/** Destino durante a navegação: rua ou ponto do mapa (o GPS só vale para a origem). */
async function resolverPontoSemGps(local: Local): Promise<{ ponto: Ponto }> {
  if (local.modo === "rua") return { ponto: { rua: local.rua } };
  if (local.modo === "mapa") return { ponto: { lat: local.coordenada[0], lng: local.coordenada[1] } };
  const atual = await obterPosicaoAtual();
  return { ponto: { lat: atual.coordenada[0], lng: atual.coordenada[1] } };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COR.fundoPagina },

  faixaTopo: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  faixaTexto: { flex: 1, fontSize: 13, fontWeight: "700", color: COR.textoForte },

  painel: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COR.borda,
    padding: 14,
  },
  painelCabecalho: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconeTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(9,31,117,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  painelTitulo: { fontSize: 15, fontWeight: "800", color: COR.textoForte },
  painelSubtitulo: { fontSize: 11.5, color: COR.textoSuave, marginTop: 1 },
  rotulo: {
    fontSize: 10.5,
    fontWeight: "800",
    color: COR.textoSuave,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 6,
  },
  linhaLocal: { flexDirection: "row", alignItems: "center", gap: 8 },
  bolinha: { width: 10, height: 10, borderRadius: 5 },
  botaoQuadrado: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COR.borda,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  botaoQuadradoAtivo: { backgroundColor: COR.azul, borderColor: COR.azul },
  botaoPrimario: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COR.botao,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 16,
  },
  botaoPrimarioTexto: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  erro: {
    marginTop: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    color: COR.perigo,
    fontSize: 12.5,
    fontWeight: "500",
    padding: 10,
    borderRadius: 12,
  },
  dica: { fontSize: 11.5, color: COR.textoSuave, marginTop: 8 },

  manobra: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: COR.marinho,
    borderRadius: 16,
    padding: 14,
  },
  manobraIcone: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  manobraDistancia: { color: "#ffffff", fontSize: 22, fontWeight: "900" },
  manobraTexto: { color: "rgba(255,255,255,0.85)", fontSize: 13.5, fontWeight: "600" },
  manobraAviso: { color: "#fcd34d", fontSize: 11.5, fontWeight: "700", marginTop: 3 },

  resumo: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COR.borda,
    padding: 14,
  },
  resumoLinha: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resumoTempo: { fontSize: 24, fontWeight: "900", color: COR.sucesso },
  resumoDistancia: { fontSize: 12.5, fontWeight: "600", color: COR.textoSuave },
  botaoIniciar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COR.azul,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  botaoEncerrar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COR.perigo,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  botaoSecundario: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COR.borda,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COR.fundo,
    borderWidth: 1,
    borderColor: COR.borda,
    marginRight: 8,
  },
  chipAtivo: { backgroundColor: COR.primaria, borderColor: COR.primaria },
  chipTexto: { fontSize: 12, fontWeight: "700", color: COR.textoSuave },
  ocorrenciasLinha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    backgroundColor: COR.fundo,
    borderRadius: 12,
    padding: 10,
  },
  ocorrenciasTexto: { flex: 1, fontSize: 12, fontWeight: "600", color: COR.textoMedio },
});

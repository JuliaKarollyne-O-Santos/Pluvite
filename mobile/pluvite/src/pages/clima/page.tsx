import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CloudRain, Droplets, MapPin, Search, Sun, Wind } from "lucide-react-native";

import Cabecalho from "../../components/Cabecalho";
import BotaoAjudaWhatsApp from "../../components/BotaoAjudaWhatsApp";
// Alerta de emergencia: card em destaque + modal na tela inicial
import { useAlerta } from "../../context/AlertaContext";
import AlertaDestaqueCard from "../../components/AlertaDestaqueCard";
import AlertaEmergenciaModal from "../../components/AlertaEmergenciaModal";
import { CENTRO_MUNICIPIO, MUNICIPIOS, normalizar, type Municipio } from "../../lib/constantes";
import { distanciaMetros, type Coordenada } from "../../lib/geo";
import { COR, SOMBRA } from "../../lib/tema";

interface DadosClima {
  temperatura: number;
  tempMax: number;
  tempMin: number;
  chuva: number;
  sensacao: number;
  vento: number;
  umidade: number;
  codigo: number;
  cidade: string;
}

interface PrevisaoDia {
  dia: string;
  max: number;
  min: number;
  chuva: number;
  codigo: number;
}

interface CidadeProxima {
  nome: Municipio;
  temp: number;
  codigo: number;
}

interface RespostaOpenMeteo {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation_probability?: number;
    wind_speed_10m: number;
    weather_code: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_probability_max: number[];
  };
}

const CIDADE_PADRAO: Municipio = "Taubaté";
const DIAS_PREVISAO = 6;

// Mapeia o weathercode da Open-Meteo pra um emoji simples
function getEmojiClima(codigo: number) {
  if (codigo === 0) return "☀️";
  if (codigo <= 3) return "🌤️";
  if (codigo <= 49) return "🌫️";
  if (codigo <= 69) return "🌧️";
  if (codigo <= 79) return "❄️";
  if (codigo <= 99) return "⛈️";
  return "🌤️";
}

function getCondicaoTexto(codigo: number) {
  if (codigo === 0) return "Céu limpo";
  if (codigo <= 3) return "Parcialmente nublado";
  if (codigo <= 49) return "Nevoeiro";
  if (codigo <= 69) return "Chuvoso";
  if (codigo <= 79) return "Neve";
  if (codigo <= 99) return "Tempestade";
  return "Indefinido";
}

function getDiaSemana(dataStr: string) {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  // "2026-11-12" é lido como UTC; meio-dia evita cair no dia anterior no fuso de SP
  return dias[new Date(`${dataStr}T12:00:00`).getDay()];
}

// Busca o clima para uma latitude/longitude
async function buscarClima([lat, lon]: Coordenada): Promise<RespostaOpenMeteo> {
  const resposta = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=America%2FSao_Paulo`,
  );
  if (!resposta.ok) throw new Error(`Open-Meteo HTTP ${resposta.status}`);
  return resposta.json();
}

/** Coordenadas: municípios do Vale usam o centro conhecido; fora dele, geocodifica. */
async function localizarCidade(nome: string): Promise<{ nome: string; coordenada: Coordenada } | null> {
  const municipio = MUNICIPIOS.find((m) => normalizar(m) === normalizar(nome));
  if (municipio) return { nome: municipio, coordenada: CENTRO_MUNICIPIO[municipio] };

  const resposta = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=1&language=pt&format=json&countryCode=BR`,
  );
  const dados = (await resposta.json()) as {
    results?: { name: string; latitude: number; longitude: number }[];
  };
  const local = dados.results?.[0];
  return local ? { nome: local.name, coordenada: [local.latitude, local.longitude] } : null;
}

/** As 3 sedes do Vale mais próximas de um ponto */
function municipiosProximos(coordenada: Coordenada, excluir: string): Municipio[] {
  return MUNICIPIOS.filter((m) => normalizar(m) !== normalizar(excluir))
    .map((m) => ({ m, d: distanciaMetros(coordenada, CENTRO_MUNICIPIO[m]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ m }) => m);
}

export default function Clima() {
  // Alerta vindo do push, do WebSocket ou da consulta feita ao abrir o app
  const { alerta, ultimoAlerta, dispensar, reabrir, municipioAlertas } = useAlerta();

  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cidadeAtual, setCidadeAtual] = useState<string>(CIDADE_PADRAO);
  const [dadosClima, setDadosClima] = useState<DadosClima | null>(null);
  const [previsao, setPrevisao] = useState<PrevisaoDia[]>([]);
  const [cidadesProximas, setCidadesProximas] = useState<CidadeProxima[]>([]);

  // CARREGAMENTO DO CLIMA DA CIDADE
  const carregarCidade = useCallback(async (nomeCidade: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const local = await localizarCidade(nomeCidade);
      if (!local) {
        Alert.alert("Clima", "Cidade não encontrada!");
        return;
      }

      const clima = await buscarClima(local.coordenada);
      setDadosClima({
        temperatura: Math.round(clima.current.temperature_2m),
        tempMax: Math.round(clima.daily.temperature_2m_max[0]),
        tempMin: Math.round(clima.daily.temperature_2m_min[0]),
        chuva: clima.current.precipitation_probability ?? clima.daily.precipitation_probability_max[0] ?? 0,
        sensacao: Math.round(clima.current.apparent_temperature),
        vento: Math.round(clima.current.wind_speed_10m),
        umidade: clima.current.relative_humidity_2m,
        codigo: clima.current.weather_code,
        cidade: local.nome,
      });

      setPrevisao(
        clima.daily.time.slice(1, DIAS_PREVISAO + 1).map((data, i) => ({
          dia: getDiaSemana(data),
          max: Math.round(clima.daily.temperature_2m_max[i + 1]),
          min: Math.round(clima.daily.temperature_2m_min[i + 1]),
          chuva: clima.daily.precipitation_probability_max[i + 1] ?? 0,
          codigo: clima.daily.weather_code[i + 1],
        })),
      );
      setCidadeAtual(local.nome);

      // CIDADES PRÓXIMAS (em paralelo; uma falha não derruba as outras)
      const vizinhas = municipiosProximos(local.coordenada, local.nome);
      const resultados = await Promise.allSettled(
        vizinhas.map(async (nome) => {
          const dados = await buscarClima(CENTRO_MUNICIPIO[nome]);
          return {
            nome,
            temp: Math.round(dados.current.temperature_2m),
            codigo: dados.current.weather_code,
          };
        }),
      );
      setCidadesProximas(
        resultados.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
      );
    } catch (erroClima) {
      console.error("Erro ao carregar o clima:", erroClima);
      setErro("Não foi possível carregar o clima. Verifique sua internet.");
    } finally {
      setCarregando(false);
    }
  }, []);

  // Abre na cidade dos alertas do perfil (ou Taubaté)
  useEffect(() => {
    void carregarCidade(municipioAlertas || CIDADE_PADRAO);
  }, [municipioAlertas, carregarCidade]);

  const handleBuscar = () => {
    if (!busca.trim()) return;
    void carregarCidade(busca.trim());
    setBusca("");
  };

  const handleAtualizar = async () => {
    setAtualizando(true);
    await carregarCidade(cidadeAtual);
    setAtualizando(false);
  };

  const hoje = new Date();

  return (
    <View style={styles.container}>
      <Cabecalho />

      {carregando && !dadosClima ? (
        <View style={styles.carregando}>
          <ActivityIndicator size="large" color={COR.destaque} />
          <Text style={styles.carregandoTexto}>Carregando previsão...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.rolagem}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={handleAtualizar} />}
          keyboardShouldPersistTaps="handled"
        >
          {/* Emergência em andamento — fica no topo enquanto o alerta vale */}
          <AlertaDestaqueCard alerta={ultimoAlerta} aoTocar={reabrir} />

          {!municipioAlertas && (
            <View style={styles.avisoMunicipio}>
              <Text style={styles.avisoMunicipioTitulo}>Escolha sua cidade para receber alertas</Text>
              <Text style={styles.avisoMunicipioTexto}>
                Acesse Perfil → Notificações e selecione o município que deseja acompanhar.
              </Text>
            </View>
          )}

          {/* TÍTULO */}
          <Text style={styles.titulo}>Previsão do Tempo</Text>
          <Text style={styles.subtitulo}>Condições atuais e próximos dias no Vale do Paraíba</Text>

          {/* BUSCA */}
          <View style={[styles.busca, SOMBRA]}>
            <Search size={18} color={COR.textoApagado} />
            <TextInput
              style={styles.buscaInput}
              placeholder="Buscar cidade..."
              placeholderTextColor={COR.textoApagado}
              value={busca}
              onChangeText={setBusca}
              onSubmitEditing={handleBuscar}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.buscaBotao} onPress={handleBuscar} disabled={carregando}>
              {carregando ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.buscaBotaoTexto}>Buscar</Text>
              )}
            </TouchableOpacity>
          </View>

          {erro && <Text style={styles.erro}>{erro}</Text>}

          {dadosClima && (
            <>
              {/* CARD PRINCIPAL (mesmo azul do Clima do site) */}
              <View style={styles.hero}>
                <View style={styles.heroCirculo} />
                <View style={{ flex: 1 }}>
                  <View style={styles.heroCidade}>
                    <MapPin size={18} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.heroCidadeTexto} numberOfLines={1}>
                      {dadosClima.cidade}
                    </Text>
                  </View>
                  <Text style={styles.heroDia}>
                    {hoje.toLocaleDateString("pt-BR", { weekday: "long" })}
                  </Text>
                  <Text style={styles.heroData}>
                    {hoje.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
                  </Text>
                  <Text style={styles.heroTemperatura}>{dadosClima.temperatura}°C</Text>
                  <Text style={styles.heroMinMax}>
                    Máx: {dadosClima.tempMax}°   Mín: {dadosClima.tempMin}°
                  </Text>
                  <View style={styles.heroCondicao}>
                    <Text style={styles.heroCondicaoTexto}>{getCondicaoTexto(dadosClima.codigo)}</Text>
                  </View>
                </View>
                <Text style={styles.heroEmoji}>{getEmojiClima(dadosClima.codigo)}</Text>
              </View>

              {/* PRÓXIMOS DIAS */}
              <View style={[styles.card, SOMBRA]}>
                <Text style={styles.cardTitulo}>Próximos dias</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {previsao.map((dia) => (
                    <View key={dia.dia + dia.max} style={styles.dia}>
                      <Text style={styles.diaNome}>{dia.dia}</Text>
                      <Text style={styles.diaEmoji}>{getEmojiClima(dia.codigo)}</Text>
                      <Text style={styles.diaMax}>{dia.max}°</Text>
                      <Text style={styles.diaMin}>{dia.min}°</Text>
                      <Text style={styles.diaChuva}>💧{dia.chuva}%</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>

              {/* MAIS INFORMAÇÕES */}
              <View style={[styles.card, SOMBRA]}>
                <Text style={styles.cardTitulo}>Mais informações</Text>
                <View style={styles.grade}>
                  {[
                    { rotulo: "Chuva", valor: `${dadosClima.chuva}%`, Icone: CloudRain, cor: COR.destaque },
                    { rotulo: "Sensação", valor: `${dadosClima.sensacao}°C`, Icone: Sun, cor: "#ea580c" },
                    { rotulo: "Vento", valor: `${dadosClima.vento} km/h`, Icone: Wind, cor: "#16a34a" },
                    { rotulo: "Umidade", valor: `${dadosClima.umidade}%`, Icone: Droplets, cor: "#0d9488" },
                  ].map(({ rotulo, valor, Icone, cor }) => (
                    <View key={rotulo} style={styles.info}>
                      <View style={[styles.infoIcone, { backgroundColor: `${cor}1a` }]}>
                        <Icone size={16} color={cor} />
                      </View>
                      <Text style={styles.infoRotulo}>{rotulo}</Text>
                      <Text style={styles.infoValor}>{valor}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* CIDADES PRÓXIMAS */}
              {cidadesProximas.length > 0 && (
                <View style={[styles.card, SOMBRA]}>
                  <Text style={styles.cardTitulo}>Cidades próximas</Text>
                  {cidadesProximas.map((c) => (
                    <TouchableOpacity
                      key={c.nome}
                      style={styles.proxima}
                      onPress={() => carregarCidade(c.nome)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.proximaNome}>{c.nome}</Text>
                        <Text style={styles.proximaCondicao}>{getCondicaoTexto(c.codigo)}</Text>
                      </View>
                      <Text style={styles.proximaTemp}>{c.temp}°</Text>
                      <Text style={styles.proximaEmoji}>{getEmojiClima(c.codigo)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* ALERTAS PELO WHATSAPP */}
              <View style={[styles.card, SOMBRA, styles.whatsapp]}>
                <BotaoAjudaWhatsApp variante="destaque" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitulo}>Alertas pelo WhatsApp</Text>
                  <Text style={styles.whatsappTexto}>
                    Receba os avisos de risco da sua cidade direto no WhatsApp. Toque no botão.
                  </Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Modal com o resumo da emergência */}
      <AlertaEmergenciaModal alerta={alerta} aoFechar={dispensar} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eef3fb" },
  carregando: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  carregandoTexto: { fontSize: 13, fontWeight: "500", color: COR.textoSuave },
  rolagem: { padding: 16, paddingBottom: 40 },

  avisoMunicipio: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  avisoMunicipioTitulo: { color: "#1e3a8a", fontSize: 13, fontWeight: "800" },
  avisoMunicipioTexto: { color: "#475569", fontSize: 12, lineHeight: 17, marginTop: 4 },

  titulo: { fontSize: 23, fontWeight: "800", color: "#111827" },
  subtitulo: { fontSize: 13, color: COR.textoApagado, marginTop: 2, marginBottom: 14 },

  busca: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingLeft: 16,
    padding: 5,
    marginBottom: 16,
  },
  buscaInput: { flex: 1, fontSize: 14, color: "#374151", paddingVertical: 6 },
  buscaBotao: {
    backgroundColor: COR.destaque,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    minWidth: 74,
    alignItems: "center",
  },
  buscaBotaoTexto: { color: "#ffffff", fontSize: 13.5, fontWeight: "700" },
  erro: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    color: COR.perigo,
    fontSize: 13,
    fontWeight: "500",
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COR.destaque,
    borderRadius: 24,
    padding: 22,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#2a68e2",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroCirculo: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  heroCidade: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroCidadeTexto: { flexShrink: 1, color: "#ffffff", fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  heroDia: { color: "#dbeafe", fontSize: 14, fontWeight: "600", marginTop: 12, textTransform: "capitalize" },
  heroData: { color: "rgba(219,234,254,0.8)", fontSize: 12, fontWeight: "500" },
  heroTemperatura: { color: "#ffffff", fontSize: 54, fontWeight: "700", marginTop: 8, letterSpacing: -1 },
  heroMinMax: { color: "#dbeafe", fontSize: 12.5, fontWeight: "600", marginBottom: 10 },
  heroCondicao: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroCondicaoTexto: { color: "#ffffff", fontSize: 13, fontWeight: "500" },
  heroEmoji: { fontSize: 76 },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    padding: 16,
    marginBottom: 16,
  },
  cardTitulo: { fontSize: 14, fontWeight: "700", color: "#1f2937", marginBottom: 12 },
  dia: {
    alignItems: "center",
    gap: 3,
    padding: 10,
    minWidth: 64,
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  diaNome: { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  diaEmoji: { fontSize: 22 },
  diaMax: { fontSize: 13, fontWeight: "700", color: "#1f2937" },
  diaMin: { fontSize: 12, color: COR.textoApagado },
  diaChuva: { fontSize: 10, color: "#3b82f6", fontWeight: "600" },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  info: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    padding: 12,
  },
  infoIcone: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  infoRotulo: { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  infoValor: { fontSize: 19, fontWeight: "800", color: "#111827", marginTop: 2 },
  proxima: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  proximaNome: { fontSize: 14, fontWeight: "700", color: "#111827" },
  proximaCondicao: { fontSize: 12, color: COR.textoApagado, marginTop: 1 },
  proximaTemp: { fontSize: 16, fontWeight: "700", color: "#111827" },
  proximaEmoji: { fontSize: 20 },
  whatsapp: { flexDirection: "row", alignItems: "center", gap: 16 },
  whatsappTexto: { fontSize: 12.5, color: COR.textoSuave, marginTop: -6, lineHeight: 17 },
});

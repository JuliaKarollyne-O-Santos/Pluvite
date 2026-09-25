import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, MapPin, CloudRain, Sun, Wind, Droplets } from "lucide-react-native";

// Alerta de emergencia: card em destaque + modal na tela inicial
import { useAlerta } from "../../context/AlertaContext";
import AlertaDestaqueCard from "../../components/AlertaDestaqueCard";
import AlertaEmergenciaModal from "../../components/AlertaEmergenciaModal";

interface DadosClima {
  temperatura: number;
  tempMax: number;
  tempMin: number;
  chuva: number;
  sensacao: number;
  vento: number;
  umidade: number;
  condicao: string;
  cidade: string;
}

interface PrevisaoDia {
  dia: string;
  max: number;
  min: number;
  codigo: number;
}

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
  if (codigo === 0) return "Céu Limpo";
  if (codigo <= 3) return "Parcialmente Nublado";
  if (codigo <= 49) return "Nevoeiro";
  if (codigo <= 69) return "Chuvoso";
  if (codigo <= 79) return "Neve";
  if (codigo <= 99) return "Tempestade";
  return "Indefinido";
}

function getDiaSemana(dataStr: string) {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const data = new Date(dataStr);
  return dias[data.getDay()];
}

export default function Clima() {
  // Alerta vindo do push, do WebSocket ou da consulta feita ao abrir o app
  const { alerta, ultimoAlerta, dispensar, reabrir } = useAlerta();

  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [cidadeAtual, setCidadeAtual] = useState("Taubaté");
  const [dadosClima, setDadosClima] = useState<DadosClima | null>(null);
  const [previsao, setPrevisao] = useState<PrevisaoDia[]>([]);
  const [cidadesProximas, setCidadesProximas] = useState<
    { nome: string; temp: number; condicao: string; codigo: number }[]
  >([]);

  // Busca coordenadas de uma cidade pelo nome
  const buscarCoordenadas = async (nomeCidade: string) => {
    const resp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        nomeCidade
      )}&count=1&language=pt&format=json`
    );
    const data = await resp.json();
    if (!data.results || data.results.length === 0) return null;
    return data.results[0];
  };

  // Busca o clima para uma latitude/longitude
  const buscarClima = async (lat: number, lon: number) => {
    const resp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=America%2FSao_Paulo`
    );
    return resp.json();
  };

  const carregarCidade = async (nomeCidade: string) => {
    setCarregando(true);
    try {
      const local = await buscarCoordenadas(nomeCidade);
      if (!local) {
        Alert.alert("Erro", "Cidade não encontrada!");
        setCarregando(false);
        return;
      }

      const clima = await buscarClima(local.latitude, local.longitude);

      setDadosClima({
        temperatura: Math.round(clima.current.temperature_2m),
        tempMax: Math.round(clima.daily.temperature_2m_max[0]),
        tempMin: Math.round(clima.daily.temperature_2m_min[0]),
        chuva: clima.current.precipitation_probability ?? 0,
        sensacao: Math.round(clima.current.apparent_temperature),
        vento: Math.round(clima.current.wind_speed_10m),
        umidade: clima.current.relative_humidity_2m,
        condicao: getCondicaoTexto(clima.current.weather_code),
        cidade: local.name,
      });

      // Próximos 3 dias (ignorando hoje, índices 1, 2, 3)
      const dias: PrevisaoDia[] = [];
      for (let i = 1; i <= 3; i++) {
        dias.push({
          dia: getDiaSemana(clima.daily.time[i]),
          max: Math.round(clima.daily.temperature_2m_max[i]),
          min: Math.round(clima.daily.temperature_2m_min[i]),
          codigo: clima.daily.weather_code[i],
        });
      }
      setPrevisao(dias);
      setCidadeAtual(local.name);
    } catch (error) {
      console.error(error);
      Alert.alert("Erro", "Não foi possível carregar o clima. Verifique sua internet.");
    } finally {
      setCarregando(false);
    }
  };

  // Carrega cidades próximas fixas (exemplo: Ubatuba e Aparecida)
  const carregarCidadesProximas = async () => {
    const nomes = ["Ubatuba", "Aparecida"];
    const resultados = [];

    for (const nome of nomes) {
      try {
        const local = await buscarCoordenadas(nome);
        if (!local) continue;
        const clima = await buscarClima(local.latitude, local.longitude);
        resultados.push({
          nome: local.name,
          temp: Math.round(clima.current.temperature_2m),
          condicao: getCondicaoTexto(clima.current.weather_code),
          codigo: clima.current.weather_code,
        });
      } catch (e) {
        console.error(e);
      }
    }
    setCidadesProximas(resultados);
  };

  useEffect(() => {
    carregarCidade("Taubaté");
    carregarCidadesProximas();
  }, []);

  const handleBuscar = () => {
    if (!busca.trim()) return;
    carregarCidade(busca.trim());
    setBusca("");
  };

  if (carregando && !dadosClima) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1447c4" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Emergencia em andamento - fica no topo enquanto o alerta vale */}
        <AlertaDestaqueCard alerta={ultimoAlerta} aoTocar={reabrir} />

        {/* Barra de busca */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Digite uma cidade..."
            placeholderTextColor="#94a3b8"
            value={busca}
            onChangeText={setBusca}
            onSubmitEditing={handleBuscar}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchButton} onPress={handleBuscar}>
            <Search size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Card principal */}
        <View style={styles.mainCard}>
          <View style={styles.cityTag}>
            <MapPin size={13} color="#1447c4" />
            <Text style={styles.cityTagText}>{dadosClima?.cidade}</Text>
          </View>

          <Text style={styles.dayText}>
            {new Date().toLocaleDateString("pt-BR", { weekday: "long" })}
          </Text>
          <Text style={styles.dateText}>
            {new Date().toLocaleDateString("pt-BR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Text>

          <View style={styles.tempRow}>
            <Text style={styles.tempText}>{dadosClima?.temperatura}°C</Text>
            <Text style={styles.weatherEmoji}>☀️</Text>
          </View>

          <Text style={styles.minMaxText}>
            Máxima: {dadosClima?.tempMax}°  Mínima: {dadosClima?.tempMin}°
          </Text>

          <View style={styles.conditionTag}>
            <Text style={styles.conditionText}>{dadosClima?.condicao}</Text>
          </View>
        </View>

        {/* Mais informações */}
        <Text style={styles.sectionTitle}>Mais informações</Text>
        <View style={styles.infoGrid}>
          <View style={[styles.infoCard, { backgroundColor: "#2563eb" }]}>
            <View style={styles.infoLabelRow}>
              <CloudRain size={14} color="#fff" />
              <Text style={styles.infoLabel}>Chuva</Text>
            </View>
            <Text style={styles.infoValue}>{dadosClima?.chuva}%</Text>
          </View>

          <View style={[styles.infoCard, { backgroundColor: "#ea580c" }]}>
            <View style={styles.infoLabelRow}>
              <Sun size={14} color="#fff" />
              <Text style={styles.infoLabel}>Sensação</Text>
            </View>
            <Text style={styles.infoValue}>{dadosClima?.sensacao}°C</Text>
          </View>

          <View style={[styles.infoCard, { backgroundColor: "#16a34a" }]}>
            <View style={styles.infoLabelRow}>
              <Wind size={14} color="#fff" />
              <Text style={styles.infoLabel}>Vento</Text>
            </View>
            <Text style={styles.infoValue}>{dadosClima?.vento} km/h</Text>
          </View>

          <View style={[styles.infoCard, { backgroundColor: "#0d9488" }]}>
            <View style={styles.infoLabelRow}>
              <Droplets size={14} color="#fff" />
              <Text style={styles.infoLabel}>Umidade</Text>
            </View>
            <Text style={styles.infoValue}>{dadosClima?.umidade}%</Text>
          </View>
        </View>

        {/* Próximos dias */}
        <Text style={styles.sectionTitle}>Próximos dias</Text>
        <View style={styles.forecastRow}>
          {previsao.map((dia, idx) => (
            <View key={idx} style={styles.forecastCard}>
              <Text style={styles.forecastDay}>{dia.dia}</Text>
              <Text style={styles.forecastEmoji}>{getEmojiClima(dia.codigo)}</Text>
              <Text style={styles.forecastMax}>{dia.max}°</Text>
              <Text style={styles.forecastMin}>{dia.min}°</Text>
            </View>
          ))}
        </View>

        {/* Outras cidades próximas */}
        <Text style={styles.sectionTitle}>Outras cidades próximas</Text>
        <View style={styles.nearbyContainer}>
          {cidadesProximas.map((c, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.nearbyCard}
              onPress={() => carregarCidade(c.nome)}
            >
              <View>
                <Text style={styles.nearbyName}>{c.nome}</Text>
                <Text style={styles.nearbyCondition}>{c.condicao}</Text>
              </View>
              <View style={styles.nearbyTempRow}>
                <Text style={styles.nearbyTemp}>{c.temp}°</Text>
                <Text style={styles.nearbyEmoji}>{getEmojiClima(c.codigo)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Modal com o resumo da emergencia */}
      <AlertaEmergenciaModal alerta={alerta} aoFechar={dispensar} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
  },
  searchButton: {
    backgroundColor: "#1447c4",
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  mainCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cityTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#e0e7ff",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 14,
  },
  cityTagText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1447c4",
  },
  dayText: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "capitalize",
  },
  dateText: {
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 12,
  },
  tempRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tempText: {
    fontSize: 46,
    fontWeight: "800",
    color: "#0f172a",
  },
  weatherEmoji: {
    fontSize: 56,
  },
  minMaxText: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 6,
    marginBottom: 12,
  },
  conditionTag: {
    alignSelf: "flex-start",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  conditionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 10,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  infoCard: {
    flexBasis: "47%",
    borderRadius: 14,
    padding: 14,
  },
  infoLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  infoLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  infoValue: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  forecastRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  forecastCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  forecastDay: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
  },
  forecastEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  forecastMax: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  forecastMin: {
    fontSize: 12,
    color: "#94a3b8",
  },
  nearbyContainer: {
    gap: 10,
  },
  nearbyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nearbyName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  nearbyCondition: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },
  nearbyTempRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nearbyTemp: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  nearbyEmoji: {
    fontSize: 20,
  },
});
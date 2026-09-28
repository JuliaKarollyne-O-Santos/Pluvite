import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertTriangle,
  Wrench,
  Eye,
  Plus,
  Search,
  MapPin,
  Filter,
  MessageSquare,
  ThumbsUp,
  Share2,
  TrendingUp,
  CloudRain,
} from "lucide-react-native";

type Ocorrencia = {
  id: string;
  nome: string;
  iniciais: string;
  endereco: string;
  bairro: string;
  tempo: string;
  status: "aguardando" | "andamento" | "resolvido";
  descricao: string;
  imagem?: string;
  curtidas: number;
  comentarios: number;
};

const CIDADES = ["Todas", "Taubaté", "São José dos Campos", "Ubatuba", "Caraguatatuba", "São Sebastião"];
const CATEGORIAS = ["Todas", "Alagamento", "Deslizamento", "Árvore Caída", "Via Interditada"];

const OCORRENCIAS: Ocorrencia[] = [
  {
    id: "1",
    nome: "Maria Silva",
    iniciais: "MS",
    endereco: "Avenida Armando de Moura, 256",
    bairro: "Três Marias",
    tempo: "há 15 minutos",
    status: "andamento",
    descricao:
      "Ponto de alagamento acentuado próximo ao cruzamento principal. A água cobriu a calçada impossibilitando a travessia de pedestres. Trânsito lento no local.",
    imagem: "https://picsum.photos/seed/tresmarias/800/500",
    curtidas: 12,
    comentarios: 4,
  },
];

const STATUS_CONFIG = {
  aguardando: { label: "Aguardando", bg: "#fef2f2", border: "#fee2e2", text: "#dc2626", icon: AlertTriangle },
  andamento: { label: "Em Andamento", bg: "#fffbeb", border: "#fde68a", text: "#92400e", icon: Wrench },
  resolvido: { label: "Resolvido", bg: "#ecfdf5", border: "#d1fae5", text: "#059669", icon: Eye },
};

export default function Feed() {
  const [busca, setBusca] = useState("");
  const [cidadeAtiva, setCidadeAtiva] = useState("Todas");
  const [categoriaAtiva, setCategoriaAtiva] = useState("Todas");

  const statusCards = [
    { label: "Aguardando", valor: 0, cor: "#dc2626", bg: "#fef2f2", icon: AlertTriangle },
    { label: "Em Andamento", valor: 1, cor: "#d97706", bg: "#fffbeb", icon: Wrench },
    { label: "Visualizados", valor: 1, cor: "#059669", bg: "#ecfdf5", icon: Eye },
  ];

  const bairrosComMaisRelatos = [
    { bairro: "Cecap", relatos: 8 },
    { bairro: "Jardim Jaraguá", relatos: 5 },
    { bairro: "Independência", relatos: 3 },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* CABEÇALHO */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Feed de Ocorrências</Text>
            <Text style={styles.headerSubtitle}>
              Acompanhe e reporte problemas urbanos em tempo real na sua região.
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.publicarButton}>
          <Plus size={18} color="#ffffff" />
          <Text style={styles.publicarButtonText}>Publicar Ocorrência</Text>
        </TouchableOpacity>

        {/* CARDS DE STATUS */}
        <View style={styles.statusRow}>
          {statusCards.map((item) => {
            const Icon = item.icon;
            return (
              <View key={item.label} style={styles.statusCard}>
                <View style={[styles.statusIconBadge, { backgroundColor: item.bg }]}>
                  <Icon size={18} color={item.cor} />
                </View>
                <Text style={styles.statusValor}>{item.valor}</Text>
                <Text style={[styles.statusLabel, { color: item.cor }]}>{item.label}</Text>
              </View>
            );
          })}
        </View>

        {/* FILTROS */}
        <View style={styles.filtrosCard}>
          <View style={styles.buscaBox}>
            <Search size={16} color="#94a3b8" />
            <TextInput
              style={styles.buscaInput}
              placeholder="Buscar por bairro (ex: Quiririm)..."
              placeholderTextColor="#94a3b8"
              value={busca}
              onChangeText={setBusca}
            />
          </View>

          <View style={styles.filtroLabelRow}>
            <MapPin size={13} color="#94a3b8" />
            <Text style={styles.filtroLabel}>Cidade</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          >
            {CIDADES.map((cidade) => (
              <TouchableOpacity
                key={cidade}
                style={[styles.chip, cidadeAtiva === cidade && styles.chipAtivo]}
                onPress={() => setCidadeAtiva(cidade)}
              >
                <Text style={[styles.chipText, cidadeAtiva === cidade && styles.chipTextAtivo]}>{cidade}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={[styles.filtroLabelRow, { marginTop: 12 }]}>
            <Filter size={13} color="#94a3b8" />
            <Text style={styles.filtroLabel}>Categoria</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          >
            {CATEGORIAS.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, categoriaAtiva === cat && styles.chipAtivoEscuro]}
                onPress={() => setCategoriaAtiva(cat)}
              >
                <Text style={[styles.chipText, categoriaAtiva === cat && styles.chipTextAtivo]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* SITUAÇÃO NA REGIÃO */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.iconBadge}>
                <CloudRain size={14} color="#1447c4" />
              </View>
              <Text style={styles.cardTitle}>Situação em Três Marias</Text>
            </View>
            <View style={styles.estavelBadge}>
              <Text style={styles.estavelBadgeText}>Estável</Text>
            </View>
          </View>

          <View style={styles.campoBox}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.campoLabelInline}>Risco de Deslizamento:</Text>
              <Text style={styles.riscoTexto}>Baixo</Text>
            </View>
          </View>
        </View>

        {/* BAIRROS COM MAIS RELATOS */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.iconBadge}>
                <TrendingUp size={14} color="#1447c4" />
              </View>
              <Text style={styles.cardTitle}>Bairros com mais relatos</Text>
            </View>
          </View>

          {bairrosComMaisRelatos.map((item) => (
            <View key={item.bairro} style={styles.bairroRow}>
              <Text style={styles.bairroNome}>{item.bairro}</Text>
              <View style={styles.bairroBadge}>
                <Text style={styles.bairroBadgeText}>{item.relatos} relatos</Text>
              </View>
            </View>
          ))}
        </View>

        {/* LISTA DE OCORRÊNCIAS */}
        <Text style={styles.secaoTitulo}>Ocorrências Recentes</Text>

        {OCORRENCIAS.map((oc) => {
          const status = STATUS_CONFIG[oc.status];
          const StatusIcon = status.icon;
          return (
            <View key={oc.id} style={styles.ocorrenciaCard}>
              <View style={styles.ocorrenciaHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <View style={styles.avatarCirculo}>
                    <Text style={styles.avatarIniciais}>{oc.iniciais}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ocorrenciaNome}>{oc.nome}</Text>
                    <View style={styles.enderecoRow}>
                      <MapPin size={11} color="#94a3b8" />
                      <Text style={styles.enderecoTexto} numberOfLines={1}>
                        {oc.endereco} • {oc.bairro}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.tempoStatusRow}>
                <Text style={styles.tempoTexto}>{oc.tempo}</Text>
                <View style={[styles.statusBadge, { backgroundColor: status.bg, borderColor: status.border }]}>
                  <StatusIcon size={11} color={status.text} />
                  <Text style={[styles.statusBadgeText, { color: status.text }]}>{status.label}</Text>
                </View>
              </View>

              <Text style={styles.descricaoTexto}>{oc.descricao}</Text>

              {oc.imagem && (
                <Image source={{ uri: oc.imagem }} style={styles.ocorrenciaImagem} resizeMode="cover" />
              )}

              <View style={styles.interacoesRow}>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <TouchableOpacity style={styles.interacaoItem}>
                    <ThumbsUp size={15} color="#64748b" />
                    <Text style={styles.interacaoTexto}>Curtidas ({oc.curtidas})</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.interacaoItem}>
                    <MessageSquare size={15} color="#64748b" />
                    <Text style={styles.interacaoTexto}>Comentários ({oc.comentarios})</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.interacaoItem}>
                  <Share2 size={15} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  scrollContent: { padding: 16, paddingBottom: 40 },

  headerRow: { marginBottom: 14 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#1e293b" },
  headerSubtitle: { fontSize: 12, color: "#94a3b8", marginTop: 4, lineHeight: 17 },

  publicarButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#091f75",
    borderRadius: 14,
    paddingVertical: 13,
    marginBottom: 16,
  },
  publicarButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },

  statusRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statusCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  statusIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statusValor: { fontSize: 20, fontWeight: "900", color: "#1e293b", lineHeight: 22 },
  statusLabel: { fontSize: 9.5, fontWeight: "800", textTransform: "uppercase", marginTop: 2 },

  filtrosCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  buscaBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  buscaInput: { flex: 1, fontSize: 12.5, color: "#334155", fontWeight: "500" },
  filtroLabelRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  filtroLabel: { fontSize: 10.5, fontWeight: "800", color: "#94a3b8", textTransform: "uppercase" },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chipAtivo: { backgroundColor: "#eff6ff", borderColor: "#dbeafe" },
  chipAtivoEscuro: { backgroundColor: "#091f75", borderColor: "#091f75" },
  chipText: { fontSize: 11.5, fontWeight: "700", color: "#64748b" },
  chipTextAtivo: { color: "#1447c4" },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 13, fontWeight: "800", color: "#1e293b" },

  estavelBadge: {
    backgroundColor: "#ecfdf5",
    borderColor: "#d1fae5",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  estavelBadgeText: { fontSize: 10, fontWeight: "800", color: "#059669" },

  campoBox: { backgroundColor: "#f8fafc", borderRadius: 12, borderWidth: 1, borderColor: "#f1f5f9", padding: 10 },
  campoLabelInline: { fontSize: 12, color: "#64748b", fontWeight: "600" },
  riscoTexto: { fontSize: 12, fontWeight: "800", color: "#d97706" },

  bairroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  bairroNome: { fontSize: 12.5, fontWeight: "700", color: "#334155" },
  bairroBadge: { backgroundColor: "#eff6ff", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  bairroBadgeText: { fontSize: 10.5, fontWeight: "800", color: "#1447c4" },

  secaoTitulo: { fontSize: 15, fontWeight: "800", color: "#1e293b", marginBottom: 12 },

  ocorrenciaCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  ocorrenciaHeader: { flexDirection: "row", padding: 14, paddingBottom: 8 },
  avatarCirculo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#091f75",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarIniciais: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  ocorrenciaNome: { fontSize: 13.5, fontWeight: "800", color: "#1e293b" },
  enderecoRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  enderecoTexto: { fontSize: 11, color: "#94a3b8", fontWeight: "500", flexShrink: 1 },

  tempoStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  tempoTexto: { fontSize: 10.5, color: "#94a3b8", fontWeight: "600" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: { fontSize: 10.5, fontWeight: "800" },

  descricaoTexto: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "500",
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  ocorrenciaImagem: { width: "100%", height: 200, backgroundColor: "#f1f5f9" },

  interacoesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  interacaoItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  interacaoTexto: { fontSize: 11.5, fontWeight: "700", color: "#64748b" },
});
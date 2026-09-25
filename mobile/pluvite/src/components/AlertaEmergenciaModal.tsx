/**
 * ALERTA 3 (parte 2) — modal em destaque na tela inicial.
 *
 * Reproduz o mesmo conteudo do pop-up do site: tipo, localizacao, endereco,
 * prioridade, status e descricao, com a cor da severidade vinda do backend.
 */

import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AlertTriangle, Activity, MapPin, Navigation, X } from "lucide-react-native";

import type { Alerta } from "../services/alertas";

interface Props {
  alerta: Alerta | null;
  aoFechar: () => void;
}

function formatarData(iso: string) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Linha({
  Icone,
  rotulo,
  valor,
  cor,
}: {
  Icone: typeof MapPin;
  rotulo: string;
  valor: string;
  cor?: string;
}) {
  return (
    <View style={styles.linha}>
      <Icone size={16} color="#94a3b8" style={styles.linhaIcone} />
      <Text style={styles.linhaTexto}>
        <Text style={styles.linhaRotulo}>{rotulo}: </Text>
        <Text style={cor ? { color: cor, fontWeight: "700" } : undefined}>{valor}</Text>
      </Text>
    </View>
  );
}

export default function AlertaEmergenciaModal({ alerta, aoFechar }: Props) {
  if (!alerta) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={aoFechar}
    >
      <View style={styles.fundo}>
        <View style={styles.caixa}>
          {/* Faixa de severidade */}
          <View style={[styles.cabecalho, { backgroundColor: alerta.cor }]}>
            <Text style={styles.cabecalhoIcone}>{alerta.icone}</Text>
            <View style={styles.cabecalhoTextos}>
              <Text style={styles.severidade}>{alerta.rotulo_severidade}</Text>
              <Text style={styles.tipo}>{alerta.tipo.toUpperCase()}</Text>
            </View>
            <TouchableOpacity
              onPress={aoFechar}
              hitSlop={12}
              accessibilityLabel="Fechar alerta"
            >
              <X size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Informacoes vitais */}
          <ScrollView style={styles.corpo} contentContainerStyle={styles.corpoConteudo}>
            <Linha Icone={MapPin} rotulo="Localização" valor={alerta.municipio} />
            <Linha Icone={Navigation} rotulo="Endereço/Região" valor={alerta.endereco} />
            <Linha
              Icone={AlertTriangle}
              rotulo="Nível de Prioridade"
              valor={alerta.prioridade}
              cor={alerta.cor}
            />
            <Linha Icone={Activity} rotulo="Status Atual" valor={alerta.statusatual} />

            <View style={styles.blocoDescricao}>
              <Text style={styles.descricaoTitulo}>DESCRIÇÃO DO OCORRIDO</Text>
              <Text style={styles.descricaoTexto}>{alerta.descricao}</Text>
            </View>

            <Text style={styles.rodapeAviso}>
              Mantenha-se em segurança e siga as orientações da Defesa Civil (199).
            </Text>
          </ScrollView>

          {/* Rodape */}
          <View style={styles.rodape}>
            <Text style={styles.rodapeOrigem}>
              {alerta.origem === "openweather" ? "Detecção automática" : "Prefeitura"}
              {" · "}
              {formatarData(alerta.criado_em)}
            </Text>
            <TouchableOpacity
              style={[styles.botao, { backgroundColor: alerta.cor }]}
              onPress={aoFechar}
            >
              <Text style={styles.botaoTexto}>{alerta.botao}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  caixa: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: "#fff",
    borderRadius: 18,
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  cabecalho: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  cabecalhoIcone: { fontSize: 24, lineHeight: 28 },
  cabecalhoTextos: { flex: 1 },
  severidade: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tipo: { color: "#fff", fontSize: 19, fontWeight: "900", marginTop: 2 },
  corpo: { flexGrow: 0 },
  corpoConteudo: { paddingHorizontal: 18, paddingVertical: 16, gap: 12 },
  linha: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  linhaIcone: { marginTop: 2 },
  linhaTexto: { flex: 1, fontSize: 14, color: "#475569", lineHeight: 20 },
  linhaRotulo: { fontWeight: "700", color: "#0f172a" },
  blocoDescricao: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  descricaoTitulo: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#64748b",
    marginBottom: 6,
  },
  descricaoTexto: { fontSize: 14, color: "#334155", lineHeight: 21 },
  rodapeAviso: { fontSize: 12, fontStyle: "italic", color: "#64748b" },
  rodape: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  rodapeOrigem: { flex: 1, fontSize: 11, color: "#94a3b8" },
  botao: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  botaoTexto: { color: "#fff", fontWeight: "700", fontSize: 14 },
});

/**
 * Card fixo de emergencia na tela inicial.
 *
 * Fica visivel mesmo depois que o usuario fecha o modal, para que o alerta
 * continue a mao enquanto estiver valendo. Tocar no card reabre o modal.
 */

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AlertTriangle, ChevronRight } from "lucide-react-native";

import { alertaAindaVale, type Alerta } from "../services/alertas";

interface Props {
  alerta: Alerta | null;
  aoTocar: () => void;
}

export default function AlertaDestaqueCard({ alerta, aoTocar }: Props) {
  // Some sozinho quando o alerta perde a validade (6h)
  if (!alerta || !alertaAindaVale(alerta)) return null;

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: alerta.cor }]}
      onPress={aoTocar}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalhes do alerta de ${alerta.tipo}`}
    >
      <View style={[styles.selo, { backgroundColor: alerta.cor }]}>
        <AlertTriangle size={18} color="#fff" />
      </View>

      <View style={styles.textos}>
        <Text style={[styles.prioridade, { color: alerta.cor }]}>
          {alerta.prioridade} · {alerta.statusatual}
        </Text>
        <Text style={styles.titulo} numberOfLines={1}>
          {alerta.tipo} em {alerta.municipio}
        </Text>
        <Text style={styles.descricao} numberOfLines={2}>
          {alerta.descricao}
        </Text>
      </View>

      <ChevronRight size={18} color="#94a3b8" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderLeftWidth: 5,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  selo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  textos: { flex: 1 },
  prioridade: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  titulo: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginTop: 1 },
  descricao: { fontSize: 12, color: "#64748b", marginTop: 2, lineHeight: 17 },
});

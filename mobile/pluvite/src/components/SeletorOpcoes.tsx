/**
 * Menu suspenso do app — equivalente ao MenuSuspenso do Feed web: gatilho com o valor atual e
 * uma lista marinho com busca (sem acento) num modal. Use para cidade, tipo, rua etc.
 */

import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, ChevronDown, Search, X } from "lucide-react-native";

import { normalizar } from "../lib/constantes";
import { COR } from "../lib/tema";

export interface OpcaoSeletor {
  valor: string;
  rotulo: string;
}

export const paraOpcoes = (lista: readonly string[]): OpcaoSeletor[] =>
  lista.map((item) => ({ valor: item, rotulo: item }));

/** Mostra no máximo isso de itens filtrados (listas de ruas têm milhares) */
const MAXIMO_ITENS = 200;

export default function SeletorOpcoes({
  titulo,
  opcoes,
  valor,
  aoSelecionar,
  placeholder = "Selecione",
  icone,
  desabilitado,
  comBusca = true,
}: {
  titulo: string;
  opcoes: OpcaoSeletor[];
  valor: string;
  aoSelecionar: (valor: string) => void;
  placeholder?: string;
  icone?: React.ReactNode;
  desabilitado?: boolean;
  comBusca?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  const selecionada = opcoes.find((opcao) => opcao.valor === valor);

  const filtradas = useMemo(() => {
    const termo = normalizar(busca);
    const lista = termo ? opcoes.filter((o) => normalizar(o.rotulo).includes(termo)) : opcoes;
    return lista.slice(0, MAXIMO_ITENS);
  }, [busca, opcoes]);

  const fechar = () => {
    setAberto(false);
    setBusca("");
  };

  return (
    <>
      {/* GATILHO */}
      <TouchableOpacity
        style={[styles.gatilho, desabilitado && { opacity: 0.5 }]}
        onPress={() => setAberto(true)}
        disabled={desabilitado}
        accessibilityRole="button"
        accessibilityLabel={`${titulo}: ${selecionada?.rotulo ?? placeholder}`}
      >
        {icone}
        <Text
          style={[styles.gatilhoTexto, !selecionada && { color: COR.textoApagado }]}
          numberOfLines={1}
        >
          {selecionada?.rotulo ?? placeholder}
        </Text>
        <ChevronDown size={16} color={COR.textoApagado} />
      </TouchableOpacity>

      {/* LISTA */}
      <Modal visible={aberto} transparent animationType="fade" onRequestClose={fechar}>
        <Pressable style={styles.overlay} onPress={fechar}>
          <Pressable style={styles.caixa} onPress={() => {}}>
            <View style={styles.cabecalho}>
              <Text style={styles.titulo}>{titulo}</Text>
              <TouchableOpacity onPress={fechar} accessibilityLabel="Fechar" style={{ padding: 4 }}>
                <X size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {comBusca && (
              <View style={styles.busca}>
                <Search size={15} color="#c7d2fe" />
                <TextInput
                  style={styles.buscaInput}
                  placeholder="Buscar..."
                  placeholderTextColor="#a5b4fc"
                  value={busca}
                  onChangeText={setBusca}
                  autoCorrect={false}
                />
              </View>
            )}

            <FlatList
              data={filtradas}
              keyExtractor={(item) => item.valor || "__vazio"}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              ListEmptyComponent={<Text style={styles.vazio}>Nada encontrado.</Text>}
              renderItem={({ item }) => {
                const ativo = item.valor === valor;
                return (
                  <TouchableOpacity
                    style={[styles.item, ativo && styles.itemAtivo]}
                    onPress={() => {
                      aoSelecionar(item.valor);
                      fechar();
                    }}
                  >
                    <Text style={styles.itemTexto} numberOfLines={2}>
                      {item.rotulo}
                    </Text>
                    {ativo && <Check size={16} color="#ffffff" />}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  gatilho: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: COR.borda,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  gatilhoTexto: { flex: 1, fontSize: 14, color: COR.textoForte, fontWeight: "500" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  caixa: {
    backgroundColor: COR.primaria,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#3d5cc9",
    maxHeight: "80%",
    overflow: "hidden",
  },
  cabecalho: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  titulo: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  busca: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  buscaInput: { flex: 1, color: "#ffffff", fontSize: 14, paddingVertical: 9 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  itemAtivo: { backgroundColor: "rgba(255,255,255,0.15)" },
  itemTexto: { flex: 1, color: "#ffffff", fontSize: 14, fontWeight: "500" },
  vazio: { color: "#c7d2fe", textAlign: "center", padding: 20, fontSize: 13 },
});

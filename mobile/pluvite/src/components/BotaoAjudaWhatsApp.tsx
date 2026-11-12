/**
 * Botão de ajuda do WhatsApp — versão mobile do web/app/components/BotaoAjudaWhatsApp.tsx.
 *
 * Mostra como se inscrever nos alertas pelo chatbot (web/app/python/chatbot) e abre a
 * conversa com o número que envia os alertas, já com "pluvite" escrito. Sempre vermelho
 * (tom de alerta); a variante "destaque" pulsa. Se o município do cidadão estiver em alerta,
 * as instruções mostram um aviso.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { AlertTriangle, ExternalLink, X } from "lucide-react-native";

import { useAlerta } from "../context/AlertaContext";
import { WHATSAPP_ALERTAS } from "../lib/configuracao";
import { COR } from "../lib/tema";
import { alertaAindaVale } from "../services/alertas";

const NUMERO_WHATSAPP = WHATSAPP_ALERTAS.replace(/\D/g, "");
const LINK_WHATSAPP = NUMERO_WHATSAPP
  ? `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent("pluvite")}`
  : "";

const PASSOS = [
  { titulo: "Abra a conversa", texto: 'Toque em "Abrir WhatsApp" abaixo.' },
  { titulo: "Envie PLUVITE", texto: "A palavra já vem escrita. É só enviar a mensagem." },
  { titulo: "Responda com sua cidade", texto: "Digite o nome do município que quer acompanhar." },
  { titulo: "Pronto!", texto: "Você vai receber os alertas de risco da sua cidade por lá." },
];

export function IconeWhatsApp({ tamanho = 20, cor = "#ffffff" }: { tamanho?: number; cor?: string }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill={cor}>
      <Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </Svg>
  );
}

export default function BotaoAjudaWhatsApp({
  variante = "cabecalho",
}: {
  /** "cabecalho" = botão pequeno no cabeçalho; "destaque" = botão grande pulsando */
  variante?: "cabecalho" | "destaque";
}) {
  const { ultimoAlerta, municipioAlertas } = useAlerta();
  const [aberto, setAberto] = useState(false);
  const pulso = useRef(new Animated.Value(0)).current;

  const emAlerta =
    !!ultimoAlerta && ultimoAlerta.prioridade !== "Zona Segura" && alertaAindaVale(ultimoAlerta);
  const destaque = variante === "destaque";

  // ANÉIS PULSANDO (só na variante destaque)
  useEffect(() => {
    if (!destaque) return;
    const animacao = Animated.loop(
      Animated.timing(pulso, { toValue: 1, duration: 2600, useNativeDriver: true }),
    );
    animacao.start();
    return () => animacao.stop();
  }, [destaque, pulso]);

  const handleAbrirWhatsApp = async () => {
    setAberto(false);
    try {
      await Linking.openURL(LINK_WHATSAPP);
    } catch (erro) {
      console.error("Erro ao abrir o WhatsApp:", erro);
      Alert.alert("WhatsApp", "Não foi possível abrir o WhatsApp neste aparelho.");
    }
  };

  const rotulo = emAlerta
    ? `${municipioAlertas} está em alerta — receba os avisos pelo WhatsApp`
    : "Ajuda: receber alertas pelo WhatsApp";

  return (
    <>
      {/* BOTÃO */}
      <TouchableOpacity
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel={rotulo}
        activeOpacity={0.8}
        style={[styles.botao, destaque ? styles.botaoDestaque : styles.botaoCabecalho]}
      >
        {destaque && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.anel,
              {
                opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
              },
            ]}
          />
        )}
        <IconeWhatsApp tamanho={destaque ? 30 : 18} />
        {emAlerta && !destaque && <View style={styles.pontoAlerta} />}
      </TouchableOpacity>

      {/* INSTRUÇÕES */}
      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={styles.overlay} onPress={() => setAberto(false)}>
          <Pressable style={styles.caixa} onPress={() => {}}>
            {/* CABEÇALHO */}
            <View style={styles.cabecalho}>
              <View style={styles.iconeVerde}>
                <IconeWhatsApp tamanho={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.titulo}>Alertas pelo WhatsApp</Text>
                <Text style={styles.subtitulo}>Receba os avisos de risco da sua cidade</Text>
              </View>
              <TouchableOpacity
                onPress={() => setAberto(false)}
                accessibilityLabel="Fechar"
                style={styles.fechar}
              >
                <X size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 4 }}>
              {/* AVISO DE ALERTA ATIVO */}
              {emAlerta && (
                <View style={styles.aviso}>
                  <AlertTriangle size={16} color="#b91c1c" />
                  <Text style={styles.avisoTexto}>
                    <Text style={{ fontWeight: "800" }}>{municipioAlertas} está em alerta. </Text>
                    Inscreva-se para receber as próximas atualizações no celular.
                  </Text>
                </View>
              )}

              {/* PASSO A PASSO */}
              <View style={styles.passos}>
                {PASSOS.map(({ titulo, texto }, indice) => (
                  <View key={titulo} style={styles.passo}>
                    <View style={styles.numero}>
                      <Text style={styles.numeroTexto}>{indice + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.passoTitulo}>{titulo}</Text>
                      <Text style={styles.passoTexto}>{texto}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <Text style={styles.dica}>
                Para trocar de cidade, envie <Text style={styles.negrito}>CIDADE</Text>. Para parar de
                receber, envie <Text style={styles.negrito}>SAIR</Text>. Em emergência, ligue{" "}
                <Text style={styles.negrito}>199</Text> (Defesa Civil) ou{" "}
                <Text style={styles.negrito}>193</Text> (Bombeiros).
              </Text>

              {/* AÇÃO */}
              {LINK_WHATSAPP ? (
                <TouchableOpacity style={styles.acao} onPress={handleAbrirWhatsApp}>
                  <IconeWhatsApp tamanho={18} />
                  <Text style={styles.acaoTexto}>Abrir WhatsApp</Text>
                  <ExternalLink size={14} color="#ffffff" />
                </TouchableOpacity>
              ) : (
                <Text style={styles.semNumero}>O número de alertas ainda não foi configurado.</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  botao: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dc2626",
    borderRadius: 999,
  },
  botaoCabecalho: {
    width: 38,
    height: 38,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  botaoDestaque: {
    width: 60,
    height: 60,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  anel: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "rgba(239,68,68,0.6)",
  },
  pontoAlerta: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#fbbf24",
    borderWidth: 2,
    borderColor: COR.marinho,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 16,
  },
  caixa: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    maxHeight: "90%",
  },
  cabecalho: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COR.marinho,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  iconeVerde: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
  },
  titulo: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
  subtitulo: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  fechar: { padding: 6, borderRadius: 8 },
  aviso: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 18,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
  },
  avisoTexto: { flex: 1, fontSize: 13, color: "#b91c1c", lineHeight: 18 },
  passos: { paddingHorizontal: 18, paddingVertical: 16, gap: 12 },
  passo: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  numero: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  numeroTexto: { fontSize: 13, fontWeight: "700", color: COR.botao },
  passoTitulo: { fontSize: 14, fontWeight: "600", color: COR.texto },
  passoTexto: { fontSize: 13, color: "#475569" },
  dica: {
    marginHorizontal: 18,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COR.fundo,
    fontSize: 12,
    color: COR.textoSuave,
    lineHeight: 17,
  },
  negrito: { fontWeight: "800" },
  acao: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 18,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COR.whatsapp,
  },
  acaoTexto: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  semNumero: {
    margin: 18,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fffbeb",
    color: "#b45309",
    textAlign: "center",
    fontSize: 13,
  },
});

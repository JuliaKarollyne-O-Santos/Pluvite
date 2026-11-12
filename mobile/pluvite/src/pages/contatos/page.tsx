import React, { useCallback, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  AlertTriangle,
  Ambulance,
  Clock,
  Flame,
  HeartHandshake,
  Phone,
  Shield,
  ShieldAlert,
} from "lucide-react-native";

import Cabecalho from "../../components/Cabecalho";
import BotaoAjudaWhatsApp from "../../components/BotaoAjudaWhatsApp";
import { COR, SOMBRA } from "../../lib/tema";
import { supabase } from "../lib/supabase";

const CONTATOS = [
  {
    nome: "Defesa Civil",
    numero: "199",
    cor: "#2563eb",
    descricao: "Emergências relacionadas a desastres naturais",
    Icone: ShieldAlert,
  },
  {
    nome: "Bombeiros",
    numero: "193",
    cor: "#ef4444",
    descricao: "Resgates e situações de perigo imediato",
    Icone: Flame,
  },
  {
    nome: "SAMU",
    numero: "192",
    cor: "#10b981",
    descricao: "Emergências médicas e primeiros socorros",
    Icone: Ambulance,
  },
  {
    nome: "Polícia Militar",
    numero: "190",
    cor: COR.botao,
    descricao: "Ocorrências policiais e segurança pública",
    Icone: Shield,
  },
];

interface ContatoPessoal {
  nome: string;
  telefone: string;
  parentesco: string | null;
}

export default function Contatos() {
  const [contatoPessoal, setContatoPessoal] = useState<ContatoPessoal | null>(null);

  // CONTATO DE EMERGÊNCIA DO PERFIL (recarrega ao voltar para a aba)
  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      (async () => {
        const { data: sessao } = await supabase.auth.getUser();
        if (!sessao.user) return;
        const { data, error } = await supabase
          .from("cidadao")
          .select("contato_emergencia_nome, contato_emergencia_telefone, contato_emergencia_parentesco")
          .eq("auth_id", sessao.user.id)
          .maybeSingle();
        if (error) {
          console.error("Erro ao carregar contato de emergência:", error);
          return;
        }
        if (!ativo) return;
        setContatoPessoal(
          data?.contato_emergencia_telefone
            ? {
                nome: data.contato_emergencia_nome || "Contato de emergência",
                telefone: data.contato_emergencia_telefone,
                parentesco: data.contato_emergencia_parentesco,
              }
            : null,
        );
      })();
      return () => {
        ativo = false;
      };
    }, []),
  );

  const ligar = (numero: string) => {
    Linking.openURL(`tel:${numero.replace(/[^\d+]/g, "")}`).catch((erro) => {
      console.error("Erro ao abrir o discador:", erro);
      Alert.alert("Ligação", "Não foi possível abrir o discador deste aparelho.");
    });
  };

  return (
    <View style={styles.container}>
      <Cabecalho />
      <ScrollView contentContainerStyle={styles.rolagem} showsVerticalScrollIndicator={false}>
        {/* TÍTULO */}
        <Text style={styles.titulo}>Contatos de Emergência</Text>
        <Text style={styles.subtitulo}>Acesso rápido aos principais serviços de emergência</Text>

        {/* AVISO */}
        <View style={styles.aviso}>
          <AlertTriangle size={18} color="#b91c1c" />
          <View style={{ flex: 1 }}>
            <Text style={styles.avisoTitulo}>Em perigo iminente?</Text>
            <Text style={styles.avisoTexto}>Ligue diretamente para os números abaixo.</Text>
          </View>
        </View>

        {/* SERVIÇOS */}
        {CONTATOS.map(({ nome, numero, cor, descricao, Icone }) => (
          <View key={numero} style={[styles.card, SOMBRA]}>
            <View style={styles.cardLinha}>
              <View style={[styles.icone, { backgroundColor: `${cor}1a` }]}>
                <Icone size={22} color={cor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nome}>{nome}</Text>
                <Text style={styles.descricao}>{descricao}</Text>
                <View style={styles.disponivel}>
                  <Clock size={11} color={COR.sucesso} />
                  <Text style={styles.disponivelTexto}>24h • Sempre disponível</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.botaoLigar, { backgroundColor: cor }]}
              onPress={() => ligar(numero)}
              accessibilityLabel={`Ligar para ${nome}, ${numero}`}
            >
              <Phone size={16} color="#ffffff" />
              <Text style={styles.botaoLigarTexto}>Ligar {numero}</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* CONTATO PESSOAL */}
        <Text style={styles.secao}>Seu contato de emergência</Text>
        {contatoPessoal ? (
          <View style={[styles.card, SOMBRA]}>
            <View style={styles.cardLinha}>
              <View style={[styles.icone, { backgroundColor: "rgba(9,31,117,0.08)" }]}>
                <HeartHandshake size={22} color={COR.primaria} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nome}>{contatoPessoal.nome}</Text>
                <Text style={styles.descricao}>
                  {[contatoPessoal.parentesco, contatoPessoal.telefone].filter(Boolean).join(" • ")}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.botaoLigar, { backgroundColor: COR.primaria }]}
              onPress={() => ligar(contatoPessoal.telefone)}
            >
              <Phone size={16} color="#ffffff" />
              <Text style={styles.botaoLigarTexto}>Ligar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.card, styles.vazio]}>
            <Text style={styles.descricao}>
              Cadastre um contato em Perfil → Emergência para ligar com um toque.
            </Text>
          </View>
        )}

        {/* WHATSAPP */}
        <View style={[styles.card, SOMBRA, styles.whatsapp]}>
          <BotaoAjudaWhatsApp variante="destaque" />
          <View style={{ flex: 1 }}>
            <Text style={styles.nome}>Alertas pelo WhatsApp</Text>
            <Text style={styles.descricao}>
              Inscreva-se no chatbot da Pluvite e receba os avisos da sua cidade.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COR.fundoPagina },
  rolagem: { padding: 16, paddingBottom: 40 },
  titulo: { fontSize: 23, fontWeight: "900", color: COR.texto, letterSpacing: -0.4 },
  subtitulo: { fontSize: 13, color: COR.textoSuave, marginTop: 2, marginBottom: 14 },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  avisoTitulo: { fontSize: 14, fontWeight: "800", color: "#b91c1c" },
  avisoTexto: { fontSize: 12.5, color: "#991b1b", marginTop: 1 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COR.borda,
    padding: 16,
    marginBottom: 12,
  },
  cardLinha: { flexDirection: "row", gap: 14, alignItems: "center" },
  icone: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  nome: { fontSize: 15.5, fontWeight: "800", color: COR.textoForte },
  descricao: { fontSize: 12.5, color: COR.textoSuave, marginTop: 2, lineHeight: 17 },
  disponivel: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  disponivelTexto: { fontSize: 11, fontWeight: "700", color: COR.sucesso },
  botaoLigar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 14,
  },
  botaoLigarTexto: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  secao: { fontSize: 15, fontWeight: "800", color: COR.textoForte, marginTop: 8, marginBottom: 10 },
  vazio: { borderStyle: "dashed", backgroundColor: COR.fundo },
  whatsapp: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 },
});

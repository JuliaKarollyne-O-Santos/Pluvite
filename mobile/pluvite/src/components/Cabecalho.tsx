/**
 * Cabeçalho das telas principais — mesmo visual da navbar2 do site:
 * faixa marinho (#091c4b) com logo PLUVITE, botão de ajuda do WhatsApp e avatar do perfil.
 */

import React, { useEffect, useState } from "react";
import { Image, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BotaoAjudaWhatsApp from "./BotaoAjudaWhatsApp";
import { supabase } from "../pages/lib/supabase";
import { COR } from "../lib/tema";

interface DadosAvatar {
  nome: string;
  url: string | null;
}

/** Nome e foto do cidadão logado (recarrega quando a sessão muda). */
function useAvatar() {
  const [avatar, setAvatar] = useState<DadosAvatar>({ nome: "", url: null });

  useEffect(() => {
    let ativo = true;

    async function carregarAvatar(authId: string | null) {
      if (!authId) {
        if (ativo) setAvatar({ nome: "", url: null });
        return;
      }
      const { data, error } = await supabase
        .from("cidadao")
        .select("nome_completo, avatar_url")
        .eq("auth_id", authId)
        .maybeSingle();
      if (error) {
        console.error("Erro ao carregar avatar do cabeçalho:", error);
        return;
      }
      const url = data?.avatar_url && data.avatar_url.startsWith("http") ? data.avatar_url : null;
      if (ativo) setAvatar({ nome: data?.nome_completo ?? "", url });
    }

    supabase.auth.getUser().then(({ data }) => carregarAvatar(data.user?.id ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      // Fora do callback: chamadas ao Supabase dentro dele podem travar o cliente
      setTimeout(() => void carregarAvatar(sessao?.user.id ?? null), 0);
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  return avatar;
}

export default function Cabecalho() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const avatar = useAvatar();

  return (
    <View style={[styles.barra, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={COR.marinho} />
      <View style={styles.conteudo}>
        {/* LOGOTIPO */}
        <View style={styles.logoLinha}>
          <Image source={require("../assets/PluviteIcon.jpg")} style={styles.logo} />
          <Text style={styles.marca}>PLUVITE</Text>
        </View>

        {/* AÇÕES */}
        <View style={styles.acoes}>
          <BotaoAjudaWhatsApp />
          <TouchableOpacity
            onPress={() => navigation.navigate("Perfil" as never)}
            accessibilityLabel="Abrir perfil"
            style={styles.avatar}
          >
            {avatar.url ? (
              <Image source={{ uri: avatar.url }} style={styles.avatarImagem} />
            ) : (
              <Text style={styles.avatarInicial}>
                {avatar.nome ? avatar.nome.charAt(0).toUpperCase() : "P"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    backgroundColor: COR.marinho,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    zIndex: 10,
  },
  conteudo: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  logoLinha: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 12 },
  marca: { color: "#ffffff", fontSize: 19, fontWeight: "700", letterSpacing: -0.3 },
  acoes: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImagem: { width: "100%", height: "100%" },
  avatarInicial: { color: "#ffffff", fontWeight: "800", fontSize: 14 },
});

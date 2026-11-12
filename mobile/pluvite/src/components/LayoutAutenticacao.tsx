/**
 * Peças comuns de Login e Cadastro — mesmo visual das telas (auth) do site:
 * fundo slate-50 com círculos azuis suaves, título "PLATAFORMA PLUVITE" e card branco.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Eye, EyeOff } from "lucide-react-native";

import { COR } from "../lib/tema";
import type { ProvedorSocial } from "../services/auth";

export function LayoutAutenticacao({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.tela}>
      <StatusBar barStyle="dark-content" backgroundColor={COR.fundo} />
      {/* CÍRCULOS DECORATIVOS */}
      <View pointerEvents="none" style={[styles.circulo, { top: -60, left: -70, width: 240, height: 240, opacity: 0.1 }]} />
      <View pointerEvents="none" style={[styles.circulo, { top: 320, left: -140, width: 300, height: 300, opacity: 0.07 }]} />
      <View pointerEvents="none" style={[styles.circulo, { bottom: -80, right: -80, width: 260, height: 260, opacity: 0.06 }]} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.rolagem}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* TÍTULO */}
          <View style={styles.marca}>
            <Text style={styles.plataforma}>PLATAFORMA</Text>
            <View style={styles.marcaLinha}>
              <Image source={require("../assets/PluviteIcon.jpg")} style={styles.logo} />
              <Text style={styles.plataforma}>PLUVITE</Text>
            </View>
            <Text style={styles.descricao}>
              Monitore, previna e gerencie dados pluviais com precisão em tempo real.
            </Text>
          </View>

          {/* CARD */}
          <View style={styles.card}>
            <Text style={styles.titulo}>{titulo}</Text>
            <Text style={styles.subtitulo}>{subtitulo}</Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Campo de texto do formulário; `senha` adiciona o botão de mostrar/ocultar. */
export function CampoAutenticacao({ senha, ...props }: TextInputProps & { senha?: boolean }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <View style={styles.campoCaixa}>
      <TextInput
        placeholderTextColor={COR.textoSuave}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={senha && !visivel}
        style={[styles.campo, senha && { paddingRight: 48 }]}
        {...props}
      />
      {senha && (
        <TouchableOpacity
          style={styles.olho}
          onPress={() => setVisivel((v) => !v)}
          accessibilityLabel={visivel ? "Ocultar senha" : "Mostrar senha"}
        >
          {visivel ? <EyeOff size={18} color={COR.textoApagado} /> : <Eye size={18} color={COR.textoApagado} />}
        </TouchableOpacity>
      )}
    </View>
  );
}

export function BotaoPrincipal({
  texto,
  carregando,
  onPress,
}: {
  texto: string;
  carregando: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.botao, carregando && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={carregando}
    >
      {carregando ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.botaoTexto}>{texto}</Text>}
    </TouchableOpacity>
  );
}

export function BotoesSociais({
  aoEscolher,
  desabilitado,
}: {
  aoEscolher: (provedor: ProvedorSocial) => void;
  desabilitado?: boolean;
}) {
  return (
    <>
      <View style={styles.divisor}>
        <View style={styles.divisorLinha} />
        <Text style={styles.divisorTexto}>OU CONTINUE COM</Text>
        <View style={styles.divisorLinha} />
      </View>

      <TouchableOpacity
        style={[styles.social, { backgroundColor: COR.azul }]}
        onPress={() => aoEscolher("facebook")}
        disabled={desabilitado}
      >
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="#ffffff">
          <Path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </Svg>
        <Text style={[styles.socialTexto, { color: "#ffffff" }]}>Continuar com o Facebook</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.social, styles.socialGoogle]}
        onPress={() => aoEscolher("google")}
        disabled={desabilitado}
      >
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </Svg>
        <Text style={[styles.socialTexto, { color: "#000000" }]}>Continuar com o Google</Text>
      </TouchableOpacity>
    </>
  );
}

export const estilosAutenticacao = StyleSheet.create({
  link: { color: COR.azul, fontWeight: "700" },
  rodape: { textAlign: "center", marginTop: 18, fontSize: 14, color: "#475569" },
});

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: COR.fundo },
  circulo: { position: "absolute", borderRadius: 999, backgroundColor: COR.azul },
  rolagem: { flexGrow: 1, justifyContent: "center", padding: 20, paddingVertical: 32 },
  marca: { alignItems: "center", marginBottom: 22 },
  marcaLinha: { flexDirection: "row", alignItems: "center", gap: 6 },
  plataforma: { fontSize: 32, fontWeight: "900", color: "#000000", letterSpacing: -0.8, lineHeight: 38 },
  logo: { width: 40, height: 40, borderRadius: 12 },
  descricao: {
    fontSize: 13.5,
    color: "#334155",
    fontWeight: "500",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 19,
    maxWidth: 300,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COR.borda,
    padding: 22,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  titulo: { fontSize: 21, fontWeight: "700", color: COR.textoForte },
  subtitulo: { fontSize: 13, color: "#000000", marginTop: 4, marginBottom: 18 },
  campoCaixa: { justifyContent: "center", marginBottom: 12 },
  campo: {
    backgroundColor: COR.fundo,
    borderWidth: 1,
    borderColor: COR.borda,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: "#000000",
  },
  olho: { position: "absolute", right: 14, padding: 4 },
  botao: {
    backgroundColor: COR.botao,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  botaoTexto: { color: "#ffffff", fontSize: 14.5, fontWeight: "700" },
  divisor: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 16 },
  divisorLinha: { flex: 1, height: 1, backgroundColor: COR.borda },
  divisorTexto: { fontSize: 10, fontWeight: "700", color: "#334155", letterSpacing: 1.5 },
  social: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  socialGoogle: { backgroundColor: "#e4e4e7", borderWidth: 1, borderColor: COR.borda },
  socialTexto: { fontSize: 14.5, fontWeight: "600" },
});

import React, { useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { supabase } from "../lib/supabase";
import { RootStackParamList } from "../../../App";
import {
  BotaoPrincipal,
  BotoesSociais,
  CampoAutenticacao,
  LayoutAutenticacao,
  estilosAutenticacao,
} from "../../components/LayoutAutenticacao";
import { entrarComProvedor, type ProvedorSocial } from "../../services/auth";
import { COR } from "../../lib/tema";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function Login({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  // LOGIN COM E-MAIL E SENHA
  const handleLogin = async () => {
    if (!email.trim() || !senha) {
      Alert.alert("Login", "Por favor, preencha todos os campos.");
      return;
    }

    setCarregando(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) {
        console.error("Erro no login:", error);
        Alert.alert(
          "Login",
          error.message.includes("Email not confirmed")
            ? "Confirme seu e-mail pelo link enviado antes de entrar."
            : "E-mail ou senha incorretos!",
        );
        setSenha("");
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
    } catch (erro) {
      console.error("Erro inesperado no login:", erro);
      Alert.alert("Login", "Erro inesperado. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  };

  // LOGIN SOCIAL (abre o navegador; a sessão volta por pluvite://auth no App.tsx)
  const handleSocialLogin = async (provedor: ProvedorSocial) => {
    try {
      await entrarComProvedor(provedor);
    } catch (erro) {
      console.error(`Erro ao autenticar com o ${provedor}:`, erro);
      Alert.alert(
        "Login social",
        `Não foi possível abrir o login do ${provedor === "google" ? "Google" : "Facebook"}. ` +
          (erro instanceof Error ? erro.message : ""),
      );
    }
  };

  // RECUPERAÇÃO DE SENHA
  const handleEsqueciSenha = async () => {
    if (!email.trim()) {
      Alert.alert("Recuperar senha", "Digite o seu e-mail no campo acima primeiro.");
      return;
    }
    setCarregando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      Alert.alert("Recuperar senha", "E-mail de recuperação enviado! Verifique sua caixa de entrada ou spam.");
    } catch (erro) {
      console.error("Erro ao enviar recuperação de senha:", erro);
      Alert.alert("Recuperar senha", `Erro ao enviar e-mail: ${erro instanceof Error ? erro.message : erro}`);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <LayoutAutenticacao
      titulo="Bem-vindo de volta!"
      subtitulo="Insira suas credenciais para acessar a plataforma"
    >
      <CampoAutenticacao
        placeholder="E-mail institucional ou pessoal"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!carregando}
      />
      <CampoAutenticacao
        placeholder="Sua senha"
        senha
        value={senha}
        onChangeText={setSenha}
        editable={!carregando}
        onSubmitEditing={handleLogin}
      />

      <View style={{ alignItems: "flex-start", marginBottom: 12, marginTop: -2 }}>
        <TouchableOpacity onPress={handleEsqueciSenha} disabled={carregando}>
          <Text style={{ fontSize: 12.5, color: COR.azul, fontWeight: "600" }}>Esqueci minha senha</Text>
        </TouchableOpacity>
      </View>

      <BotaoPrincipal texto="Entrar" carregando={carregando} onPress={handleLogin} />

      <BotoesSociais aoEscolher={handleSocialLogin} desabilitado={carregando} />

      <TouchableOpacity onPress={() => navigation.navigate("Cadastro")}>
        <Text style={estilosAutenticacao.rodape}>
          Não tem uma conta? <Text style={estilosAutenticacao.link}>Cadastre-se</Text>
        </Text>
      </TouchableOpacity>
    </LayoutAutenticacao>
  );
}

import React, { useState } from "react";
import { Alert, Text, TouchableOpacity } from "react-native";
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

type Props = NativeStackScreenProps<RootStackParamList, "Cadastro">;

export default function Cadastro({ navigation }: Props) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  const handleCadastro = async () => {
    if (!nome.trim() || !email.trim() || !senha || !confirmarSenha) {
      Alert.alert("Cadastro", "Por favor, preencha todos os campos.");
      return;
    }
    if (senha.length < 6) {
      Alert.alert("Cadastro", "A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmarSenha) {
      Alert.alert("Cadastro", "As senhas não coincidem!");
      return;
    }

    setCarregando(true);
    try {
      // O nome vai nos metadados: o trigger handle_new_user() cria a linha em "cidadao"
      // (migration 20260924120000_cidadao_automatico.sql), igual ao cadastro do site.
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { nome_completo: nome.trim() } },
      });

      if (error) {
        console.error("Erro ao criar conta:", error);
        Alert.alert("Cadastro", "Erro ao criar conta: " + error.message);
        return;
      }

      // Garantia para bancos sem o trigger: só funciona com sessão ativa (RLS)
      if (data.session && data.user) {
        const { error: erroPerfil } = await supabase
          .from("cidadao")
          .upsert(
            { auth_id: data.user.id, nome_completo: nome.trim(), email: email.trim() },
            { onConflict: "auth_id" },
          );
        if (erroPerfil) console.error("Erro ao garantir a linha do cidadão:", erroPerfil);
        // Com sessão, o App.tsx já leva para as abas (evento SIGNED_IN)
        Alert.alert("Cadastro", "Conta criada com sucesso! Complete seu perfil para receber alertas.");
        return;
      }

      Alert.alert(
        "Confirme seu e-mail",
        "Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, entre com sua senha.",
        [{ text: "OK", onPress: () => navigation.navigate("Login") }],
      );
    } catch (erro) {
      console.error("Erro inesperado no cadastro:", erro);
      Alert.alert("Cadastro", "Ocorreu um erro no servidor. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  };

  const handleSocialCadastro = async (provedor: ProvedorSocial) => {
    try {
      await entrarComProvedor(provedor);
    } catch (erro) {
      console.error(`Erro ao cadastrar com o ${provedor}:`, erro);
      Alert.alert("Cadastro social", erro instanceof Error ? erro.message : "Tente novamente.");
    }
  };

  return (
    <LayoutAutenticacao
      titulo="Crie sua conta"
      subtitulo="Cadastre-se para receber alertas e reportar ocorrências"
    >
      <CampoAutenticacao
        placeholder="Nome completo"
        autoCapitalize="words"
        value={nome}
        onChangeText={setNome}
        editable={!carregando}
      />
      <CampoAutenticacao
        placeholder="E-mail institucional ou pessoal"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!carregando}
      />
      <CampoAutenticacao
        placeholder="Criar uma senha"
        senha
        value={senha}
        onChangeText={setSenha}
        editable={!carregando}
      />
      <CampoAutenticacao
        placeholder="Confirmar senha"
        senha
        value={confirmarSenha}
        onChangeText={setConfirmarSenha}
        editable={!carregando}
        onSubmitEditing={handleCadastro}
      />

      <BotaoPrincipal texto="Cadastrar" carregando={carregando} onPress={handleCadastro} />

      <BotoesSociais aoEscolher={handleSocialCadastro} desabilitado={carregando} />

      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={estilosAutenticacao.rodape}>
          Já possui uma conta? <Text style={estilosAutenticacao.link}>Entre</Text>
        </Text>
      </TouchableOpacity>
    </LayoutAutenticacao>
  );
}

import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../App";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import {
  User,
  MapPin,
  HeartPulse,
  Bell,
  Shield,
  Accessibility,
  LogOut,
  Pencil,
  X,
  Save,
  Phone,
} from "lucide-react-native";

type Props = NativeStackScreenProps<RootStackParamList, any>;

type Secao = "dados" | "emergencia" | "notificacoes" | "seguranca" | "acessibilidade";
type Bloco = "pessoais" | "endereco" | "medico" | "contatoEmergencia" | null;

const TIPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function Perfil({ navigation }: Props) {
  const [carregando, setCarregando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [editandoBloco, setEditandoBloco] = useState<Bloco>(null);
  const [secaoAtiva, setSecaoAtiva] = useState<Secao>("dados");

  const [perfil, setPerfil] = useState({
    nome_completo: "",
    email: "",
    telefone: "",
    data_nascimento: "",
    cidade: "",
    bairro: "",
    cep: "",
    pcd: false,
    tipo_deficiencia: "Nenhuma",
    avatar_url: "",
    tipo_sanguineo: "",
    alergias: "",
    condicoes_medicas: "",
    medicamentos_uso: "",
    contato_emergencia_nome: "",
    contato_emergencia_telefone: "",
    contato_emergencia_parentesco: "",
  });

  // CARREGAMENTO DOS DADOS DO USUÁRIO DO SUPABASE
  useEffect(() => {
    let ativo = true;

    async function carregarPerfil(authUser: any) {
      try {
        const nomeDoCadastro =
          authUser.user_metadata?.nome_completo ||
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          "Usuário";

        const emailDoCadastro = authUser.email || "";

        if (ativo) {
          setPerfil((prev) => ({
            ...prev,
            email: emailDoCadastro,
            nome_completo: nomeDoCadastro,
          }));
        }

        const { data, error } = await supabase
          .from("cidadao")
          .select("*")
          .eq("auth_id", authUser.id)
          .maybeSingle();

        if (error) {
          console.error("Erro ao buscar perfil:", error);
          return;
        }

        if (data && ativo) {
          setPerfil((prev) => ({
            ...prev,
            nome_completo: data.nome_completo || nomeDoCadastro,
            telefone: data.telefone || "",
            data_nascimento: data.data_nascimento || "",
            cidade: data.cidade || "",
            bairro: data.bairro || "",
            cep: data.cep || "",
            pcd: data.pcd ?? false,
            avatar_url: data.avatar_url || "",
            tipo_deficiencia: data.tipo_deficiencia || "Nenhuma",
            tipo_sanguineo: data.tipo_sanguineo || "",
            alergias: data.alergias || "",
            condicoes_medicas: data.condicoes_medicas || "",
            medicamentos_uso: data.medicamentos_uso || "",
            contato_emergencia_nome: data.contato_emergencia_nome || "",
            contato_emergencia_telefone: data.contato_emergencia_telefone || "",
            contato_emergencia_parentesco: data.contato_emergencia_parentesco || "",
          }));
        }
      } catch (err) {
        console.error("Erro ao carregar dados do perfil:", err);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) carregarPerfil(session.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) carregarPerfil(session.user);
      },
    );

    return () => {
      ativo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleChange = (name: string, value: string) => {
    setPerfil((prev) => ({ ...prev, [name]: value }));
  };

  // TROCA DE FOTO DE PERFIL (galeria + upload pro Supabase Storage)
  const handleTrocarFoto = async () => {
    try {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert("Permissão necessária", "Precisamos acessar suas fotos para trocar o avatar.");
        return;
      }

      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (resultado.canceled || !resultado.assets?.[0]) return;

      const asset = resultado.assets[0];
      setEnviandoFoto(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const base64 =
        asset.base64 ??
        (await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));

      const fileExt = asset.uri.split(".").pop()?.split("?")[0] || "jpg";
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, decode(base64), {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);

      const { error: upsertError } = await supabase.from("cidadao").upsert(
        {
          auth_id: user.id,
          email: user.email,
          avatar_url: publicUrl,
          nome_completo: perfil.nome_completo || "Usuário",
        },
        { onConflict: "auth_id" },
      );

      if (upsertError) throw upsertError;

      setPerfil((prev) => ({ ...prev, avatar_url: publicUrl }));
    } catch (error: any) {
      console.error("Erro ao salvar a foto:", error);
      Alert.alert("Erro", "Não foi possível enviar a imagem: " + error.message);
    } finally {
      setEnviandoFoto(false);
    }
  };

  // ENVIO DOS DADOS ATUALIZADOS PARA O BANCO DE DADOS
  const salvarDados = async (bloco: Bloco) => {
    setCarregando(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const dadosParaSalvar = {
        auth_id: user.id,
        email: user.email,
        nome_completo: perfil.nome_completo || null,
        telefone: perfil.telefone || null,
        data_nascimento: perfil.data_nascimento || null,
        cidade: perfil.cidade || null,
        bairro: perfil.bairro || null,
        cep: perfil.cep || null,
        pcd: perfil.pcd,
        tipo_deficiencia: perfil.pcd ? perfil.tipo_deficiencia || "Nenhuma" : "Nenhuma",
        tipo_sanguineo: perfil.tipo_sanguineo || null,
        alergias: perfil.alergias || null,
        condicoes_medicas: perfil.condicoes_medicas || null,
        medicamentos_uso: perfil.medicamentos_uso || null,
        contato_emergencia_nome: perfil.contato_emergencia_nome || null,
        contato_emergencia_telefone: perfil.contato_emergencia_telefone || null,
        contato_emergencia_parentesco: perfil.contato_emergencia_parentesco || null,
      };

      const { error } = await supabase
        .from("cidadao")
        .upsert(dadosParaSalvar, { onConflict: "auth_id" });

      if (error) throw error;

      setEditandoBloco(null);
    } catch (err: any) {
      console.error("Erro ao salvar dados no Supabase:", err);
      Alert.alert("Erro", "Erro ao salvar: " + err.message);
    } finally {
      setCarregando(false);
    }
  };

  const handleLogout = async () => {
    setSaindo(true);
    try {
      await supabase.auth.signOut();
      navigation.reset({
        index: 0,
        routes: [{ name: "Login" }],
      });
    } catch (error: any) {
      Alert.alert("Erro", "Erro ao sair da conta: " + error.message);
    } finally {
      setSaindo(false);
    }
  };

  const itensSecao: { id: Secao; label: string; icon: React.ReactNode }[] = [
    { id: "dados", label: "Meus Dados", icon: <User size={16} color={secaoAtiva === "dados" ? "#1447c4" : "#94a3b8"} /> },
    { id: "emergencia", label: "Emergência", icon: <HeartPulse size={16} color={secaoAtiva === "emergencia" ? "#1447c4" : "#94a3b8"} /> },
    { id: "notificacoes", label: "Notificações", icon: <Bell size={16} color={secaoAtiva === "notificacoes" ? "#1447c4" : "#94a3b8"} /> },
    { id: "seguranca", label: "Segurança", icon: <Shield size={16} color={secaoAtiva === "seguranca" ? "#1447c4" : "#94a3b8"} /> },
    { id: "acessibilidade", label: "Acessibilidade", icon: <Accessibility size={16} color={secaoAtiva === "acessibilidade" ? "#1447c4" : "#94a3b8"} /> },
  ];

  // CABEÇALHO REUTILIZÁVEL DE CADA CARD (título + editar/salvar/cancelar)
  const CardHeader = ({ icon, title, bloco }: { icon: React.ReactNode; title: string; bloco: Bloco }) => (
    <View style={styles.cardHeaderRow}>
      <View style={styles.cardHeaderLeft}>
        <View style={styles.iconBadge}>{icon}</View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {editandoBloco === bloco ? (
          <>
            <TouchableOpacity style={styles.iconButton} onPress={() => setEditandoBloco(null)}>
              <X size={16} color="#94a3b8" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: "#ecfdf5" }]}
              onPress={() => salvarDados(bloco)}
              disabled={carregando}
            >
              {carregando ? (
                <ActivityIndicator size="small" color="#059669" />
              ) : (
                <Save size={16} color="#059669" />
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.iconButton} onPress={() => setEditandoBloco(bloco)}>
            <Pencil size={15} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // CAMPO DE TEXTO REUTILIZÁVEL (visualização ou edição)
  const Campo = ({
    label,
    name,
    value,
    editando,
    placeholder,
    multiline,
    keyboardType,
  }: {
    label: string;
    name: string;
    value: string;
    editando: boolean;
    placeholder?: string;
    multiline?: boolean;
    keyboardType?: "default" | "phone-pad";
  }) => (
    <View style={styles.campoBox}>
      <Text style={styles.campoLabel}>{label}</Text>
      {editando ? (
        <TextInput
          style={[styles.campoInput, multiline && { height: 60, textAlignVertical: "top" }]}
          value={value}
          onChangeText={(t) => handleChange(name, t)}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          multiline={multiline}
          keyboardType={keyboardType || "default"}
        />
      ) : (
        <Text style={styles.campoValor}>{value || "Não informado"}</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.headerTitle}>Meu Perfil</Text>

        {/* CARD DO AVATAR */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              {perfil.avatar_url ? (
                <Image source={{ uri: perfil.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInicial}>
                  {perfil.nome_completo ? perfil.nome_completo.charAt(0).toUpperCase() : "P"}
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.editAvatarButton} onPress={handleTrocarFoto} disabled={enviandoFoto}>
              {enviandoFoto ? (
                <ActivityIndicator size="small" color="#1447c4" />
              ) : (
                <Pencil size={12} color="#1447c4" />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.avatarNome}>{perfil.nome_completo || "Usuário"}</Text>
          <Text style={styles.avatarEmail}>{perfil.email}</Text>
          <View style={styles.cidadeBadge}>
            <Text style={styles.cidadeBadgeText}>Taubaté</Text>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={saindo}>
            {saindo ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <LogOut size={14} color="#ef4444" />
            )}
            <Text style={styles.logoutButtonText}>{saindo ? "Saindo..." : "Sair da conta"}</Text>
          </TouchableOpacity>
        </View>

        {/* ABAS DE SEÇÃO */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
        >
          {itensSecao.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.tabChip, secaoAtiva === item.id && styles.tabChipAtivo]}
              onPress={() => setSecaoAtiva(item.id)}
            >
              {item.icon}
              <Text style={[styles.tabChipText, secaoAtiva === item.id && styles.tabChipTextAtivo]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* SEÇÃO: MEUS DADOS */}
        {secaoAtiva === "dados" && (
          <>
            <View style={styles.card}>
              <CardHeader icon={<User size={14} color="#1447c4" />} title="Informações Pessoais" bloco="pessoais" />
              <Campo label="Nome Completo" name="nome_completo" value={perfil.nome_completo} editando={editandoBloco === "pessoais"} />
              <Campo
                label="Telefone / Celular"
                name="telefone"
                value={perfil.telefone}
                editando={editandoBloco === "pessoais"}
                placeholder="(00) 00000-0000"
                keyboardType="phone-pad"
              />
              <Campo
                label="Data de Nascimento"
                name="data_nascimento"
                value={perfil.data_nascimento}
                editando={editandoBloco === "pessoais"}
                placeholder="AAAA-MM-DD"
              />
              <View style={[styles.campoBox, { opacity: 0.6 }]}>
                <Text style={styles.campoLabel}>E-mail (Não alterável)</Text>
                <Text style={styles.campoValor}>{perfil.email}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <CardHeader icon={<MapPin size={14} color="#1447c4" />} title="Endereço" bloco="endereco" />
              <Campo label="Cidade" name="cidade" value={perfil.cidade} editando={editandoBloco === "endereco"} />
              <Campo label="Bairro" name="bairro" value={perfil.bairro} editando={editandoBloco === "endereco"} />
              <Campo label="CEP" name="cep" value={perfil.cep} editando={editandoBloco === "endereco"} keyboardType="phone-pad" />
            </View>
          </>
        )}

        {/* SEÇÃO: DADOS DE EMERGÊNCIA */}
        {secaoAtiva === "emergencia" && (
          <>
            <View style={styles.avisoBox}>
              <HeartPulse size={16} color="#d97706" style={{ marginTop: 1 }} />
              <Text style={styles.avisoTexto}>
                Essas informações ficam guardadas no seu perfil e só são usadas em caso de necessidade de resgate durante uma emergência. Mantenha sempre atualizadas.
              </Text>
            </View>

            <View style={styles.card}>
              <CardHeader icon={<HeartPulse size={14} color="#1447c4" />} title="Informações Médicas" bloco="medico" />

              <View style={styles.campoBox}>
                <Text style={styles.campoLabel}>Tipo Sanguíneo</Text>
                {editandoBloco === "medico" ? (
                  <View style={styles.chipsRow}>
                    {TIPOS_SANGUINEOS.map((tipo) => (
                      <TouchableOpacity
                        key={tipo}
                        style={[styles.tipoSanguineoChip, perfil.tipo_sanguineo === tipo && styles.tipoSanguineoChipAtivo]}
                        onPress={() => handleChange("tipo_sanguineo", perfil.tipo_sanguineo === tipo ? "" : tipo)}
                      >
                        <Text
                          style={[
                            styles.tipoSanguineoChipText,
                            perfil.tipo_sanguineo === tipo && styles.tipoSanguineoChipTextAtivo,
                          ]}
                        >
                          {tipo}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.campoValor}>{perfil.tipo_sanguineo || "Não informado"}</Text>
                )}
              </View>

              <Campo
                label="Alergias"
                name="alergias"
                value={perfil.alergias}
                editando={editandoBloco === "medico"}
                placeholder="Ex: alergia a dipirona, látex..."
                multiline
              />
              <Campo
                label="Condições Médicas"
                name="condicoes_medicas"
                value={perfil.condicoes_medicas}
                editando={editandoBloco === "medico"}
                placeholder="Ex: diabetes, hipertensão, epilepsia..."
                multiline
              />
              <Campo
                label="Medicamentos de Uso Contínuo"
                name="medicamentos_uso"
                value={perfil.medicamentos_uso}
                editando={editandoBloco === "medico"}
                placeholder="Ex: losartana 50mg, insulina..."
                multiline
              />
            </View>

            <View style={styles.card}>
              <CardHeader icon={<Phone size={14} color="#1447c4" />} title="Contato de Emergência" bloco="contatoEmergencia" />
              <Campo
                label="Nome"
                name="contato_emergencia_nome"
                value={perfil.contato_emergencia_nome}
                editando={editandoBloco === "contatoEmergencia"}
              />
              <Campo
                label="Telefone"
                name="contato_emergencia_telefone"
                value={perfil.contato_emergencia_telefone}
                editando={editandoBloco === "contatoEmergencia"}
                placeholder="(00) 00000-0000"
                keyboardType="phone-pad"
              />
              <Campo
                label="Parentesco / Relação"
                name="contato_emergencia_parentesco"
                value={perfil.contato_emergencia_parentesco}
                editando={editandoBloco === "contatoEmergencia"}
                placeholder="Ex: mãe, cônjuge, amigo..."
              />
            </View>
          </>
        )}

        {/* SEÇÃO: NOTIFICAÇÕES */}
        {secaoAtiva === "notificacoes" && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.iconBadge}>
                  <Bell size={14} color="#1447c4" />
                </View>
                <Text style={styles.cardTitle}>Preferências de Notificações</Text>
              </View>
            </View>

            {["Alertas de chuva forte", "Alertas de risco de deslizamento", "Notificações por e-mail", "Notificações push"].map(
              (label) => (
                <View key={label} style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>{label}</Text>
                  <Switch
                    value={true}
                    trackColor={{ false: "#e2e8f0", true: "#0d1b54" }}
                    thumbColor="#ffffff"
                  />
                </View>
              ),
            )}
            <Text style={styles.notaTexto}>
              Essas preferências ainda não estão conectadas ao banco de dados — só a interface está pronta.
            </Text>
          </View>
        )}

        {/* SEÇÃO: SEGURANÇA */}
        {secaoAtiva === "seguranca" && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.iconBadge}>
                  <Shield size={14} color="#1447c4" />
                </View>
                <Text style={styles.cardTitle}>Segurança da Conta</Text>
              </View>
            </View>

            <View style={styles.campoBox}>
              <Text style={styles.campoLabel}>Senha</Text>
              <TouchableOpacity onPress={() => Alert.alert("Em breve", "Troca de senha ainda não implementada.")}>
                <Text style={styles.linkAzul}>Alterar senha</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.campoBox}>
              <Text style={styles.campoLabel}>Sessões ativas</Text>
              <Text style={styles.campoValor}>Este dispositivo está conectado</Text>
            </View>

            <Text style={styles.notaTexto}>
              Ainda sem lógica de troca de senha implementada — me avise se quiser que eu conecte com o Supabase Auth.
            </Text>
          </View>
        )}

        {/* SEÇÃO: ACESSIBILIDADE */}
        {secaoAtiva === "acessibilidade" && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.iconBadge}>
                  <Accessibility size={14} color="#1447c4" />
                </View>
                <Text style={styles.cardTitle}>Acessibilidade</Text>
              </View>
            </View>

            <View style={styles.campoBox}>
              <Text style={styles.campoLabel}>Condição PCD</Text>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() =>
                  setPerfil((prev) => ({
                    ...prev,
                    pcd: !prev.pcd,
                    tipo_deficiencia: !prev.pcd ? "" : "Nenhuma",
                  }))
                }
              >
                <View style={[styles.checkbox, perfil.pcd && styles.checkboxAtivo]} />
                <Text style={styles.checkboxLabel}>Possuo Deficiência</Text>
              </TouchableOpacity>

              {perfil.pcd && (
                <TextInput
                  style={[styles.campoInput, { marginTop: 10 }]}
                  placeholder="Qual deficiência?"
                  placeholderTextColor="#94a3b8"
                  value={perfil.tipo_deficiencia}
                  onChangeText={(t) => handleChange("tipo_deficiencia", t)}
                />
              )}
            </View>

            <TouchableOpacity style={styles.salvarLink} onPress={() => salvarDados("endereco")} disabled={carregando}>
              {carregando ? <ActivityIndicator size="small" color="#1447c4" /> : <Save size={14} color="#1447c4" />}
              <Text style={styles.linkAzul}>Salvar</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  scrollContent: { padding: 16, paddingBottom: 40 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#1e293b", marginBottom: 16 },

  avatarCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  avatarWrapper: { position: "relative", marginBottom: 12 },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarInicial: { fontSize: 34, fontWeight: "900", color: "#1447c4" },
  editAvatarButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#ffffff",
    padding: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  avatarNome: { fontSize: 17, fontWeight: "800", color: "#1e293b" },
  avatarEmail: { fontSize: 12, color: "#94a3b8", marginTop: 2, marginBottom: 10 },
  cidadeBadge: {
    backgroundColor: "#eff6ff",
    borderColor: "#dbeafe",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 16,
  },
  cidadeBadgeText: { fontSize: 11, fontWeight: "700", color: "#1447c4" },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    borderColor: "#fee2e2",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    width: "100%",
  },
  logoutButtonText: { fontSize: 12, fontWeight: "700", color: "#ef4444" },

  tabsScroll: { marginBottom: 16 },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabChipAtivo: { backgroundColor: "#eff6ff", borderColor: "#dbeafe" },
  tabChipText: { fontSize: 12, fontWeight: "700", color: "#94a3b8" },
  tabChipTextAtivo: { color: "#1447c4" },

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
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 13, fontWeight: "800", color: "#1e293b" },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },

  campoBox: { backgroundColor: "#f8fafc", borderRadius: 12, borderWidth: 1, borderColor: "#f1f5f9", padding: 10, marginBottom: 10 },
  campoLabel: { fontSize: 10, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 },
  campoValor: { fontSize: 13, fontWeight: "600", color: "#334155" },
  campoInput: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  avisoBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  avisoTexto: { flex: 1, fontSize: 11.5, color: "#92400e", lineHeight: 17 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  tipoSanguineoChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  tipoSanguineoChipAtivo: { backgroundColor: "#0d1b54", borderColor: "#0d1b54" },
  tipoSanguineoChipText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  tipoSanguineoChipTextAtivo: { color: "#ffffff" },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 12,
    marginBottom: 8,
  },
  toggleLabel: { fontSize: 12.5, fontWeight: "600", color: "#334155", flex: 1, marginRight: 10 },
  notaTexto: { fontSize: 11, color: "#94a3b8", marginTop: 6, lineHeight: 16 },

  linkAzul: { fontSize: 12.5, fontWeight: "700", color: "#1447c4" },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: "#cbd5e1" },
  checkboxAtivo: { backgroundColor: "#0d1b54", borderColor: "#0d1b54" },
  checkboxLabel: { fontSize: 12.5, fontWeight: "600", color: "#334155" },
  salvarLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
});
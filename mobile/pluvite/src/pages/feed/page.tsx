/**
 * FEED DE OCORRÊNCIAS — versão mobile do /Feed do site, ligada ao Supabase.
 *
 * Lista, filtra (cidade, categoria, busca), publica com foto e local (GPS opcional),
 * curte, comenta e compartilha. Atualiza sozinho via Supabase Realtime.
 * IMPORTANTE: autor_id / usuario_id referenciam cidadao.id (não auth.users.id).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { launchCamera, launchImageLibrary, type Asset } from "react-native-image-picker";
import { decode } from "base64-arraybuffer";
import {
  Camera,
  CheckCircle,
  Eye,
  Filter,
  ImagePlus,
  LocateFixed,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Send,
  Share2,
  ThumbsUp,
  TrendingUp,
  Users,
  AlertTriangle,
  Wrench,
  X,
} from "lucide-react-native";

import Cabecalho from "../../components/Cabecalho";
import SeletorOpcoes, { paraOpcoes } from "../../components/SeletorOpcoes";
import {
  MUNICIPIOS,
  normalizar,
  TIPOS_OCORRENCIA,
  type StatusOcorrencia,
  type TipoOcorrencia,
} from "../../lib/constantes";
import { formatarDistancia, type Coordenada } from "../../lib/geo";
import { obterPosicaoAtual } from "../../lib/localizacao";
import { COR, SOMBRA, STATUS_ESTILO } from "../../lib/tema";
import { supabase } from "../lib/supabase";

// LINHAS DO SUPABASE
interface OcorrenciaLinha {
  id: string;
  autor_id: string;
  tipo: TipoOcorrencia;
  cidade: string;
  bairro: string | null;
  endereco: string | null;
  descricao: string | null;
  imagem_url: string | null;
  status: StatusOcorrencia;
  criado_em: string;
  cidadao: { nome_completo: string | null; avatar_url: string | null } | null;
}

interface CurtidaLinha {
  ocorrencia_id: string;
  usuario_id: string;
}

interface ComentarioLinha {
  id: string;
  ocorrencia_id: string;
  texto: string;
  cidadao: { nome_completo: string | null } | null;
}

interface Comentario {
  id: string;
  autor: string;
  texto: string;
}

interface Ocorrencia {
  id: string;
  autorId: string;
  autor: string;
  autorAvatarUrl: string | null;
  iniciais: string;
  endereco: string;
  bairro: string;
  cidade: string;
  tipo: TipoOcorrencia;
  criadoEm: string;
  status: StatusOcorrencia;
  descricao: string;
  imagemUrl: string | null;
  curtido: boolean;
  curtidas: number;
  comentarios: Comentario[];
}

const CATEGORIAS = ["Todas", ...TIPOS_OCORRENCIA] as const;

const gerarIniciais = (nome: string) =>
  nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** "há 15 minutos", "há 2 horas"... a partir de criado_em */
const tempoRelativo = (dataIso: string) => {
  const minutos = Math.floor((Date.now() - new Date(dataIso).getTime()) / 60000);
  if (minutos < 1) return "Agora mesmo";
  if (minutos < 60) return `há ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
};

export default function Feed() {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [carregandoFeed, setCarregandoFeed] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  // FILTROS
  const [busca, setBusca] = useState("");
  const [cidade, setCidade] = useState("");
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>("Todas");

  // USUÁRIO LOGADO (id da tabela cidadao)
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [usuarioNome, setUsuarioNome] = useState("Você");

  // MODAIS
  const [publicacaoAberta, setPublicacaoAberta] = useState(false);
  const [comentariosDe, setComentariosDe] = useState<string | null>(null);

  // ───── USUÁRIO LOGADO ─────
  const carregarUsuario = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setUsuarioId(null);
      return null;
    }
    const { data: linha, error } = await supabase
      .from("cidadao")
      .select("id, nome_completo")
      .eq("auth_id", data.user.id)
      .maybeSingle();
    if (error) {
      console.error("Erro ao carregar o cidadão logado:", error);
      return null;
    }
    if (!linha) {
      console.warn(`Sem linha em "cidadao" para o auth_id ${data.user.id}.`);
      setUsuarioId(null);
      return null;
    }
    setUsuarioId(linha.id);
    setUsuarioNome(linha.nome_completo || "Você");
    return linha.id as string;
  }, []);

  // ───── CARREGAR FEED ─────
  const carregarFeed = useCallback(async () => {
    const idUsuario = await carregarUsuario();

    const [resOcorrencias, resCurtidas, resComentarios] = await Promise.all([
      supabase
        .from("ocorrencias")
        .select("*, cidadao!ocorrencias_autor_id_fkey(nome_completo, avatar_url)")
        .order("criado_em", { ascending: false }),
      supabase.from("curtidas").select("ocorrencia_id, usuario_id"),
      supabase
        .from("comentarios")
        .select("id, ocorrencia_id, texto, cidadao(nome_completo)")
        .order("criado_em", { ascending: true }),
    ]);

    if (resOcorrencias.error) {
      console.error("Erro ao carregar feed:", resOcorrencias.error);
      Alert.alert("Feed", "Não foi possível carregar as ocorrências. Verifique sua internet.");
      setCarregandoFeed(false);
      return;
    }
    if (resCurtidas.error) console.error("Erro ao carregar curtidas:", resCurtidas.error);
    if (resComentarios.error) console.error("Erro ao carregar comentários:", resComentarios.error);

    const curtidas = (resCurtidas.data ?? []) as CurtidaLinha[];
    const comentarios = (resComentarios.data ?? []) as unknown as ComentarioLinha[];

    const montadas = ((resOcorrencias.data ?? []) as unknown as OcorrenciaLinha[]).map((linha) => {
      const curtidasDela = curtidas.filter((c) => c.ocorrencia_id === linha.id);
      const nomeAutor = linha.cidadao?.nome_completo || "Cidadão";
      const avatar = linha.cidadao?.avatar_url;
      return {
        id: linha.id,
        autorId: linha.autor_id,
        autor: nomeAutor,
        autorAvatarUrl: avatar && avatar.startsWith("http") ? avatar : null,
        iniciais: gerarIniciais(nomeAutor),
        endereco: linha.endereco ?? "",
        bairro: linha.bairro ?? "",
        cidade: linha.cidade,
        tipo: linha.tipo,
        criadoEm: linha.criado_em,
        status: linha.status,
        descricao: linha.descricao ?? "",
        imagemUrl: linha.imagem_url,
        curtido: idUsuario ? curtidasDela.some((c) => c.usuario_id === idUsuario) : false,
        curtidas: curtidasDela.length,
        comentarios: comentarios
          .filter((c) => c.ocorrencia_id === linha.id)
          .map((c) => ({ id: c.id, autor: c.cidadao?.nome_completo || "Cidadão", texto: c.texto })),
      } satisfies Ocorrencia;
    });

    setOcorrencias(montadas);
    setCarregandoFeed(false);
  }, [carregarUsuario]);

  useEffect(() => {
    void carregarFeed();

    // TEMPO REAL: nova publicação ou mudança de status pela prefeitura
    const canal = supabase
      .channel("feed-mobile")
      .on("postgres_changes", { event: "*", schema: "public", table: "ocorrencias" }, () => {
        void carregarFeed();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [carregarFeed]);

  const handleAtualizar = async () => {
    setAtualizando(true);
    await carregarFeed();
    setAtualizando(false);
  };

  // ───── FILTROS ─────
  const filtradas = useMemo(() => {
    const termo = normalizar(busca);
    return ocorrencias.filter((oc) => {
      if (cidade && oc.cidade !== cidade) return false;
      if (categoriaAtiva !== "Todas" && oc.tipo !== categoriaAtiva) return false;
      if (termo) {
        const texto = normalizar(`${oc.bairro} ${oc.endereco} ${oc.cidade} ${oc.tipo} ${oc.descricao}`);
        if (!texto.includes(termo)) return false;
      }
      return true;
    });
  }, [ocorrencias, busca, cidade, categoriaAtiva]);

  const contagem = {
    aguardando: filtradas.filter((o) => o.status === "Aguardando").length,
    andamento: filtradas.filter((o) => o.status === "Em Andamento").length,
    visualizado: filtradas.filter((o) => o.status === "Visualizado").length,
  };

  const bairrosRanking = Object.entries(
    ocorrencias
      .filter((o) => (!cidade || o.cidade === cidade) && o.bairro)
      .reduce<Record<string, number>>((acc, o) => {
        acc[o.bairro] = (acc[o.bairro] || 0) + 1;
        return acc;
      }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const estatisticas = {
    total: ocorrencias.length,
    concluidas: ocorrencias.filter((o) => o.status === "Concluído").length,
    cidadaosAtivos: new Set(ocorrencias.map((o) => o.autorId)).size,
  };

  const exigirCadastro = (acao: string) => {
    if (usuarioId) return true;
    Alert.alert("Perfil incompleto", `Entre na sua conta e salve seu perfil antes de ${acao}.`);
    return false;
  };

  // ───── CURTIR ─────
  const handleCurtir = async (id: string) => {
    if (!exigirCadastro("curtir")) return;
    const ocorrencia = ocorrencias.find((oc) => oc.id === id);
    if (!ocorrencia) return;
    const vaiCurtir = !ocorrencia.curtido;

    // Atualização otimista
    setOcorrencias((prev) =>
      prev.map((oc) =>
        oc.id === id
          ? { ...oc, curtido: vaiCurtir, curtidas: oc.curtidas + (vaiCurtir ? 1 : -1) }
          : oc,
      ),
    );

    const { error } = vaiCurtir
      ? await supabase.from("curtidas").insert({ ocorrencia_id: id, usuario_id: usuarioId })
      : await supabase
          .from("curtidas")
          .delete()
          .eq("ocorrencia_id", id)
          .eq("usuario_id", usuarioId);
    if (error) {
      console.error("Erro ao curtir:", error);
      void carregarFeed();
    }
  };

  // ───── COMPARTILHAR ─────
  const handleCompartilhar = async (oc: Ocorrencia) => {
    try {
      await Share.share({
        message:
          `${oc.tipo} em ${oc.bairro ? `${oc.bairro}, ` : ""}${oc.cidade} — ${oc.endereco}\n` +
          `${oc.descricao ? `${oc.descricao}\n` : ""}Status: ${oc.status} — via Pluvite`,
      });
    } catch (erro) {
      console.error("Erro ao compartilhar:", erro);
    }
  };

  // ───── COMENTAR ─────
  const handleEnviarComentario = async (id: string, texto: string) => {
    if (!exigirCadastro("comentar")) return false;
    const limpo = texto.trim();
    if (!limpo) return false;

    setOcorrencias((prev) =>
      prev.map((oc) =>
        oc.id === id
          ? {
              ...oc,
              comentarios: [...oc.comentarios, { id: `temp-${Date.now()}`, autor: usuarioNome, texto: limpo }],
            }
          : oc,
      ),
    );

    const { error } = await supabase
      .from("comentarios")
      .insert({ ocorrencia_id: id, autor_id: usuarioId, texto: limpo });
    if (error) {
      console.error("Erro ao comentar:", error);
      Alert.alert("Comentários", "Não foi possível enviar o comentário.");
      void carregarFeed();
      return false;
    }
    return true;
  };

  const ocorrenciaComentarios = ocorrencias.find((o) => o.id === comentariosDe) ?? null;

  // ───── CABEÇALHO DA LISTA ─────
  const cabecalhoLista = (
    <View>
      {/* BANNER */}
      <View style={styles.banner}>
        <View style={styles.bannerCirculo} />
        <Text style={styles.bannerTitulo}>Feed de Ocorrências</Text>
        <Text style={styles.bannerTexto}>
          Acompanhe e reporte problemas urbanos em tempo real na sua região.
        </Text>
        <View style={styles.bannerNumeros}>
          <View style={styles.bannerNumero}>
            <Text style={styles.bannerValor}>{estatisticas.total}</Text>
            <Text style={styles.bannerRotulo}>Relatos</Text>
          </View>
          <View style={styles.bannerNumero}>
            <Text style={styles.bannerValor}>{estatisticas.concluidas}</Text>
            <Text style={styles.bannerRotulo}>Resolvidos</Text>
          </View>
          <View style={styles.bannerNumero}>
            <Text style={styles.bannerValor}>{estatisticas.cidadaosAtivos}</Text>
            <Text style={styles.bannerRotulo}>Cidadãos</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.botaoPublicar}
          onPress={() => exigirCadastro("publicar uma ocorrência") && setPublicacaoAberta(true)}
        >
          <Plus size={18} color={COR.primaria} />
          <Text style={styles.botaoPublicarTexto}>Publicar Ocorrência</Text>
        </TouchableOpacity>
      </View>

      {/* CARDS DE STATUS */}
      <View style={styles.statusLinha}>
        {[
          { rotulo: "Aguardando", valor: contagem.aguardando, cor: "#dc2626", bg: "#fef2f2", Icone: AlertTriangle },
          { rotulo: "Em Andamento", valor: contagem.andamento, cor: "#d97706", bg: "#fffbeb", Icone: Wrench },
          { rotulo: "Visualizados", valor: contagem.visualizado, cor: "#059669", bg: "#ecfdf5", Icone: Eye },
        ].map(({ rotulo, valor, cor, bg, Icone }) => (
          <View key={rotulo} style={[styles.statusCard, SOMBRA]}>
            <View style={[styles.statusIcone, { backgroundColor: bg }]}>
              <Icone size={17} color={cor} />
            </View>
            <Text style={styles.statusValor}>{valor}</Text>
            <Text style={[styles.statusRotulo, { color: cor }]}>{rotulo}</Text>
          </View>
        ))}
      </View>

      {/* FILTROS */}
      <View style={[styles.card, SOMBRA]}>
        <View style={styles.busca}>
          <Search size={16} color={COR.textoApagado} />
          <TextInput
            style={styles.buscaInput}
            placeholder="Buscar por bairro, rua ou descrição..."
            placeholderTextColor={COR.textoApagado}
            value={busca}
            onChangeText={setBusca}
          />
          {busca !== "" && (
            <TouchableOpacity onPress={() => setBusca("")} accessibilityLabel="Limpar busca">
              <X size={15} color={COR.textoApagado} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.rotuloLinha}>
          <MapPin size={13} color={COR.textoApagado} />
          <Text style={styles.rotulo}>Cidade</Text>
        </View>
        <SeletorOpcoes
          titulo="Filtrar por cidade"
          opcoes={[{ valor: "", rotulo: "Todas as cidades" }, ...paraOpcoes(MUNICIPIOS)]}
          valor={cidade}
          aoSelecionar={setCidade}
        />

        <View style={[styles.rotuloLinha, { marginTop: 12 }]}>
          <Filter size={13} color={COR.textoApagado} />
          <Text style={styles.rotulo}>Categoria</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CATEGORIAS.map((cat) => {
            const ativo = categoriaAtiva === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, ativo && styles.chipAtivo]}
                onPress={() => setCategoriaAtiva(cat)}
              >
                <Text style={[styles.chipTexto, ativo && { color: "#ffffff" }]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* BAIRROS COM MAIS RELATOS */}
      {bairrosRanking.length > 0 && (
        <View style={[styles.card, SOMBRA]}>
          <View style={styles.cardTituloLinha}>
            <View style={styles.iconeTile}>
              <TrendingUp size={15} color={COR.primaria} />
            </View>
            <Text style={styles.cardTitulo}>Bairros com mais relatos</Text>
          </View>
          {bairrosRanking.map(([bairro, total]) => (
            <View key={bairro} style={styles.bairroLinha}>
              <Text style={styles.bairroNome}>{bairro}</Text>
              <View style={styles.bairroBadge}>
                <Text style={styles.bairroBadgeTexto}>
                  {total} {total === 1 ? "relato" : "relatos"}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.secaoTitulo}>
        {filtradas.length === ocorrencias.length
          ? "Ocorrências recentes"
          : `${filtradas.length} de ${ocorrencias.length} ocorrências`}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Cabecalho />

      {carregandoFeed ? (
        <View style={styles.carregando}>
          <ActivityIndicator size="large" color={COR.azul} />
          <Text style={styles.carregandoTexto}>Carregando ocorrências...</Text>
        </View>
      ) : (
        <FlatList
          data={filtradas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.lista}
          ListHeaderComponent={cabecalhoLista}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={handleAtualizar} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={[styles.vazio, SOMBRA]}>
              <Users size={28} color={COR.textoApagado} />
              <Text style={styles.vazioTitulo}>Nenhuma ocorrência encontrada</Text>
              <Text style={styles.vazioTexto}>Ajuste os filtros ou publique o primeiro relato.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <CartaoOcorrencia
              oc={item}
              aoCurtir={() => handleCurtir(item.id)}
              aoComentar={() => setComentariosDe(item.id)}
              aoCompartilhar={() => handleCompartilhar(item)}
            />
          )}
        />
      )}

      <ModalPublicacao
        aberto={publicacaoAberta}
        usuarioId={usuarioId}
        cidadeSugerida={cidade}
        aoFechar={() => setPublicacaoAberta(false)}
        aoPublicar={() => {
          setPublicacaoAberta(false);
          setBusca("");
          setCategoriaAtiva("Todas");
          setCidade("");
          void carregarFeed();
        }}
      />

      <ModalComentarios
        ocorrencia={ocorrenciaComentarios}
        aoFechar={() => setComentariosDe(null)}
        aoEnviar={handleEnviarComentario}
      />
    </View>
  );
}

// ───── CARTÃO DA OCORRÊNCIA ─────
function CartaoOcorrencia({
  oc,
  aoCurtir,
  aoComentar,
  aoCompartilhar,
}: {
  oc: Ocorrencia;
  aoCurtir: () => void;
  aoComentar: () => void;
  aoCompartilhar: () => void;
}) {
  const estilo = STATUS_ESTILO[oc.status] ?? STATUS_ESTILO.Aguardando;
  const IconeStatus = estilo.icone;

  return (
    <View style={[styles.post, SOMBRA]}>
      {/* AUTOR */}
      <View style={styles.postCabecalho}>
        <View style={styles.avatar}>
          {oc.autorAvatarUrl ? (
            <Image source={{ uri: oc.autorAvatarUrl }} style={styles.avatarImagem} />
          ) : (
            <Text style={styles.avatarIniciais}>{oc.iniciais}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.postAutor}>{oc.autor}</Text>
          <View style={styles.enderecoLinha}>
            <MapPin size={11} color={COR.textoApagado} />
            <Text style={styles.enderecoTexto} numberOfLines={1}>
              {[oc.endereco, oc.bairro, oc.cidade].filter(Boolean).join(" • ")}
            </Text>
          </View>
        </View>
      </View>

      {/* TIPO, TEMPO E STATUS */}
      <View style={styles.postMeta}>
        <View style={styles.tipoBadge}>
          <Text style={styles.tipoTexto}>{oc.tipo}</Text>
        </View>
        <Text style={styles.tempoTexto}>{tempoRelativo(oc.criadoEm)}</Text>
        <View style={{ flex: 1 }} />
        <View style={[styles.statusBadge, { backgroundColor: estilo.bg, borderColor: estilo.borda }]}>
          <IconeStatus size={11} color={estilo.texto} />
          <Text style={[styles.statusBadgeTexto, { color: estilo.texto }]}>{oc.status}</Text>
        </View>
      </View>

      {oc.descricao !== "" && <Text style={styles.descricao}>{oc.descricao}</Text>}

      {oc.imagemUrl && (
        <Image source={{ uri: oc.imagemUrl }} style={styles.postImagem} resizeMode="cover" />
      )}

      {/* INTERAÇÕES */}
      <View style={styles.interacoes}>
        <TouchableOpacity
          style={styles.interacao}
          onPress={aoCurtir}
          accessibilityLabel={oc.curtido ? "Remover curtida" : "Curtir"}
        >
          <ThumbsUp
            size={16}
            color={oc.curtido ? COR.azul : COR.textoSuave}
            fill={oc.curtido ? COR.azul : "transparent"}
          />
          <Text style={[styles.interacaoTexto, oc.curtido && { color: COR.azul }]}>{oc.curtidas}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.interacao} onPress={aoComentar} accessibilityLabel="Comentários">
          <MessageSquare size={16} color={COR.textoSuave} />
          <Text style={styles.interacaoTexto}>{oc.comentarios.length}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.interacao} onPress={aoCompartilhar} accessibilityLabel="Compartilhar">
          <Share2 size={16} color={COR.textoSuave} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ───── MODAL DE COMENTÁRIOS ─────
function ModalComentarios({
  ocorrencia,
  aoFechar,
  aoEnviar,
}: {
  ocorrencia: Ocorrencia | null;
  aoFechar: () => void;
  aoEnviar: (id: string, texto: string) => Promise<boolean>;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleEnviar = async () => {
    if (!ocorrencia) return;
    setEnviando(true);
    const enviado = await aoEnviar(ocorrencia.id, texto);
    setEnviando(false);
    if (enviado) setTexto("");
  };

  return (
    <Modal visible={!!ocorrencia} transparent animationType="slide" onRequestClose={aoFechar}>
      <KeyboardAvoidingView
        style={styles.folhaFundo}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={{ flex: 1 }} onPress={aoFechar} />
        <View style={styles.folha}>
          <View style={styles.folhaCabecalho}>
            <Text style={styles.folhaTitulo}>Comentários</Text>
            <TouchableOpacity onPress={aoFechar} accessibilityLabel="Fechar">
              <X size={20} color={COR.textoSuave} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={ocorrencia?.comentarios ?? []}
            keyExtractor={(c) => c.id}
            style={{ maxHeight: 360 }}
            ListEmptyComponent={<Text style={styles.vazioTexto}>Seja o primeiro a comentar.</Text>}
            renderItem={({ item }) => (
              <View style={styles.comentario}>
                <Text style={styles.comentarioAutor}>{item.autor}</Text>
                <Text style={styles.comentarioTexto}>{item.texto}</Text>
              </View>
            )}
          />
          <View style={styles.comentarioEntrada}>
            <TextInput
              style={styles.comentarioInput}
              placeholder="Escreva um comentário..."
              placeholderTextColor={COR.textoApagado}
              value={texto}
              onChangeText={setTexto}
              editable={!enviando}
              multiline
            />
            <TouchableOpacity
              style={[styles.botaoEnviar, (!texto.trim() || enviando) && { opacity: 0.5 }]}
              onPress={handleEnviar}
              disabled={!texto.trim() || enviando}
              accessibilityLabel="Enviar comentário"
            >
              {enviando ? <ActivityIndicator size="small" color="#ffffff" /> : <Send size={16} color="#ffffff" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ───── MODAL DE NOVA PUBLICAÇÃO ─────
function ModalPublicacao({
  aberto,
  usuarioId,
  cidadeSugerida,
  aoFechar,
  aoPublicar,
}: {
  aberto: boolean;
  usuarioId: string | null;
  cidadeSugerida: string;
  aoFechar: () => void;
  aoPublicar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoOcorrencia | "">("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [descricao, setDescricao] = useState("");
  const [imagem, setImagem] = useState<Asset | null>(null);
  const [local, setLocal] = useState<{ coordenada: Coordenada; precisao: number } | null>(null);
  const [buscandoLocal, setBuscandoLocal] = useState(false);
  const [publicando, setPublicando] = useState(false);

  useEffect(() => {
    if (aberto) setCidade(cidadeSugerida);
  }, [aberto, cidadeSugerida]);

  const limpar = () => {
    setTipo("");
    setCidade("");
    setBairro("");
    setEndereco("");
    setDescricao("");
    setImagem(null);
    setLocal(null);
  };

  const handleFechar = () => {
    limpar();
    aoFechar();
  };

  const etapas = [tipo !== "", cidade !== "" && endereco.trim() !== "", descricao.trim() !== "" || !!imagem];
  const valido = etapas.every(Boolean);

  const handleEscolherImagem = async (origem: "camera" | "galeria") => {
    const opcoes = { mediaType: "photo" as const, quality: 0.7 as const, includeBase64: true, maxWidth: 1600, maxHeight: 1600 };
    const resultado = origem === "camera" ? await launchCamera(opcoes) : await launchImageLibrary(opcoes);
    if (resultado.didCancel) return;
    if (resultado.errorCode) {
      console.error("Erro ao escolher imagem:", resultado.errorMessage);
      Alert.alert("Foto", resultado.errorMessage || "Não foi possível abrir a câmera/galeria.");
      return;
    }
    if (resultado.assets?.[0]) setImagem(resultado.assets[0]);
  };

  const handleUsarLocalizacao = async () => {
    setBuscandoLocal(true);
    try {
      const posicao = await obterPosicaoAtual();
      setLocal({ coordenada: posicao.coordenada, precisao: posicao.precisao });
    } catch (erro) {
      Alert.alert("Localização", erro instanceof Error ? erro.message : "GPS indisponível.");
    } finally {
      setBuscandoLocal(false);
    }
  };

  const handlePublicar = async () => {
    if (!usuarioId || !valido || !tipo) return;
    setPublicando(true);
    try {
      let imagemUrl: string | null = null;

      if (imagem?.base64) {
        const extensao = imagem.fileName?.split(".").pop()?.toLowerCase() || "jpg";
        const caminho = `${usuarioId}/${Date.now()}-${imagem.fileName || `foto.${extensao}`}`;
        const { error: erroUpload } = await supabase.storage
          .from("ocorrencias")
          .upload(caminho, decode(imagem.base64), { contentType: imagem.type || "image/jpeg" });
        if (erroUpload) {
          console.error("Erro ao enviar imagem:", erroUpload);
          Alert.alert("Foto", `Não foi possível enviar a foto: ${erroUpload.message}`);
          return;
        }
        imagemUrl = supabase.storage.from("ocorrencias").getPublicUrl(caminho).data.publicUrl;
      }

      const linha: Record<string, string | number | null> = {
        autor_id: usuarioId,
        tipo,
        cidade,
        bairro: bairro.trim(),
        endereco: endereco.trim(),
        descricao: descricao.trim() || null,
        imagem_url: imagemUrl,
        status: "Aguardando",
      };

      // Com GPS, publica o ponto exato (a rota desvia só do trecho). Sem a migration
      // 20260923120000 aplicada, as colunas não existem: publica sem o ponto.
      let { error } = await supabase
        .from("ocorrencias")
        .insert(local ? { ...linha, latitude: local.coordenada[0], longitude: local.coordenada[1] } : linha);
      if (error && local && /latitude|longitude/i.test(error.message)) {
        console.warn("Colunas latitude/longitude ausentes; publicando sem o ponto exato.");
        ({ error } = await supabase.from("ocorrencias").insert(linha));
      }
      if (error) {
        console.error("Erro ao inserir ocorrência:", error);
        Alert.alert("Publicação", `Não foi possível publicar a ocorrência: ${error.message}`);
        return;
      }

      limpar();
      aoPublicar();
    } finally {
      setPublicando(false);
    }
  };

  return (
    <Modal visible={aberto} transparent animationType="slide" onRequestClose={handleFechar}>
      <KeyboardAvoidingView
        style={styles.folhaFundo}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.folha, { maxHeight: "92%" }]}>
          <View style={styles.folhaCabecalho}>
            <View>
              <Text style={styles.folhaTitulo}>Nova ocorrência</Text>
              <Text style={styles.folhaSubtitulo}>{etapas.filter(Boolean).length} de 3 etapas concluídas</Text>
            </View>
            <TouchableOpacity onPress={handleFechar} accessibilityLabel="Fechar">
              <X size={20} color={COR.textoSuave} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* 1. TIPO */}
            <Text style={styles.rotuloForm}>1. Tipo de ocorrência</Text>
            <SeletorOpcoes
              titulo="Tipo de ocorrência"
              opcoes={paraOpcoes(TIPOS_OCORRENCIA)}
              valor={tipo}
              aoSelecionar={(v) => setTipo(v as TipoOcorrencia)}
              comBusca={false}
              desabilitado={publicando}
            />

            {/* 2. LOCAL */}
            <Text style={styles.rotuloForm}>2. Local</Text>
            <SeletorOpcoes
              titulo="Cidade"
              opcoes={paraOpcoes(MUNICIPIOS)}
              valor={cidade}
              aoSelecionar={setCidade}
              placeholder="Cidade"
              desabilitado={publicando}
            />
            <TextInput
              style={[styles.campo, { marginTop: 8 }]}
              placeholder="Rua e número (ex.: Av. Independência, 500)"
              placeholderTextColor={COR.textoApagado}
              value={endereco}
              onChangeText={setEndereco}
              editable={!publicando}
            />
            <TextInput
              style={[styles.campo, { marginTop: 8 }]}
              placeholder="Bairro"
              placeholderTextColor={COR.textoApagado}
              value={bairro}
              onChangeText={setBairro}
              editable={!publicando}
            />
            <TouchableOpacity
              style={[styles.botaoLocal, local && styles.botaoLocalAtivo]}
              onPress={handleUsarLocalizacao}
              disabled={buscandoLocal || publicando}
            >
              {buscandoLocal ? (
                <ActivityIndicator size="small" color={COR.azul} />
              ) : local ? (
                <CheckCircle size={16} color={COR.sucesso} />
              ) : (
                <LocateFixed size={16} color={COR.azul} />
              )}
              <Text style={[styles.botaoLocalTexto, local && { color: COR.sucesso }]}>
                {local
                  ? `Localização marcada (precisão ${formatarDistancia(local.precisao)})`
                  : "Usar minha localização exata (melhora as rotas)"}
              </Text>
            </TouchableOpacity>

            {/* 3. CONTEÚDO */}
            <Text style={styles.rotuloForm}>3. Descrição ou foto</Text>
            <TextInput
              style={[styles.campo, { height: 90, textAlignVertical: "top" }]}
              placeholder="Descreva o que está acontecendo..."
              placeholderTextColor={COR.textoApagado}
              value={descricao}
              onChangeText={setDescricao}
              multiline
              editable={!publicando}
            />

            {imagem?.uri ? (
              <View style={{ marginTop: 10 }}>
                <Image source={{ uri: imagem.uri }} style={styles.previa} />
                <TouchableOpacity
                  style={styles.removerFoto}
                  onPress={() => setImagem(null)}
                  accessibilityLabel="Remover foto"
                >
                  <X size={16} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.fotoLinha}>
                <TouchableOpacity style={styles.botaoFoto} onPress={() => handleEscolherImagem("camera")}>
                  <Camera size={18} color={COR.azul} />
                  <Text style={styles.botaoFotoTexto}>Câmera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.botaoFoto} onPress={() => handleEscolherImagem("galeria")}>
                  <ImagePlus size={18} color={COR.azul} />
                  <Text style={styles.botaoFotoTexto}>Galeria</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.botaoPrimario, (!valido || publicando) && { opacity: 0.5 }]}
              onPress={handlePublicar}
              disabled={!valido || publicando}
            >
              {publicando ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.botaoPrimarioTexto}>Publicar</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COR.fundoPagina },
  lista: { padding: 16, paddingBottom: 40 },
  carregando: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  carregandoTexto: { fontSize: 13, color: COR.textoSuave, fontWeight: "500" },

  banner: {
    backgroundColor: COR.primaria,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    overflow: "hidden",
  },
  bannerCirculo: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  bannerTitulo: { color: "#ffffff", fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },
  bannerTexto: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 4, lineHeight: 18 },
  bannerNumeros: { flexDirection: "row", gap: 10, marginTop: 16 },
  bannerNumero: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  bannerValor: { color: "#ffffff", fontSize: 18, fontWeight: "900" },
  bannerRotulo: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  botaoPublicar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  botaoPublicarTexto: { color: COR.primaria, fontSize: 14, fontWeight: "800" },

  statusLinha: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statusCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COR.borda,
    padding: 12,
  },
  statusIcone: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statusValor: { fontSize: 20, fontWeight: "900", color: COR.textoForte },
  statusRotulo: { fontSize: 9.5, fontWeight: "800", textTransform: "uppercase", marginTop: 2 },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COR.borda,
    padding: 16,
    marginBottom: 16,
  },
  cardTituloLinha: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  cardTitulo: { fontSize: 14, fontWeight: "800", color: COR.textoForte },
  iconeTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(9,31,117,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  busca: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COR.fundo,
    borderWidth: 1,
    borderColor: COR.borda,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  buscaInput: { flex: 1, fontSize: 13.5, color: COR.textoMedio, paddingVertical: 10 },
  rotuloLinha: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  rotulo: { fontSize: 10.5, fontWeight: "800", color: COR.textoSuave, textTransform: "uppercase", letterSpacing: 0.5 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COR.fundo,
    borderWidth: 1,
    borderColor: COR.borda,
  },
  chipAtivo: { backgroundColor: COR.primaria, borderColor: COR.primaria },
  chipTexto: { fontSize: 12, fontWeight: "700", color: COR.textoSuave },

  bairroLinha: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COR.fundo,
    borderWidth: 1,
    borderColor: COR.bordaSuave,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  bairroNome: { fontSize: 13, fontWeight: "700", color: COR.textoMedio },
  bairroBadge: { backgroundColor: "rgba(15,53,160,0.1)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  bairroBadgeTexto: { fontSize: 11, fontWeight: "800", color: COR.azul },

  secaoTitulo: { fontSize: 16, fontWeight: "800", color: COR.textoForte, marginBottom: 12 },

  vazio: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COR.borda,
    padding: 30,
    alignItems: "center",
    gap: 8,
  },
  vazioTitulo: { fontSize: 15, fontWeight: "800", color: COR.textoForte },
  vazioTexto: { fontSize: 13, color: COR.textoSuave, textAlign: "center", paddingVertical: 8 },

  post: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COR.borda,
    marginBottom: 16,
    overflow: "hidden",
  },
  postCabecalho: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, paddingBottom: 8 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COR.primaria,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImagem: { width: "100%", height: "100%" },
  avatarIniciais: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  postAutor: { fontSize: 14, fontWeight: "800", color: COR.textoForte },
  enderecoLinha: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  enderecoTexto: { fontSize: 11.5, color: COR.textoSuave, flexShrink: 1 },
  postMeta: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  tipoBadge: { backgroundColor: "rgba(9,31,117,0.08)", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  tipoTexto: { fontSize: 11, fontWeight: "800", color: COR.primaria },
  tempoTexto: { fontSize: 11, color: COR.textoApagado, fontWeight: "600" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeTexto: { fontSize: 11, fontWeight: "700" },
  descricao: { fontSize: 13.5, color: COR.textoMedio, lineHeight: 19, paddingHorizontal: 14, paddingBottom: 12 },
  postImagem: { width: "100%", height: 220, backgroundColor: COR.bordaSuave },
  interacoes: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COR.fundo,
    borderTopWidth: 1,
    borderTopColor: COR.bordaSuave,
  },
  interacao: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  interacaoTexto: { fontSize: 12.5, fontWeight: "700", color: COR.textoSuave },

  folhaFundo: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  folha: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 26,
  },
  folhaCabecalho: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  folhaTitulo: { fontSize: 18, fontWeight: "900", color: COR.textoForte },
  folhaSubtitulo: { fontSize: 12, color: COR.textoSuave, marginTop: 2 },
  comentario: { backgroundColor: COR.fundo, borderRadius: 12, padding: 10, marginBottom: 8 },
  comentarioAutor: { fontSize: 12.5, fontWeight: "800", color: COR.textoForte },
  comentarioTexto: { fontSize: 13, color: COR.textoMedio, marginTop: 2 },
  comentarioEntrada: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 10 },
  comentarioInput: {
    flex: 1,
    backgroundColor: COR.fundo,
    borderWidth: 1,
    borderColor: COR.borda,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: COR.texto,
    maxHeight: 100,
  },
  botaoEnviar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COR.botao,
    alignItems: "center",
    justifyContent: "center",
  },

  rotuloForm: { fontSize: 12, fontWeight: "800", color: COR.textoMedio, marginTop: 14, marginBottom: 8 },
  campo: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: COR.borda,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: COR.textoForte,
  },
  botaoLocal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },
  botaoLocalAtivo: { borderColor: "#a7f3d0", backgroundColor: "#ecfdf5", borderStyle: "solid" },
  botaoLocalTexto: { flex: 1, fontSize: 12.5, fontWeight: "700", color: COR.azul },
  fotoLinha: { flexDirection: "row", gap: 10, marginTop: 10 },
  botaoFoto: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COR.borda,
    backgroundColor: COR.fundo,
  },
  botaoFotoTexto: { fontSize: 13, fontWeight: "700", color: COR.azul },
  previa: { width: "100%", height: 190, borderRadius: 14, backgroundColor: COR.bordaSuave },
  removerFoto: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(15,23,42,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  botaoPrimario: {
    backgroundColor: COR.botao,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  botaoPrimarioTexto: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
});

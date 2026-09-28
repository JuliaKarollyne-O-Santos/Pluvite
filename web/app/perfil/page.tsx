"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/banco";
import {
  User,
  Accessibility,
  MapPin,
  Save,
  Loader2,
  Pencil,
  X,
  LogOut,
  Bell,
  Shield,
  HeartPulse,
  Phone,
  Image as ImageIcon,
  MessageSquare,
  ThumbsUp,
  Send,
  AlertTriangle,
  Wrench,
  Eye,
  CheckCircle,
  Trash2,
  Check,
  MoreVertical,
  Share2,
  Link as LinkIcon,
} from "lucide-react";

// Tipos de ocorrência — mesma lista usada no Feed, pro formulário de edição
const TIPOS_OCORRENCIA = [
  "Alagamento",
  "Árvore caída",
  "Buraco na via",
  "Deslizamento de terra",
  "Via interditada",
  "Outros",
] as const;

// Os 39 municípios do Vale do Paraíba e Litoral Norte — mesma lista do Feed
const CIDADES = [
  "Aparecida",
  "Arapeí",
  "Areias",
  "Bananal",
  "Caçapava",
  "Cachoeira Paulista",
  "Campos do Jordão",
  "Canas",
  "Caraguatatuba",
  "Cruzeiro",
  "Cunha",
  "Guaratinguetá",
  "Igaratá",
  "Ilhabela",
  "Jacareí",
  "Jambeiro",
  "Lagoinha",
  "Lavrinhas",
  "Lorena",
  "Monteiro Lobato",
  "Natividade da Serra",
  "Paraibuna",
  "Pindamonhangaba",
  "Piquete",
  "Potim",
  "Queluz",
  "Redenção da Serra",
  "Roseira",
  "Santa Branca",
  "Santo Antônio do Pinhal",
  "São Bento do Sapucaí",
  "São José do Barreiro",
  "São José dos Campos",
  "São Luiz do Paraitinga",
  "São Sebastião",
  "Silveiras",
  "Taubaté",
  "Tremembé",
  "Ubatuba",
] as const;

type Secao = "dados" | "emergencia" | "notificacoes" | "seguranca" | "acessibilidade" | "publicacoes";
type Bloco = "pessoais" | "endereco" | "medico" | "contatoEmergencia" | null;

/* ═══════════════════════════════════════════════════════════════════════
   MINHAS PUBLICAÇÕES — dados e tipos das ocorrências que o próprio
   cidadão reportou no feed. Por enquanto são dados de exemplo; quando
   houver uma tabela real de ocorrências no Supabase, troque
   MINHAS_PUBLICACOES_INICIAIS por uma busca filtrando por auth_id.
   ═══════════════════════════════════════════════════════════════════════ */

interface ComentarioPublicacao {
  id: string;
  autor: string;
  texto: string;
}

type StatusPublicacao = "Aguardando" | "Em Andamento" | "Visualizado" | "Concluído";

interface Publicacao {
  id: string;
  tipo: string;
  cidade: string;
  bairro: string;
  endereco: string;
  criadoEm: string;
  tempo: string;
  status: StatusPublicacao;
  descricao: string;
  imagemUrl: string | null;
  curtido: boolean;
  curtidas: number;
  comentarios: ComentarioPublicacao[];
}

// Calcula um texto relativo ("há 15 minutos", "há 2 horas"...) a partir do
// timestamp `criado_em` que vem do Supabase — mesma lógica usada no Feed
const tempoRelativo = (dataIso: string) => {
  const diffMs = Date.now() - new Date(dataIso).getTime();
  const minutos = Math.floor(diffMs / 60000);
  if (minutos < 1) return "Agora mesmo";
  if (minutos < 60)
    return `há ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
};

const STATUS_ESTILO_PUB: Record<StatusPublicacao, { badge: string; icon: any; texto: string }> = {
  Aguardando: { badge: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle, texto: "Aguardando" },
  "Em Andamento": { badge: "bg-amber-50 text-amber-800 border-amber-200", icon: Wrench, texto: "Em Andamento" },
  Visualizado: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Eye, texto: "Visualizado" },
  Concluído: { badge: "bg-slate-100 text-slate-600 border-slate-200", icon: CheckCircle, texto: "Concluído" },
};

// Lista inicial vazia — as publicações reais vêm do Supabase (ver carregarMinhasPublicacoes)
const MINHAS_PUBLICACOES_INICIAIS: Publicacao[] = [];

export default function PerfilCidadao() {
  /* NAVEGACAO E ROTEAMENTO */
  const router = useRouter();

  /* ESTADOS DE CARREGAMENTO E MODO DE EDICAO */
  const [carregando, setCarregando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [editandoBloco, setEditandoBloco] = useState<Bloco>(null);
  const [secaoAtiva, setSecaoAtiva] = useState<Secao>("dados");
  const [hoverItem, setHoverItem] = useState<Secao | null>(null);

  /* ESTADO COM DADOS DO PERFIL DO CIDADÃO */
  const [perfil, setPerfil] = useState({
    nome_completo: "",
    email: "",
    telefone: "",
    data_nascimento: "",
    cidade: "",
    bairro: "",
    cep: "",
    pcd: false,
    tipo_deficiencia: "",
    avatar_url: "/perfil.png",
    tipo_sanguineo: "",
    alergias: "",
    condicoes_medicas: "",
    medicamentos_uso: "",
    contato_emergencia_nome: "",
    contato_emergencia_telefone: "",
    contato_emergencia_parentesco: "",
    notif_chuva_forte: true,
    notif_deslizamento: true,
    notif_email: true,
    notif_push: true,
  });

  /* ESTADO DAS PUBLICAÇÕES DO PRÓPRIO CIDADÃO */
  const [minhasPublicacoes, setMinhasPublicacoes] = useState<Publicacao[]>(MINHAS_PUBLICACOES_INICIAIS);
  const [carregandoPublicacoes, setCarregandoPublicacoes] = useState(false);
  const [publicacaoSelecionada, setPublicacaoSelecionada] = useState<string | null>(null);
  const [comentarioAtualPub, setComentarioAtualPub] = useState<Record<string, string>>({});

  // Id da linha de "cidadao" do usuário logado — é esse id que ocorrencias.autor_id espera
  const [cidadaoId, setCidadaoId] = useState<string | null>(null);

  /* EDIÇÃO DE UMA PUBLICAÇÃO PRÓPRIA */
  const [editandoPublicacao, setEditandoPublicacao] = useState(false);
  const [salvandoEdicaoPub, setSalvandoEdicaoPub] = useState(false);
  const [apagandoPub, setApagandoPub] = useState(false);
  const [edicaoPub, setEdicaoPub] = useState<{
    tipo: string;
    cidade: string;
    bairro: string;
    endereco: string;
    descricao: string;
  } | null>(null);

  /* MENU DE AÇÕES (⋮) DE UMA PUBLICAÇÃO PRÓPRIA */
  const [menuAcoesAberto, setMenuAcoesAberto] = useState(false);
  const [linkCopiadoPub, setLinkCopiadoPub] = useState(false);
  const menuAcoesRef = useRef<HTMLDivElement>(null);

  // Fecha o menu de ações ao clicar fora dele
  useEffect(() => {
    if (!menuAcoesAberto) return;
    const aoClicarFora = (e: MouseEvent) => {
      if (menuAcoesRef.current && !menuAcoesRef.current.contains(e.target as Node)) {
        setMenuAcoesAberto(false);
      }
    };
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [menuAcoesAberto]);

  /* CARREGAR DADOS DO SUPABASE */
  useEffect(() => {
    let ativo = true;

    async function carregarPerfil(authUser: any) {
      try {
        const nomeDoCadastro =
          authUser.user_metadata?.nome_completo ||
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          "Usuário";

        const fotoDoProvedor =
          authUser.user_metadata?.avatar_url || "/PluviteIcon.jpg";
        const emailDoCadastro = authUser.email || "";

        if (ativo) {
          setPerfil((prev) => ({
            ...prev,
            email: emailDoCadastro,
            nome_completo: nomeDoCadastro,
            avatar_url: fotoDoProvedor,
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
          setCidadaoId(data.id);
          setPerfil((prev) => ({
            ...prev,
            nome_completo: data.nome_completo || nomeDoCadastro,
            telefone: formatarTelefone(data.telefone || ""),
            data_nascimento: data.data_nascimento || "",
            cidade: data.cidade || "",
            bairro: data.bairro || "",
            cep: data.cep || "",
            pcd: data.pcd === true || data.pcd === "true",
            avatar_url: data.avatar_url || fotoDoProvedor,
            tipo_deficiencia: data.tipo_deficiencia || "",
            tipo_sanguineo: data.tipo_sanguineo || "",
            alergias: data.alergias || "",
            condicoes_medicas: data.condicoes_medicas || "",
            medicamentos_uso: data.medicamentos_uso || "",
            contato_emergencia_nome: data.contato_emergencia_nome || "",
            contato_emergencia_telefone: formatarTelefone(
              data.contato_emergencia_telefone || "",
            ),
            contato_emergencia_parentesco: data.contato_emergencia_parentesco || "",
            notif_chuva_forte: data.notif_chuva_forte ?? true,
            notif_deslizamento: data.notif_deslizamento ?? true,
            notif_email: data.notif_email ?? true,
            notif_push: data.notif_push ?? true,
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

  /* CARREGAR MINHAS PUBLICAÇÕES DO SUPABASE */
  const carregarMinhasPublicacoes = async (cidadaoIdAtual: string) => {
    setCarregandoPublicacoes(true);

    const { data: linhas, error: erroOcorrencias } = await supabase
      .from("ocorrencias")
      .select("*")
      .eq("autor_id", cidadaoIdAtual)
      .order("criado_em", { ascending: false });

    if (erroOcorrencias || !linhas) {
      console.error("Erro ao carregar minhas publicações:", erroOcorrencias);
      setCarregandoPublicacoes(false);
      return;
    }

    const { data: curtidasLinhas } = await supabase
      .from("curtidas")
      .select("ocorrencia_id, usuario_id");
    const { data: comentariosLinhas } = await supabase
      .from("comentarios")
      .select("id, ocorrencia_id, texto, cidadao(nome_completo)")
      .order("criado_em", { ascending: true });

    const publicacoesMontadas: Publicacao[] = linhas.map((linha: any) => {
      const curtidasDaOcorrencia = (curtidasLinhas || []).filter(
        (c: any) => c.ocorrencia_id === linha.id,
      );
      const comentariosDaOcorrencia = (comentariosLinhas || [])
        .filter((c: any) => c.ocorrencia_id === linha.id)
        .map((c: any) => ({
          id: c.id,
          autor: c.cidadao?.nome_completo || "Cidadão",
          texto: c.texto,
        }));

      return {
        id: linha.id,
        tipo: linha.tipo,
        cidade: linha.cidade,
        bairro: linha.bairro,
        endereco: linha.endereco,
        criadoEm: linha.criado_em,
        tempo: tempoRelativo(linha.criado_em),
        status: linha.status,
        descricao: linha.descricao || "",
        imagemUrl: linha.imagem_url,
        curtido: cidadaoIdAtual
          ? curtidasDaOcorrencia.some((c: any) => c.usuario_id === cidadaoIdAtual)
          : false,
        curtidas: curtidasDaOcorrencia.length,
        comentarios: comentariosDaOcorrencia,
      };
    });

    setMinhasPublicacoes(publicacoesMontadas);
    setCarregandoPublicacoes(false);
  };

  useEffect(() => {
    if (cidadaoId) carregarMinhasPublicacoes(cidadaoId);
  }, [cidadaoId]);

  /* FORMATACAO MASCARA DE TELEFONE */
  function formatarTelefone(valor: string) {
    const numeros = valor.replace(/\D/g, "").slice(0, 11);

    if (numeros.length === 0) return "";
    if (numeros.length <= 2) return numeros.replace(/^(\d*)/, "($1");
    if (numeros.length <= 6)
      return numeros.replace(/^(\d{2})(\d*)/, "($1) $2");
    if (numeros.length <= 10)
      return numeros.replace(/^(\d{2})(\d{4})(\d*)/, "($1) $2-$3");
    return numeros.replace(/^(\d{2})(\d{5})(\d*)/, "($1) $2-$3");
  }

  /* GERA AS INICIAIS DE UM NOME (usado nos avatares dos comentários) */
  const gerarIniciais = (nome: string) =>
    nome
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");

  /* MANIPULACAO DE CAMPOS DE FORMULARIO */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === "telefone" || name === "contato_emergencia_telefone") {
      setPerfil((prev) => ({ ...prev, [name]: formatarTelefone(value) }));
      return;
    }

    setPerfil((prev) => ({ ...prev, [name]: value || "" }));
  };

  /* UPLOAD DE FOTO DE PERFIL */
  const handleTrocarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    const urlProvisoria = URL.createObjectURL(file);
    setPerfil((prev) => ({ ...prev, avatar_url: urlProvisoria }));

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

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

      setPerfil((prev) => ({ ...prev, avatar_url: publicUrl }));
      alert("Foto de perfil salva com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar a foto:", error);
      alert("Erro ao enviar a imagem: " + error.message);
    }
  };

  /* SALVAR DADOS NO SUPABASE */
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
        data_nascimento: perfil.data_nascimento ? perfil.data_nascimento : null,
        cidade: perfil.cidade || null,
        bairro: perfil.bairro || null,
        cep: perfil.cep || null,
        pcd: perfil.pcd,
        tipo_deficiencia: perfil.pcd ? perfil.tipo_deficiencia || "" : "",
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
      alert("Dados salvos com sucesso!");
    } catch (err: any) {
      console.error("Erro ao salvar dados no Supabase:", err);
      alert("Erro ao salvar: " + err.message);
    } finally {
      setCarregando(false);
    }
  };

  /* ALTERAR PREFERENCIAS DE NOTIFICACAO */
  const alternarNotificacao = async (
    campo:
      | "notif_chuva_forte"
      | "notif_deslizamento"
      | "notif_email"
      | "notif_push",
  ) => {
    const novoValor = !perfil[campo];
    setPerfil((prev) => ({ ...prev, [campo]: novoValor }));

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("cidadao").upsert(
        {
          auth_id: user.id,
          email: user.email,
          nome_completo: perfil.nome_completo || "Usuário",
          [campo]: novoValor,
        },
        { onConflict: "auth_id" },
      );

      if (error) throw error;
    } catch (err: any) {
      console.error("Erro ao salvar notificação:", err);
      setPerfil((prev) => ({ ...prev, [campo]: !novoValor }));
      alert("Erro ao salvar preferência: " + err.message);
    }
  };

  /* CURTIR UMA PUBLICAÇÃO PRÓPRIA */
  const handleCurtirPublicacao = async (id: string) => {
    if (!cidadaoId) return;

    const pub = minhasPublicacoes.find((p) => p.id === id);
    if (!pub) return;
    const vaiCurtir = !pub.curtido;

    // Atualização otimista — muda na tela antes da resposta do banco
    setMinhasPublicacoes((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
            ...p,
            curtido: vaiCurtir,
            curtidas: vaiCurtir ? p.curtidas + 1 : p.curtidas - 1,
          }
          : p,
      ),
    );

    if (vaiCurtir) {
      const { error } = await supabase
        .from("curtidas")
        .insert({ ocorrencia_id: id, usuario_id: cidadaoId });
      if (error) console.error(error);
    } else {
      const { error } = await supabase
        .from("curtidas")
        .delete()
        .eq("ocorrencia_id", id)
        .eq("usuario_id", cidadaoId);
      if (error) console.error(error);
    }
  };

  /* ENVIAR COMENTÁRIO EM UMA PUBLICAÇÃO PRÓPRIA */
  const handleEnviarComentarioPub = async (id: string) => {
    if (!cidadaoId) return;

    const texto = (comentarioAtualPub[id] || "").trim();
    if (!texto) return;

    setComentarioAtualPub((prev) => ({ ...prev, [id]: "" }));

    // Atualização otimista — mostra o comentário antes da resposta do banco
    setMinhasPublicacoes((prev) =>
      prev.map((pub) =>
        pub.id === id
          ? {
            ...pub,
            comentarios: [
              ...pub.comentarios,
              { id: `temp-${Date.now()}`, autor: perfil.nome_completo || "Você", texto },
            ],
          }
          : pub,
      ),
    );

    const { error } = await supabase.from("comentarios").insert({
      ocorrencia_id: id,
      autor_id: cidadaoId,
      texto,
    });

    if (error) {
      console.error(error);
      alert("Não foi possível enviar o comentário.");
    }
  };

  /* COMPARTILHAR UMA PUBLICAÇÃO PRÓPRIA — leva pro Feed, que já abre o post pelo ?ocorrencia=id */
  const handleCompartilharPub = async (pub: Publicacao) => {
    if (typeof window === "undefined") return;
    const link = `${window.location.origin}/Feed?ocorrencia=${pub.id}`;
    const texto = `${pub.tipo} em ${pub.bairro}, ${pub.cidade} — via Pluvite`;

    setMenuAcoesAberto(false);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Pluvite", text: texto, url: link });
      } catch {
        // Usuário cancelou o compartilhamento nativo — sem tratamento extra
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setLinkCopiadoPub(true);
      setTimeout(() => setLinkCopiadoPub(false), 2000);
    } catch {
      // Navegador sem permissão de clipboard — sem tratamento extra por enquanto
    }
  };

  /* EDITAR UMA PUBLICAÇÃO PRÓPRIA */
  const iniciarEdicaoPublicacao = (pub: Publicacao) => {
    setEdicaoPub({
      tipo: pub.tipo,
      cidade: pub.cidade,
      bairro: pub.bairro,
      endereco: pub.endereco,
      descricao: pub.descricao,
    });
    setEditandoPublicacao(true);
    setMenuAcoesAberto(false);
  };

  const cancelarEdicaoPublicacao = () => {
    setEditandoPublicacao(false);
    setEdicaoPub(null);
  };

  const salvarEdicaoPublicacao = async (id: string) => {
    if (!edicaoPub) return;
    if (!edicaoPub.tipo || !edicaoPub.cidade || !edicaoPub.bairro.trim() || !edicaoPub.endereco.trim()) {
      alert("Preencha o tipo, a cidade, o bairro e o endereço antes de salvar.");
      return;
    }

    setSalvandoEdicaoPub(true);

    const { error } = await supabase
      .from("ocorrencias")
      .update({
        tipo: edicaoPub.tipo,
        cidade: edicaoPub.cidade,
        bairro: edicaoPub.bairro.trim(),
        endereco: edicaoPub.endereco.trim(),
        descricao: edicaoPub.descricao.trim() || null,
      })
      .eq("id", id);

    setSalvandoEdicaoPub(false);

    if (error) {
      console.error("Erro ao salvar publicação:", error);
      alert("Não foi possível salvar as alterações: " + error.message);
      return;
    }

    setMinhasPublicacoes((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
            ...p,
            tipo: edicaoPub.tipo,
            cidade: edicaoPub.cidade,
            bairro: edicaoPub.bairro.trim(),
            endereco: edicaoPub.endereco.trim(),
            descricao: edicaoPub.descricao.trim(),
          }
          : p,
      ),
    );
    setEditandoPublicacao(false);
    setEdicaoPub(null);
  };

  /* APAGAR UMA PUBLICAÇÃO PRÓPRIA */
  const apagarPublicacao = async (id: string) => {
    setMenuAcoesAberto(false);
    const confirmar = window.confirm(
      "Tem certeza que deseja apagar esta publicação? Essa ação não pode ser desfeita.",
    );
    if (!confirmar) return;

    setApagandoPub(true);

    // Remove primeiro curtidas e comentários ligados a essa ocorrência,
    // pra não esbarrar numa restrição de chave estrangeira ao apagar
    await supabase.from("curtidas").delete().eq("ocorrencia_id", id);
    await supabase.from("comentarios").delete().eq("ocorrencia_id", id);

    const { error } = await supabase.from("ocorrencias").delete().eq("id", id);

    setApagandoPub(false);

    if (error) {
      console.error("Erro ao apagar publicação:", error);
      alert("Não foi possível apagar a publicação: " + error.message);
      return;
    }

    setMinhasPublicacoes((prev) => prev.filter((p) => p.id !== id));
    setPublicacaoSelecionada(null);
    setEditandoPublicacao(false);
    setEdicaoPub(null);
  };

  /* LOGOUT DO USUARIO */
  const handleSair = async () => {
    setSaindo(true);
    try {
      await supabase.auth.signOut();

      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
      }

      setPerfil({
        nome_completo: "",
        email: "",
        telefone: "",
        data_nascimento: "",
        cidade: "",
        bairro: "",
        cep: "",
        pcd: false,
        tipo_deficiencia: "",
        avatar_url: "/perfil.png",
        tipo_sanguineo: "",
        alergias: "",
        condicoes_medicas: "",
        medicamentos_uso: "",
        contato_emergencia_nome: "",
        contato_emergencia_telefone: "",
        contato_emergencia_parentesco: "",
        notif_chuva_forte: true,
        notif_deslizamento: true,
        notif_email: true,
        notif_push: true,
      });

      router.push("/");
    } catch (err: any) {
      console.error("Erro ao sair:", err);
      alert("Erro ao sair da conta: " + err.message);
    } finally {
      setSaindo(false);
    }
  };

  /* ESTRUTURA DOS ITENS DA BARRA LATERAL */
  const itensSidebar: { id: Secao; label: string; icon: React.ReactNode }[] = [
    { id: "dados", label: "Meus Dados", icon: <User size={18} /> },
    { id: "publicacoes", label: "Minhas Publicações", icon: <ImageIcon size={18} /> },
    { id: "emergencia", label: "Dados de Emergência", icon: <HeartPulse size={18} /> },
    { id: "notificacoes", label: "Notificações", icon: <Bell size={18} /> },
    { id: "seguranca", label: "Segurança", icon: <Shield size={18} /> },
  ];

  /* COMPONENTE CABECALHO DE CARDS */
  const CardHeader = ({
    icon,
    title,
    bloco,
  }: {
    icon: React.ReactNode;
    title: string;
    bloco: Bloco;
  }) => (
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 text-[#091f75]">
          {icon}
        </span>
        {title}
      </h3>
      <div className="flex gap-1">
        {editandoBloco === bloco ? (
          <>
            <button
              onClick={() => setEditandoBloco(null)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-all"
            >
              <X size={15} />
            </button>
            <button
              onClick={() => salvarDados(bloco)}
              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer transition-all"
            >
              {carregando ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )}
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditandoBloco(bloco)}
            className="p-1.5 text-slate-400 hover:text-[#091f75] rounded-lg hover:bg-blue-50 transition-all cursor-pointer"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
    </div>
  );

  /* COMPONENTE DE SELECAO PCD */
  const BlocoPCD = () => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 text-[#091f75]">
            <Accessibility size={14} />
          </span>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
            PCD
          </span>
        </div>

        <div className="flex items-center gap-3 flex-1 min-w-[200px] justify-end">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={Boolean(perfil.pcd)}
              onChange={(e) => {
                const checked = e.target.checked;
                setPerfil((prev) => ({
                  ...prev,
                  pcd: checked,
                  tipo_deficiencia: checked ? prev.tipo_deficiencia : "",
                }));
              }}
              className="accent-[#091f75]"
            />
            Possuo Deficiência
          </label>

          {perfil.pcd && (
            <input
              type="text"
              name="tipo_deficiencia"
              placeholder="Qual deficiência?"
              value={perfil.tipo_deficiencia || ""}
              onChange={handleChange}
              className="max-w-[180px] w-full bg-slate-50 text-xs font-semibold text-slate-700 rounded-lg px-2 py-1 border border-slate-200 outline-none focus:border-[#091f75]"
            />
          )}

          <button
            onClick={() => salvarDados("endereco")}
            className="p-1.5 text-[#091f75] hover:bg-blue-50 rounded-lg transition-all cursor-pointer shrink-0"
            title="Salvar acessibilidade"
          >
            {carregando ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <main className="w-full mt-15 bg-slate-50 font-sans antialiased p-4 sm:p-6 md:p-8 min-h-full overflow-hidden relative">
      {/* FUNDO BOLHAS DE DECORACAO */}
      <div className="absolute top-[400px] -left-35 w-96 h-96 bg-[#0f35a0]/5 rounded-full pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-[#0f35a0]/4 rounded-full blur-2xl pointer-events-none" />

      {/* NAVEGACAO LATERAL FIXA */}
      <div className="hidden lg:flex flex-col gap-1 fixed left-8 top-1/2 -translate-y-1/2 z-40 bg-white rounded-2xl border border-slate-200 shadow-sm p-2 w-14">
        {itensSidebar.map((item) => (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => setHoverItem(item.id)}
            onMouseLeave={() => setHoverItem(null)}
          >
            <button
              onClick={() => setSecaoAtiva(item.id)}
              className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all cursor-pointer ${secaoAtiva === item.id
                ? "bg-blue-50 text-[#091f75]"
                : "text-slate-400 hover:bg-slate-50 hover:text-[#091f75]"
                }`}
            >
              {item.icon}
            </button>

            <div
              className={`absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap bg-white border border-slate-200 shadow-md rounded-xl px-3.5 py-2 transition-all duration-200 origin-left ${hoverItem === item.id
                ? "opacity-100 scale-100 translate-x-0 pointer-events-auto"
                : "opacity-0 scale-95 -translate-x-1 pointer-events-none"
                }`}
            >
              <span
                className={`text-xs font-bold ${secaoAtiva === item.id ? "text-[#091f75]" : "text-slate-600"
                  }`}
              >
                {item.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="max-w-6xl mx-auto space-y-6 relative z-10 lg:pl-16">
        {/* TITULO PRINCIPAL */}
        <div className="border-b border-slate-200 pb-4">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            MEU PERFIL
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* CARTAO DE AVATAR E USUARIO */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col items-center justify-between min-h-[455px]">
            <div className="w-full flex flex-col items-center text-center space-y-4">
              <div className="relative mt-2">
                <div className="w-32 h-32 rounded-full bg-blue-50 ring-4 ring-blue-50 overflow-hidden flex items-center justify-center text-[#091f75] text-4xl font-black select-none">
                  {perfil.avatar_url ? (
                    <img
                      src={perfil.avatar_url}
                      alt="Avatar"
                      referrerPolicy="no-referrer"
                      className={
                        perfil.avatar_url === "/perfil.png"
                          ? "w-full h-full object-contain scale-160"
                          : "w-full h-full object-cover"
                      }
                    />
                  ) : perfil.nome_completo ? (
                    perfil.nome_completo.charAt(0).toUpperCase()
                  ) : (
                    "P"
                  )}
                </div>

                <label
                  htmlFor="input-avatar"
                  className="absolute bottom-0 right-1 bg-white hover:bg-slate-50 text-[#091f75] p-2 rounded-full shadow-md cursor-pointer transition-all border border-slate-200 flex items-center justify-center active:scale-90 z-20"
                >
                  <Pencil size={12} />
                </label>
                <input
                  id="input-avatar"
                  type="file"
                  accept="image/*"
                  onChange={handleTrocarFoto}
                  className="hidden"
                />
              </div>

              <div className="space-y-0.5 max-w-full px-2">
                <h2 className="text-lg font-bold text-slate-800 tracking-tight truncate">
                  {perfil.nome_completo || "Usuário"}
                </h2>
                <p className="text-xs text-slate-400 font-medium truncate">
                  {perfil.email}
                </p>
              </div>
              <span className="inline-flex px-3 py-1 bg-blue-50 text-[#091f75] text-[11px] font-bold rounded-full border border-blue-100">
                Taubaté
              </span>

              {/* CONTADOR DE PUBLICAÇÕES — leva direto pra aba de publicações */}
              <button
                onClick={() => setSecaoAtiva("publicacoes")}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#091f75] transition cursor-pointer"
              >
                <ImageIcon size={13} />
                {minhasPublicacoes.length} {minhasPublicacoes.length === 1 ? "publicação" : "publicações"}
              </button>
            </div>

            <div className="w-full space-y-2.5 pt-4 mt-6 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="font-medium">Alertas em tempo real</span>
                <div className="flex items-center gap-1.5 font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>{" "}
                  Ativos
                </div>
              </div>

              <button
                onClick={handleSair}
                disabled={saindo}
                className="w-full flex items-center justify-center gap-2 text-xs font-bold text-red-500 hover:text-white bg-red-50 hover:bg-red-500 border border-red-100 hover:border-red-500 rounded-xl py-2.5 transition-all cursor-pointer disabled:opacity-60"
              >
                {saindo ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <LogOut size={14} />
                )}
                {saindo ? "Saindo..." : "Sair da conta"}
              </button>
            </div>
          </div>

          {/* CONTEUDO PRINCIPAL / SEÇÕES */}
          <div className="lg:col-span-8 space-y-5">
            {secaoAtiva === "dados" && (
              <>
                {/* INFORMACOES PESSOAIS */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <CardHeader icon={<User size={14} />} title="Informações Pessoais" bloco="pessoais" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {[
                      {
                        label: "Nome Completo",
                        name: "nome_completo",
                        type: "text",
                      },
                      {
                        label: "Telefone / Celular",
                        name: "telefone",
                        type: "text",
                        placeholder: "(00) 00000-0000",
                      },
                      {
                        label: "Data de Nascimento",
                        name: "data_nascimento",
                        type: "date",
                      },
                    ].map((f) => (
                      <div
                        key={f.name}
                        className="bg-slate-50 p-3 rounded-xl border border-slate-100"
                      >
                        <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wide mb-0.5">
                          {f.label}
                        </span>
                        {editandoBloco === "pessoais" ? (
                          <input
                            type={f.type}
                            name={f.name}
                            placeholder={f.placeholder}
                            maxLength={f.name === "telefone" ? 15 : undefined}
                            value={(perfil as any)[f.name] || ""}
                            onChange={handleChange}
                            className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2 py-1.5 border border-slate-200 outline-none mt-1 focus:border-[#091f75]"
                          />
                        ) : (
                          <span className="text-xs font-semibold text-slate-700 block truncate">
                            {(perfil as any)[f.name] || "Não informado"}
                          </span>
                        )}
                      </div>
                    ))}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 opacity-70">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wide mb-0.5">
                        E-mail
                      </span>
                      <span className="text-xs font-semibold text-slate-700 block truncate">
                        {perfil.email}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ENDEREÇO */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <CardHeader icon={<MapPin size={14} />} title="Endereço" bloco="endereco" />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    {[
                      { label: "Cidade", name: "cidade" },
                      { label: "Bairro", name: "bairro" },
                      { label: "CEP", name: "cep" },
                    ].map((f) => (
                      <div
                        key={f.name}
                        className="bg-slate-50 p-3 rounded-xl border border-slate-100"
                      >
                        <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wide mb-0.5">
                          {f.label}
                        </span>
                        {editandoBloco === "endereco" ? (
                          <input
                            type="text"
                            name={f.name}
                            value={(perfil as any)[f.name] || ""}
                            onChange={handleChange}
                            className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2 py-1.5 border border-slate-200 outline-none mt-1 focus:border-[#091f75]"
                          />
                        ) : (
                          <span className="text-xs font-semibold text-slate-700 block truncate">
                            {(perfil as any)[f.name] || "Não informado"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <BlocoPCD />
              </>
            )}

            {secaoAtiva === "publicacoes" && (
              /* MINHAS PUBLICAÇÕES — grid estilo Instagram */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="mb-5">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 text-[#091f75]">
                      <ImageIcon size={14} />
                    </span>
                    Minhas Publicações
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 pl-9">
                    Ocorrências que você reportou no feed da comunidade. Clique numa foto pra ver os detalhes e os comentários.
                  </p>
                </div>

                {carregandoPublicacoes ? (
                  <div className="py-10 text-center">
                    <Loader2 size={22} className="text-slate-300 mx-auto mb-2 animate-spin" />
                    <p className="text-xs text-slate-400 font-medium">
                      Carregando suas publicações...
                    </p>
                  </div>
                ) : minhasPublicacoes.length === 0 ? (
                  <div className="py-10 text-center">
                    <ImageIcon size={28} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-400 font-medium">
                      Você ainda não publicou nenhuma ocorrência.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
                    {minhasPublicacoes.map((pub) => (
                      <button
                        key={pub.id}
                        onClick={() => setPublicacaoSelecionada(pub.id)}
                        className="relative aspect-square rounded-lg overflow-hidden group cursor-pointer bg-slate-100"
                      >
                        {pub.imagemUrl ? (
                          <img
                            src={pub.imagemUrl}
                            alt="Publicação"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2 bg-blue-50/60">
                            <ImageIcon size={20} className="text-[#091f75]/40" />
                            <span className="text-[9px] font-bold text-[#091f75]/70 text-center leading-tight line-clamp-3">
                              {pub.tipo}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/50 transition-all flex items-center justify-center gap-4 opacity-0 group-hover:opacity-100">
                          <span className="flex items-center gap-1.5 text-white text-xs font-bold">
                            <ThumbsUp size={14} fill="currentColor" />
                            {pub.curtidas}
                          </span>
                          <span className="flex items-center gap-1.5 text-white text-xs font-bold">
                            <MessageSquare size={14} fill="currentColor" />
                            {pub.comentarios.length}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {secaoAtiva === "emergencia" && (
              <>
                {/* ALERTA INFORMATIVO */}
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
                  <HeartPulse size={18} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Essas informações ficam guardadas no seu perfil e só são
                    usadas em caso de necessidade de resgate durante uma
                    emergência.
                  </p>
                </div>

                {/* INFORMACOES MEDICAS */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4.5">
                  <CardHeader icon={<HeartPulse size={14} />} title="Informações Médicas" bloco="medico" />

                  <div className="grid grid-cols-1 md:grid-cols-2  gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wide mb-0.5">
                        Tipo Sanguíneo
                      </span>
                      {editandoBloco === "medico" ? (
                        <select
                          name="tipo_sanguineo"
                          value={perfil.tipo_sanguineo || ""}
                          onChange={handleChange}
                          className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2 py-1.5 border border-slate-200 outline-none mt-1 focus:border-[#091f75]"
                        >
                          <option value="">Não sei / não informar</option>
                          {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                            (tipo) => (
                              <option key={tipo} value={tipo}>
                                {tipo}
                              </option>
                            ),
                          )}
                        </select>
                      ) : (
                        <span className="text-xs font-semibold text-slate-700 block truncate">
                          {perfil.tipo_sanguineo || "Não informado"}
                        </span>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wide mb-0.5">
                        Alergias
                      </span>
                      {editandoBloco === "medico" ? (
                        <textarea
                          name="alergias"
                          rows={2}
                          placeholder="Ex: alergia a dipirona, látex..."
                          value={perfil.alergias || ""}
                          onChange={handleChange}
                          className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2 py-1.5 border border-slate-200 outline-none mt-1 resize-none focus:border-[#091f75]"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-slate-700 block">
                          {perfil.alergias || "Não informado"}
                        </span>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wide mb-0.5">
                        Condições Médicas
                      </span>
                      {editandoBloco === "medico" ? (
                        <textarea
                          name="condicoes_medicas"
                          rows={2}
                          placeholder="Ex: diabetes, hipertensão..."
                          value={perfil.condicoes_medicas || ""}
                          onChange={handleChange}
                          className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2 py-1.5 border border-slate-200 outline-none mt-1 resize-none focus:border-[#091f75]"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-slate-700 block">
                          {perfil.condicoes_medicas || "Não informado"}
                        </span>
                      )}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wide mb-0.5">
                        Medicamentos de Uso Contínuo
                      </span>
                      {editandoBloco === "medico" ? (
                        <textarea
                          name="medicamentos_uso"
                          rows={2}
                          placeholder="Ex: losartana 50mg..."
                          value={perfil.medicamentos_uso || ""}
                          onChange={handleChange}
                          className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2 py-1.5 border border-slate-200 outline-none mt-1 resize-none focus:border-[#091f75]"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-slate-700 block">
                          {perfil.medicamentos_uso || "Não informado"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* CONTATO DE EMERGENCIA */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5">
                  <CardHeader icon={<Phone size={14} />} title="Contato de Emergência" bloco="contatoEmergencia" />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    {[
                      { label: "Nome", name: "contato_emergencia_nome" },
                      {
                        label: "Telefone",
                        name: "contato_emergencia_telefone",
                        placeholder: "(00) 00000-0000",
                      },
                      {
                        label: "Parentesco / Relação",
                        name: "contato_emergencia_parentesco",
                        placeholder: "Ex: mãe, cônjuge...",
                      },
                    ].map((f) => (
                      <div
                        key={f.name}
                        className="bg-slate-50 p-3 rounded-xl border border-slate-100"
                      >
                        <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wide mb-0.5">
                          {f.label}
                        </span>
                        {editandoBloco === "contatoEmergencia" ? (
                          <input
                            type="text"
                            name={f.name}
                            placeholder={f.placeholder}
                            maxLength={
                              f.name === "contato_emergencia_telefone" ? 15 : undefined
                            }
                            value={(perfil as any)[f.name] || ""}
                            onChange={handleChange}
                            className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2 py-1.5 border border-slate-200 outline-none mt-1 focus:border-[#091f75]"
                          />
                        ) : (
                          <span className="text-xs font-semibold text-slate-700 block truncate">
                            {(perfil as any)[f.name] || "Não informado"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {secaoAtiva === "notificacoes" && (
              /* PREFERENCIAS DE NOTIFICACOES */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 space-y-5 pb-10">
                <div>
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2.5">
                    <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-50 text-[#091f75]">
                      <Bell size={16} />
                    </span>
                    Preferências de Notificações
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 pl-10">
                    Escolha como e quando você deseja receber nossos alertas e avisos de emergência.
                  </p>
                </div>

                <div className="space-y-3">
                  {(
                    [
                      {
                        label: "Alertas de chuva forte",
                        desc: "Avisos em tempo real sobre tempestades e acumulados pluviométricos na sua região.",
                        campo: "notif_chuva_forte",
                        icon: <HeartPulse size={16} className="text-blue-600" />,
                      },
                      {
                        label: "Risco de deslizamento",
                        desc: "Alertas críticos para áreas de encosta com risco iminente de alagamento ou deslizamento.",
                        campo: "notif_deslizamento",
                        icon: <Shield size={16} className="text-amber-600" />,
                      },
                      {
                        label: "Notificações por e-mail",
                        desc: "Receba relatórios periódicos e avisos importantes diretamente na sua caixa de entrada.",
                        campo: "notif_email",
                        icon: <Bell size={16} className="text-indigo-600" />,
                      },
                      {
                        label: "Notificações push no navegador",
                        desc: "Avisos sonoros e visuais na tela enquanto o seu navegador estiver aberto.",
                        campo: "notif_push",
                        icon: <User size={16} className="text-emerald-600" />,
                      },
                    ] as const
                  ).map(({ label, desc, campo, icon }) => (
                    <div
                      key={campo}
                      className="flex items-center justify-between bg-slate-50/80 hover:bg-slate-50 p-4 rounded-xl border border-slate-200/60 transition-all gap-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-2xs mt-0.5">
                          {icon}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-800 block">
                            {label}
                          </span>
                          <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">
                            {desc}
                          </span>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={perfil[campo]}
                          onChange={() => alternarNotificacao(campo)}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-slate-200 peer-checked:bg-[#091f75] rounded-full transition-all after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {secaoAtiva === "seguranca" && (
              /* SEGURANCA DA CONTA */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5 pb-10">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 text-[#091f75]">
                      <Shield size={14} />
                    </span>
                    Segurança da Conta
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Gerencie suas credenciais de acesso e redefinição de senha.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* SEÇÃO ALTERAR SENHA */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          Alterar Senha
                        </span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Escolha uma senha forte para proteger sua conta.
                        </span>
                      </div>

                      <button
                        onClick={() => setEditandoBloco(editandoBloco === "pessoais" ? null : "pessoais")}
                        className="px-3 py-1.5 text-xs font-bold text-[#091f75] bg-blue-50 hover:bg-blue-100 rounded-lg transition-all cursor-pointer border border-blue-100 shrink-0"
                      >
                        {editandoBloco === "pessoais" ? "Cancelar" : "Alterar"}
                      </button>
                    </div>

                    {/* FORMULÁRIO DE TROCA DE SENHA */}
                    {editandoBloco === "pessoais" && (
                      <div className="pt-3 border-t border-slate-200/60 space-y-3">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                            Senha Atual
                          </span>
                          <input
                            type="password"
                            placeholder="Digite sua senha atual"
                            className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 border border-slate-200 outline-none focus:border-[#091f75]"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                              Nova Senha
                            </span>
                            <input
                              type="password"
                              placeholder="Nova senha"
                              className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 border border-slate-200 outline-none focus:border-[#091f75]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                              Confirmar Nova Senha
                            </span>
                            <input
                              type="password"
                              placeholder="Repita a nova senha"
                              className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 border border-slate-200 outline-none focus:border-[#091f75]"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => alert("Função para integrar ao Supabase Auth")}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#091f75] hover:bg-[#0f35a0] text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer active:scale-95"
                        >
                          <Save size={14} />
                          Salvar Nova Senha
                        </button>
                      </div>
                    )}
                  </div>

                  {/* SEÇÃO ESQUECI MINHA SENHA / RECUPERAÇÃO */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Esqueceu sua senha?
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Enviaremos um link de redefinição para o e-mail: <strong className="text-slate-600">{perfil.email}</strong>
                      </span>
                    </div>

                    <button
                      onClick={async () => {
                        if (!perfil.email) return alert("E-mail não encontrado.");
                        const { error } = await supabase.auth.resetPasswordForEmail(perfil.email);
                        if (error) alert("Erro ao enviar e-mail: " + error.message);
                        else alert("E-mail de redefinição enviado com sucesso!");
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 rounded-lg transition-all cursor-pointer border border-slate-200 shrink-0"
                    >
                      Enviar Link
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL DE POST COMPLETO (ESTILO INSTAGRAM) — mesma lógica do Feed */}
      {publicacaoSelecionada && (() => {
        const pub = minhasPublicacoes.find((p) => p.id === publicacaoSelecionada);
        if (!pub) return null;
        const estiloPub = STATUS_ESTILO_PUB[pub.status];
        const StatusIconPub = estiloPub.icon;

        return (
          <div
            className="fixed inset-0 bg-slate-950/90 z-[10002] flex items-center justify-center p-4"
            onClick={() => {
              setPublicacaoSelecionada(null);
              cancelarEdicaoPublicacao();
              setMenuAcoesAberto(false);
            }}
          >
            <button
              onClick={() => {
                setPublicacaoSelecionada(null);
                cancelarEdicaoPublicacao();
                setMenuAcoesAberto(false);
              }}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white/80 hover:text-white cursor-pointer z-10"
              title="Fechar"
            >
              <X size={28} />
            </button>

            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
              onClick={(e) => e.stopPropagation()}
            >
              {/* IMAGEM GRANDE (ou marcador do tipo, quando a publicação não tem foto) */}
              <div className="w-full md:w-3/5 bg-black flex items-center justify-center max-h-[45vh] md:max-h-[90vh] shrink-0">
                {pub.imagemUrl ? (
                  <img
                    src={pub.imagemUrl}
                    alt="Publicação"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-white/60 p-10 text-center">
                    <ImageIcon size={36} />
                    <span className="text-xs font-bold">{pub.tipo}</span>
                    <span className="text-[11px] text-white/40">
                      Essa publicação não tem foto
                    </span>
                  </div>
                )}
              </div>

              {/* PAINEL DE LEGENDA E COMENTÁRIOS */}
              <div className="w-full md:w-2/5 flex flex-col min-h-0">
                {/* CABEÇALHO DO POST */}
                <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-blue-50 overflow-hidden flex items-center justify-center text-[#091f75] font-black text-xs shrink-0">
                      {perfil.avatar_url && perfil.avatar_url !== "/perfil.png" ? (
                        <img
                          src={perfil.avatar_url}
                          alt="Avatar"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        gerarIniciais(perfil.nome_completo || "Você")
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 text-sm leading-snug truncate">
                        {perfil.nome_completo || "Você"}
                      </h3>
                      <span className="text-[11px] text-slate-400">{pub.tempo}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!editandoPublicacao && (
                      <div className="relative" ref={menuAcoesRef}>
                        <button
                          onClick={() => setMenuAcoesAberto((prev) => !prev)}
                          className="p-1.5 text-slate-400 hover:text-[#091f75] hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                          title="Mais ações"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {menuAcoesAberto && (
                          <ul className="absolute right-0 top-full mt-1.5 z-20 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 overflow-hidden">
                            <li>
                              <button
                                onClick={() => apagarPublicacao(pub.id)}
                                disabled={apagandoPub}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {apagandoPub ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                                Apagar
                              </button>
                            </li>
                            <li>
                              <button
                                onClick={() => iniciarEdicaoPublicacao(pub)}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                <Pencil size={14} className="text-slate-400" />
                                Editar
                              </button>
                            </li>
                            <li>
                              <button
                                onClick={() => handleCompartilharPub(pub)}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                <Share2 size={14} className="text-slate-400" />
                                Compartilhar
                              </button>
                            </li>
                          </ul>
                        )}

                        {linkCopiadoPub && (
                          <span className="absolute right-0 top-full mt-1.5 z-30 flex items-center gap-1 bg-slate-900 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                            <LinkIcon size={11} />
                            Link copiado!
                          </span>
                        )}
                      </div>
                    )}
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 border shrink-0 ${estiloPub.badge}`}>
                      <StatusIconPub size={11} />
                      {estiloPub.texto}
                    </span>
                  </div>
                </div>

                {/* LEGENDA + COMENTÁRIOS (rolável) */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5">
                  {editandoPublicacao && edicaoPub ? (
                    /* FORMULÁRIO DE EDIÇÃO */
                    <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                          Tipo de ocorrência
                        </span>
                        <select
                          value={edicaoPub.tipo}
                          onChange={(e) =>
                            setEdicaoPub((prev) => prev && { ...prev, tipo: e.target.value })
                          }
                          className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 border border-slate-200 outline-none focus:border-[#091f75]"
                        >
                          {TIPOS_OCORRENCIA.map((tipo) => (
                            <option key={tipo} value={tipo}>
                              {tipo}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                          Cidade
                        </span>
                        <select
                          value={edicaoPub.cidade}
                          onChange={(e) =>
                            setEdicaoPub((prev) => prev && { ...prev, cidade: e.target.value })
                          }
                          className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 border border-slate-200 outline-none focus:border-[#091f75]"
                        >
                          {CIDADES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                            Bairro
                          </span>
                          <input
                            type="text"
                            value={edicaoPub.bairro}
                            onChange={(e) =>
                              setEdicaoPub((prev) => prev && { ...prev, bairro: e.target.value })
                            }
                            className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 border border-slate-200 outline-none focus:border-[#091f75]"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                            Endereço
                          </span>
                          <input
                            type="text"
                            value={edicaoPub.endereco}
                            onChange={(e) =>
                              setEdicaoPub((prev) => prev && { ...prev, endereco: e.target.value })
                            }
                            className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 border border-slate-200 outline-none focus:border-[#091f75]"
                          />
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                          Descrição
                        </span>
                        <textarea
                          rows={3}
                          value={edicaoPub.descricao}
                          onChange={(e) =>
                            setEdicaoPub((prev) => prev && { ...prev, descricao: e.target.value })
                          }
                          className="w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 border border-slate-200 outline-none resize-none focus:border-[#091f75]"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={cancelarEdicaoPublicacao}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 rounded-lg transition-all cursor-pointer border border-slate-200"
                        >
                          <X size={13} />
                          Cancelar
                        </button>
                        <button
                          onClick={() => salvarEdicaoPublicacao(pub.id)}
                          disabled={salvandoEdicaoPub}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#091f75] hover:bg-[#0f35a0] rounded-lg transition-all cursor-pointer disabled:opacity-60"
                        >
                          {salvandoEdicaoPub ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Check size={13} />
                          )}
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    pub.descricao && (
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-50 overflow-hidden flex items-center justify-center text-[#091f75] font-black text-[10px] shrink-0">
                          {perfil.avatar_url && perfil.avatar_url !== "/perfil.png" ? (
                            <img
                              src={perfil.avatar_url}
                              alt="Avatar"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            gerarIniciais(perfil.nome_completo || "Você")
                          )}
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          <span className="font-bold text-slate-900">{perfil.nome_completo || "Você"}</span>{" "}
                          {pub.descricao}
                        </p>
                      </div>
                    )
                  )}

                  {pub.comentarios.length === 0 ? (
                    <p className="text-xs text-slate-400 font-medium pt-1">
                      Nenhum comentário ainda.
                    </p>
                  ) : (
                    pub.comentarios.map((com) => (
                      <div key={com.id} className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-[10px] shrink-0">
                          {gerarIniciais(com.autor)}
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          <span className="font-bold text-slate-900">{com.autor}</span>{" "}
                          {com.texto}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {/* AÇÕES, CURTIDAS E CAMPO DE COMENTÁRIO (fixo embaixo) */}
                <div className="border-t border-slate-100 shrink-0">
                  <div className="flex items-center justify-between px-4 pt-3">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleCurtirPublicacao(pub.id)}
                        className={`transition cursor-pointer ${pub.curtido ? "text-[#091f75]" : "text-slate-500 hover:text-[#091f75]"}`}
                        title="Curtir"
                      >
                        <ThumbsUp size={20} fill={pub.curtido ? "currentColor" : "none"} />
                      </button>
                      <MessageSquare size={20} className="text-slate-500" />
                    </div>
                  </div>

                  <div className="px-4 pt-2">
                    <span className="text-xs font-bold text-slate-800 block">
                      {pub.curtidas} {pub.curtidas === 1 ? "curtida" : "curtidas"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 p-4 pt-3">
                    <input
                      type="text"
                      value={comentarioAtualPub[pub.id] || ""}
                      onChange={(e) =>
                        setComentarioAtualPub((prev) => ({ ...prev, [pub.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleEnviarComentarioPub(pub.id);
                      }}
                      placeholder="Adicione um comentário..."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#091f75]"
                    />
                    <button
                      onClick={() => handleEnviarComentarioPub(pub.id)}
                      className="p-2.5 rounded-xl bg-[#091f75] hover:bg-[#0f35a0] text-white transition cursor-pointer shrink-0"
                      title="Enviar comentário"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
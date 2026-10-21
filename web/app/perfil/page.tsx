"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
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
  CloudRain,
  Mountain,
  Mail,
  BellRing,
  CalendarDays,
  Clock,
  Droplet,
  KeyRound,
  BadgeCheck,
  ChevronRight,
  Info,
  Camera,
  Sparkles,
  Plus,
  Pill,
  Stethoscope,
  ShieldCheck,
  Lock,
  ImagePlus,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTES
   ═══════════════════════════════════════════════════════════════════════ */

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

const PUBLICACOES_POR_PAGINA = 15;

// Abaixo desta idade a conta fica no modo restrito (sem foto/capa próprias,
// sem comentários e sem compartilhamento, com responsável legal obrigatório)
const IDADE_MINIMA_SEM_RESTRICAO = 16;

const TIPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Imagens padrão — não contam como "foto de perfil própria"
const AVATARES_PADRAO = ["/perfil.png", "/PluviteIcon.jpg"];

type Secao = "dados" | "emergencia" | "notificacoes" | "seguranca" | "publicacoes";
type Bloco = "pessoais" | "endereco" | "pcd" | "medico" | "contatoEmergencia" | null;
type Aviso = { tipo: "sucesso" | "erro"; texto: string } | null;

/* ═══════════════════════════════════════════════════════════════════════
   MINHAS PUBLICAÇÕES — tipos das ocorrências que o próprio cidadão
   reportou no feed
   ═══════════════════════════════════════════════════════════════════════ */

interface ComentarioPublicacao {
  id: string;
  autor: string;
  texto: string;
  tempo?: string;
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

const STATUS_ESTILO_PUB: Record<
  StatusPublicacao,
  { badge: string; ponto: string; icon: any; texto: string }
> = {
  Aguardando: {
    badge: "bg-red-50 text-red-700 border-red-200",
    ponto: "bg-red-500",
    icon: AlertTriangle,
    texto: "Aguardando",
  },
  "Em Andamento": {
    badge: "bg-amber-50 text-amber-800 border-amber-200",
    ponto: "bg-amber-500",
    icon: Wrench,
    texto: "Em Andamento",
  },
  Visualizado: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ponto: "bg-emerald-500",
    icon: Eye,
    texto: "Visualizado",
  },
  Concluído: {
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    ponto: "bg-slate-400",
    icon: CheckCircle,
    texto: "Concluído",
  },
};

const estiloDoStatus = (status: string) =>
  STATUS_ESTILO_PUB[status as StatusPublicacao] ?? STATUS_ESTILO_PUB.Aguardando;

const PERFIL_VAZIO = {
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
  banner_url: "",
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
};

type Perfil = typeof PERFIL_VAZIO;

/* ═══════════════════════════════════════════════════════════════════════
   FUNÇÕES AUXILIARES (fora do componente — não são recriadas a cada render)
   ═══════════════════════════════════════════════════════════════════════ */

// Texto relativo ("há 15 minutos", "há 2 horas"...) — mesma lógica do Feed
const tempoRelativo = (dataIso: string) => {
  const diffMs = Date.now() - new Date(dataIso).getTime();
  const minutos = Math.floor(diffMs / 60000);
  if (minutos < 1) return "Agora mesmo";
  if (minutos < 60) return `há ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
};

function formatarTelefone(valor: string) {
  const numeros = valor.replace(/\D/g, "").slice(0, 11);
  if (numeros.length === 0) return "";
  if (numeros.length <= 2) return numeros.replace(/^(\d*)/, "($1");
  if (numeros.length <= 6) return numeros.replace(/^(\d{2})(\d*)/, "($1) $2");
  if (numeros.length <= 10) return numeros.replace(/^(\d{2})(\d{4})(\d*)/, "($1) $2-$3");
  return numeros.replace(/^(\d{2})(\d{5})(\d*)/, "($1) $2-$3");
}

function formatarCep(valor: string) {
  const numeros = valor.replace(/\D/g, "").slice(0, 8);
  return numeros.length > 5 ? `${numeros.slice(0, 5)}-${numeros.slice(5)}` : numeros;
}

// data_nascimento vem como "AAAA-MM-DD"; o T00:00 evita o fuso deslocar o dia
function calcularIdade(dataNascimento: string) {
  if (!dataNascimento) return null;
  const nasc = new Date(`${dataNascimento.slice(0, 10)}T00:00:00`);
  if (isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const mes = hoje.getMonth() - nasc.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade >= 0 ? idade : null;
}

function formatarNascimento(dataNascimento: string) {
  if (!dataNascimento) return "";
  const d = new Date(`${dataNascimento.slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

function formatarData(dataIso: string | null, opcoes: Intl.DateTimeFormatOptions) {
  if (!dataIso) return "—";
  const d = new Date(dataIso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", opcoes);
}

function formatarDataHora(dataIso: string | null) {
  if (!dataIso) return "—";
  const d = new Date(dataIso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const gerarIniciais = (nome: string) =>
  nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

// Pontuação simples de 0 a 4 para o medidor de força da senha
function forcaDaSenha(senha: string) {
  let pontos = 0;
  if (senha.length >= 8) pontos++;
  if (/[A-Z]/.test(senha) && /[a-z]/.test(senha)) pontos++;
  if (/\d/.test(senha)) pontos++;
  if (/[^A-Za-z0-9]/.test(senha)) pontos++;
  return pontos;
}

const NIVEIS_SENHA = [
  { texto: "Muito fraca", cor: "bg-red-500", textoCor: "text-red-600" },
  { texto: "Fraca", cor: "bg-red-400", textoCor: "text-red-500" },
  { texto: "Razoável", cor: "bg-amber-400", textoCor: "text-amber-600" },
  { texto: "Boa", cor: "bg-blue-500", textoCor: "text-blue-600" },
  { texto: "Forte", cor: "bg-emerald-500", textoCor: "text-emerald-600" },
];

const CLASSE_INPUT =
  "w-full bg-white text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 border border-slate-200 outline-none mt-1 focus:border-[#091f75] focus:ring-2 focus:ring-[#091f75]/10 transition";

const NAO_INFORMADO = (
  <span className="text-slate-400 font-medium">Não informado</span>
);

export default function PerfilCidadao() {
  /* NAVEGACAO E ROTEAMENTO */
  const router = useRouter();

  /* ESTADOS GERAIS */
  const [salvandoBloco, setSalvandoBloco] = useState<Bloco>(null);
  const [salvandoCapa, setSalvandoCapa] = useState(false);
  // Data de nascimento como está salva no banco — é ela que decide o modo restrito,
  // não o que está sendo digitado no formulário
  const [nascimentoSalvo, setNascimentoSalvo] = useState("");
  const [saindo, setSaindo] = useState(false);
  const [editandoBloco, setEditandoBloco] = useState<Bloco>(null);
  const [perfilBackup, setPerfilBackup] = useState<Perfil | null>(null);
  const [secaoAtiva, setSecaoAtiva] = useState<Secao>("dados");
  const [buscandoCep, setBuscandoCep] = useState(false);

  /* AVISO FLUTUANTE (substitui os alert() do navegador) */
  const [aviso, setAviso] = useState<Aviso>(null);
  const timerAvisoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrarAviso = (tipo: "sucesso" | "erro", texto: string) => {
    setAviso({ tipo, texto });
    if (timerAvisoRef.current) clearTimeout(timerAvisoRef.current);
    timerAvisoRef.current = setTimeout(() => setAviso(null), 3500);
  };

  /* DADOS DO PERFIL DO CIDADÃO */
  const [perfil, setPerfil] = useState<Perfil>(PERFIL_VAZIO);

  /* INFORMAÇÕES DA CONTA (vindas do Supabase Auth) */
  const [contaInfo, setContaInfo] = useState({
    criadoEm: null as string | null,
    ultimoAcesso: null as string | null,
    provedor: "email",
    emailConfirmado: false,
  });

  /* TROCA DE SENHA */
  const [alterandoSenha, setAlterandoSenha] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [senha, setSenha] = useState({ atual: "", nova: "", confirmar: "" });

  /* PUBLICAÇÕES DO PRÓPRIO CIDADÃO */
  const [minhasPublicacoes, setMinhasPublicacoes] = useState<Publicacao[]>([]);
  const [carregandoPublicacoes, setCarregandoPublicacoes] = useState(false);
  const [publicacaoSelecionada, setPublicacaoSelecionada] = useState<string | null>(null);
  const [comentarioAtualPub, setComentarioAtualPub] = useState<Record<string, string>>({});
  const [filtroStatus, setFiltroStatus] = useState<"Todos" | StatusPublicacao>("Todos");
  const [limitePublicacoes, setLimitePublicacoes] = useState(PUBLICACOES_POR_PAGINA);

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

        const fotoDoProvedor = authUser.user_metadata?.avatar_url || "/PluviteIcon.jpg";
        const emailDoCadastro = authUser.email || "";

        if (ativo) {
          setContaInfo({
            criadoEm: authUser.created_at || null,
            ultimoAcesso: authUser.last_sign_in_at || null,
            provedor: authUser.app_metadata?.provider || "email",
            emailConfirmado: Boolean(authUser.email_confirmed_at),
          });
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
          setNascimentoSalvo(data.data_nascimento || "");
          setPerfil((prev) => ({
            ...prev,
            nome_completo: data.nome_completo || nomeDoCadastro,
            telefone: formatarTelefone(data.telefone || ""),
            data_nascimento: data.data_nascimento || "",
            cidade: data.cidade || "",
            bairro: data.bairro || "",
            cep: formatarCep(data.cep || ""),
            pcd: data.pcd === true || data.pcd === "true",
            avatar_url: data.avatar_url || fotoDoProvedor,
            banner_url: data.banner_url || "",
            tipo_deficiencia: data.tipo_deficiencia || "",
            tipo_sanguineo: data.tipo_sanguineo || "",
            alergias: data.alergias || "",
            condicoes_medicas: data.condicoes_medicas || "",
            medicamentos_uso: data.medicamentos_uso || "",
            contato_emergencia_nome: data.contato_emergencia_nome || "",
            contato_emergencia_telefone: formatarTelefone(data.contato_emergencia_telefone || ""),
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

    // Só recarrega em login/atualização de usuário — evita apagar uma edição
    // em andamento quando o token é renovado em segundo plano
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user) {
        carregarPerfil(session.user);
      }
    });

    return () => {
      ativo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  /* CARREGAR MINHAS PUBLICAÇÕES DO SUPABASE */
  const carregarMinhasPublicacoes = async (cidadaoIdAtual: string) => {
    setCarregandoPublicacoes(true);
    try {
      const { data: linhas, error: erroOcorrencias } = await supabase
        .from("ocorrencias")
        .select("*")
        .eq("autor_id", cidadaoIdAtual)
        .order("criado_em", { ascending: false });

      if (erroOcorrencias || !linhas) {
        console.error("Erro ao carregar minhas publicações:", erroOcorrencias);
        return;
      }

      // Busca curtidas e comentários só das ocorrências deste cidadão (não da tabela inteira)
      const ids = linhas.map((l: any) => l.id);
      let curtidasLinhas: any[] = [];
      let comentariosLinhas: any[] = [];

      if (ids.length > 0) {
        const [resCurtidas, resComentarios] = await Promise.all([
          supabase.from("curtidas").select("ocorrencia_id, usuario_id").in("ocorrencia_id", ids),
          supabase
            .from("comentarios")
            .select("id, ocorrencia_id, texto, criado_em, cidadao(nome_completo)")
            .in("ocorrencia_id", ids)
            .order("criado_em", { ascending: true }),
        ]);
        curtidasLinhas = resCurtidas.data || [];
        comentariosLinhas = resComentarios.data || [];
      }

      const publicacoesMontadas: Publicacao[] = linhas.map((linha: any) => {
        const curtidasDaOcorrencia = curtidasLinhas.filter((c) => c.ocorrencia_id === linha.id);
        const comentariosDaOcorrencia = comentariosLinhas
          .filter((c) => c.ocorrencia_id === linha.id)
          .map((c) => ({
            id: c.id,
            autor: c.cidadao?.nome_completo || "Cidadão",
            texto: c.texto,
            tempo: c.criado_em ? tempoRelativo(c.criado_em) : undefined,
          }));

        return {
          id: linha.id,
          tipo: linha.tipo,
          cidade: linha.cidade,
          bairro: linha.bairro,
          endereco: linha.endereco,
          criadoEm: linha.criado_em,
          tempo: tempoRelativo(linha.criado_em),
          status: linha.status || "Aguardando",
          descricao: linha.descricao || "",
          imagemUrl: linha.imagem_url,
          curtido: curtidasDaOcorrencia.some((c) => c.usuario_id === cidadaoIdAtual),
          curtidas: curtidasDaOcorrencia.length,
          comentarios: comentariosDaOcorrencia,
        };
      });

      setMinhasPublicacoes(publicacoesMontadas);
    } finally {
      setCarregandoPublicacoes(false);
    }
  };

  useEffect(() => {
    if (cidadaoId) carregarMinhasPublicacoes(cidadaoId);
  }, [cidadaoId]);

  /* VALORES CALCULADOS */
  const idade = calcularIdade(perfil.data_nascimento);
  const idadeConfirmada = calcularIdade(nascimentoSalvo);
  const contaRestrita = idadeConfirmada !== null && idadeConfirmada < IDADE_MINIMA_SEM_RESTRICAO;
  const temFotoPropria = Boolean(perfil.avatar_url) && !AVATARES_PADRAO.includes(perfil.avatar_url);
  const alertasAtivos = perfil.notif_chuva_forte || perfil.notif_deslizamento;
  const entraComSenha = contaInfo.provedor === "email";

  const estatisticas = useMemo(() => {
    const curtidas = minhasPublicacoes.reduce((s, p) => s + p.curtidas, 0);
    const comentarios = minhasPublicacoes.reduce((s, p) => s + p.comentarios.length, 0);
    const resolvidas = minhasPublicacoes.filter((p) => p.status === "Concluído").length;
    return [
      { label: "Publicações", valor: minhasPublicacoes.length, icon: ImageIcon, cor: "bg-blue-100 text-blue-700" },
      { label: "Curtidas recebidas", valor: curtidas, icon: ThumbsUp, cor: "bg-indigo-100 text-indigo-700" },
      { label: "Comentários", valor: comentarios, icon: MessageSquare, cor: "bg-amber-100 text-amber-700" },
      { label: "Ocorrências resolvidas", valor: resolvidas, icon: CheckCircle, cor: "bg-emerald-100 text-emerald-700" },
    ];
  }, [minhasPublicacoes]);

  const contagemPorStatus = useMemo(() => {
    const contagem: Record<string, number> = { Todos: minhasPublicacoes.length };
    (Object.keys(STATUS_ESTILO_PUB) as StatusPublicacao[]).forEach((s) => {
      contagem[s] = minhasPublicacoes.filter((p) => p.status === s).length;
    });
    return contagem;
  }, [minhasPublicacoes]);

  const publicacoesFiltradas =
    filtroStatus === "Todos"
      ? minhasPublicacoes
      : minhasPublicacoes.filter((p) => p.status === filtroStatus);

  // Itens que contam para o "perfil completo"
  const itensCompletude: { label: string; ok: boolean; secao: Secao }[] = [
    { label: "Foto de perfil", ok: temFotoPropria, secao: "dados" },
    { label: "Telefone", ok: Boolean(perfil.telefone), secao: "dados" },
    { label: "Data de nascimento", ok: Boolean(perfil.data_nascimento), secao: "dados" },
    { label: "Cidade e bairro", ok: Boolean(perfil.cidade && perfil.bairro), secao: "dados" },
    { label: "CEP", ok: Boolean(perfil.cep), secao: "dados" },
    { label: "Tipo sanguíneo", ok: Boolean(perfil.tipo_sanguineo), secao: "emergencia" },
    {
      label: contaRestrita ? "Responsável legal" : "Contato de emergência",
      ok: Boolean(perfil.contato_emergencia_nome && perfil.contato_emergencia_telefone),
      secao: "emergencia",
    },
  ];
  const itensFaltando = itensCompletude.filter((i) => !i.ok);
  const percentualCompleto = Math.round(
    ((itensCompletude.length - itensFaltando.length) / itensCompletude.length) * 100,
  );
  const corCompletude =
    percentualCompleto === 100
      ? "from-emerald-400 to-emerald-600"
      : percentualCompleto >= 50
        ? "from-blue-500 to-blue-600"
        : "from-amber-400 to-amber-500";

  const emergenciaIncompleta = itensCompletude.some((i) => i.secao === "emergencia" && !i.ok);

  /* EDIÇÃO DE BLOCOS — guarda uma cópia pra poder desfazer ao cancelar */
  const iniciarEdicao = (bloco: Bloco) => {
    const base = perfilBackup ?? perfil;
    setPerfil(base);
    setPerfilBackup(base);
    setEditandoBloco(bloco);
  };

  const cancelarEdicao = () => {
    if (perfilBackup) setPerfil(perfilBackup);
    setPerfilBackup(null);
    setEditandoBloco(null);
  };

  const trocarSecao = (secao: Secao) => {
    if (editandoBloco) cancelarEdicao();
    setSecaoAtiva(secao);
  };

  /* MANIPULACAO DE CAMPOS DE FORMULARIO */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === "telefone" || name === "contato_emergencia_telefone") {
      setPerfil((prev) => ({ ...prev, [name]: formatarTelefone(value) }));
      return;
    }

    if (name === "cep") {
      const cepFormatado = formatarCep(value);
      setPerfil((prev) => ({ ...prev, cep: cepFormatado }));
      if (cepFormatado.replace(/\D/g, "").length === 8) buscarCep(cepFormatado);
      return;
    }

    setPerfil((prev) => ({ ...prev, [name]: value || "" }));
  };

  /* PREENCHE CIDADE E BAIRRO A PARTIR DO CEP (ViaCEP) */
  const buscarCep = async (cep: string) => {
    const numeros = cep.replace(/\D/g, "");
    if (numeros.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${numeros}/json/`);
      const dados = await resposta.json();
      if (dados.erro) {
        mostrarAviso("erro", "CEP não encontrado. Confira os números.");
        return;
      }
      setPerfil((prev) => ({
        ...prev,
        bairro: dados.bairro || prev.bairro,
        cidade: dados.localidade || prev.cidade,
      }));
    } catch {
      // Sem conexão com o ViaCEP — o cidadão pode preencher à mão
    } finally {
      setBuscandoCep(false);
    }
  };

  /* UPLOAD DE FOTO DE PERFIL */
  const handleTrocarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (contaRestrita) {
      e.target.value = "";
      mostrarAviso("erro", "Contas de menores de 16 anos não podem enviar foto de perfil.");
      return;
    }
    const file = e.target.files[0];
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      mostrarAviso("erro", "Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      mostrarAviso("erro", "A imagem precisa ter no máximo 5 MB.");
      return;
    }

    const fotoAnterior = perfil.avatar_url;
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

      const { data: linha, error: upsertError } = await supabase
        .from("cidadao")
        .upsert(
          {
            auth_id: user.id,
            email: user.email,
            avatar_url: publicUrl,
            nome_completo: perfil.nome_completo || "Usuário",
          },
          { onConflict: "auth_id" },
        )
        .select("id")
        .single();
      if (upsertError) throw upsertError;
      if (linha?.id) setCidadaoId(linha.id);

      setPerfil((prev) => ({ ...prev, avatar_url: publicUrl }));
      if (perfilBackup) setPerfilBackup({ ...perfilBackup, avatar_url: publicUrl });
      mostrarAviso("sucesso", "Foto de perfil atualizada!");
    } catch (error: any) {
      console.error("Erro ao salvar a foto:", error);
      setPerfil((prev) => ({ ...prev, avatar_url: fotoAnterior }));
      mostrarAviso("erro", "Erro ao enviar a imagem: " + error.message);
    } finally {
      URL.revokeObjectURL(urlProvisoria);
    }
  };

  /* CAPA DO PERFIL (banner estilo YouTube) — salva em cidadao.banner_url */
  const mensagemErroCapa = (error: any) =>
    String(error?.message || "").includes("banner_url")
      ? "Falta a coluna banner_url (text) na tabela cidadao do Supabase."
      : "Erro ao salvar a capa: " + (error?.message || "tente novamente.");

  const salvarCapaNoBanco = async (bannerUrl: string | null) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada. Entre novamente.");

    const { error } = await supabase.from("cidadao").upsert(
      {
        auth_id: user.id,
        email: user.email,
        nome_completo: perfil.nome_completo || "Usuário",
        banner_url: bannerUrl,
      },
      { onConflict: "auth_id" },
    );
    if (error) throw error;
  };

  const handleTrocarCapa = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (contaRestrita) {
      e.target.value = "";
      mostrarAviso("erro", "Contas de menores de 16 anos não podem enviar capa.");
      return;
    }
    const file = e.target.files[0];
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      mostrarAviso("erro", "Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      mostrarAviso("erro", "A capa precisa ter no máximo 8 MB.");
      return;
    }

    const capaAnterior = perfil.banner_url;
    const urlProvisoria = URL.createObjectURL(file);
    setPerfil((prev) => ({ ...prev, banner_url: urlProvisoria }));
    setSalvandoCapa(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Entre novamente.");

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/capa-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);

      await salvarCapaNoBanco(publicUrl);

      setPerfil((prev) => ({ ...prev, banner_url: publicUrl }));
      if (perfilBackup) setPerfilBackup({ ...perfilBackup, banner_url: publicUrl });
      mostrarAviso("sucesso", "Capa atualizada!");
    } catch (error: any) {
      console.error("Erro ao salvar a capa:", error);
      setPerfil((prev) => ({ ...prev, banner_url: capaAnterior }));
      mostrarAviso("erro", mensagemErroCapa(error));
    } finally {
      setSalvandoCapa(false);
      setTimeout(() => URL.revokeObjectURL(urlProvisoria), 1000);
    }
  };

  const removerCapa = async () => {
    const capaAnterior = perfil.banner_url;
    setPerfil((prev) => ({ ...prev, banner_url: "" }));
    setSalvandoCapa(true);
    try {
      await salvarCapaNoBanco(null);
      if (perfilBackup) setPerfilBackup({ ...perfilBackup, banner_url: "" });
      mostrarAviso("sucesso", "Capa removida.");
    } catch (error: any) {
      setPerfil((prev) => ({ ...prev, banner_url: capaAnterior }));
      mostrarAviso("erro", mensagemErroCapa(error));
    } finally {
      setSalvandoCapa(false);
    }
  };

  /* SALVAR DADOS NO SUPABASE */
  const salvarDados = async (bloco: Bloco) => {
    // Confere a data de nascimento antes de salvar
    if (perfil.data_nascimento && perfil.data_nascimento !== nascimentoSalvo) {
      const novaIdade = calcularIdade(perfil.data_nascimento);
      if (novaIdade === null || novaIdade > 120 || new Date(`${perfil.data_nascimento}T00:00:00`) > new Date()) {
        mostrarAviso("erro", "Data de nascimento inválida.");
        return;
      }
      if (novaIdade < IDADE_MINIMA_SEM_RESTRICAO && !contaRestrita) {
        const confirmar = window.confirm(
          `Com essa data você tem ${novaIdade} anos. Contas de menores de ${IDADE_MINIMA_SEM_RESTRICAO} anos ficam no modo restrito e a data de nascimento não poderá mais ser alterada por aqui. Confirmar?`,
        );
        if (!confirmar) return;
      }
    }

    setSalvandoBloco(bloco);
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

      const { data: linha, error } = await supabase
        .from("cidadao")
        .upsert(dadosParaSalvar, { onConflict: "auth_id" })
        .select("id")
        .single();

      if (error) throw error;
      if (linha?.id && !cidadaoId) setCidadaoId(linha.id);
      setNascimentoSalvo(perfil.data_nascimento || "");

      setEditandoBloco(null);
      setPerfilBackup(null);
      mostrarAviso("sucesso", "Dados salvos com sucesso!");
    } catch (err: any) {
      console.error("Erro ao salvar dados no Supabase:", err);
      mostrarAviso("erro", "Erro ao salvar: " + err.message);
    } finally {
      setSalvandoBloco(null);
    }
  };

  /* ALTERAR PREFERENCIAS DE NOTIFICACAO */
  const alternarNotificacao = async (
    campo: "notif_chuva_forte" | "notif_deslizamento" | "notif_email" | "notif_push",
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
      mostrarAviso("erro", "Erro ao salvar preferência: " + err.message);
    }
  };

  /* TROCAR SENHA (confere a senha atual antes de atualizar) */
  const salvarNovaSenha = async () => {
    if (!senha.atual) return mostrarAviso("erro", "Digite sua senha atual.");
    if (senha.nova.length < 8)
      return mostrarAviso("erro", "A nova senha precisa ter pelo menos 8 caracteres.");
    if (senha.nova !== senha.confirmar)
      return mostrarAviso("erro", "A confirmação não é igual à nova senha.");

    setSalvandoSenha(true);
    try {
      const { error: erroLogin } = await supabase.auth.signInWithPassword({
        email: perfil.email,
        password: senha.atual,
      });
      if (erroLogin) {
        mostrarAviso("erro", "A senha atual está incorreta.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: senha.nova });
      if (error) throw error;

      setSenha({ atual: "", nova: "", confirmar: "" });
      setAlterandoSenha(false);
      mostrarAviso("sucesso", "Senha alterada com sucesso!");
    } catch (err: any) {
      mostrarAviso("erro", "Erro ao alterar a senha: " + err.message);
    } finally {
      setSalvandoSenha(false);
    }
  };

  const enviarLinkRedefinicao = async () => {
    if (!perfil.email) return mostrarAviso("erro", "E-mail não encontrado.");
    const { error } = await supabase.auth.resetPasswordForEmail(perfil.email);
    if (error) mostrarAviso("erro", "Erro ao enviar e-mail: " + error.message);
    else mostrarAviso("sucesso", "Link de redefinição enviado para o seu e-mail!");
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
          ? { ...p, curtido: vaiCurtir, curtidas: vaiCurtir ? p.curtidas + 1 : p.curtidas - 1 }
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
    if (!cidadaoId || contaRestrita) return;

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
              {
                id: `temp-${Date.now()}`,
                autor: perfil.nome_completo || "Você",
                texto,
                tempo: "Agora mesmo",
              },
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
      mostrarAviso("erro", "Não foi possível enviar o comentário.");
    }
  };

  /* COMPARTILHAR UMA PUBLICAÇÃO PRÓPRIA — leva pro Feed, que já abre o post pelo ?ocorrencia=id */
  const handleCompartilharPub = async (pub: Publicacao) => {
    if (typeof window === "undefined" || contaRestrita) return;
    const link = `${window.location.origin}/Feed?ocorrencia=${pub.id}`;
    const texto = `${pub.tipo} em ${pub.bairro}, ${pub.cidade} — via Pluvite`;

    setMenuAcoesAberto(false);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Pluvite", text: texto, url: link });
      } catch {
        // Usuário cancelou o compartilhamento nativo
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setLinkCopiadoPub(true);
      setTimeout(() => setLinkCopiadoPub(false), 2000);
    } catch {
      // Navegador sem permissão de clipboard
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
      mostrarAviso("erro", "Preencha o tipo, a cidade, o bairro e o endereço antes de salvar.");
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
      mostrarAviso("erro", "Não foi possível salvar as alterações: " + error.message);
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
    mostrarAviso("sucesso", "Publicação atualizada!");
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
      mostrarAviso("erro", "Não foi possível apagar a publicação: " + error.message);
      return;
    }

    setMinhasPublicacoes((prev) => prev.filter((p) => p.id !== id));
    setPublicacaoSelecionada(null);
    setEditandoPublicacao(false);
    setEdicaoPub(null);
    mostrarAviso("sucesso", "Publicação apagada.");
  };

  /* FECHAR O MODAL DE PUBLICAÇÃO */
  const fecharModal = () => {
    setPublicacaoSelecionada(null);
    cancelarEdicaoPublicacao();
    setMenuAcoesAberto(false);
  };

  // Fecha o modal com a tecla Esc
  useEffect(() => {
    if (!publicacaoSelecionada) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharModal();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [publicacaoSelecionada]);

  /* LOGOUT DO USUARIO */
  const handleSair = async () => {
    setSaindo(true);
    try {
      await supabase.auth.signOut();

      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
      }

      setPerfil(PERFIL_VAZIO);
      setNascimentoSalvo("");
      router.push("/");
    } catch (err: any) {
      console.error("Erro ao sair:", err);
      mostrarAviso("erro", "Erro ao sair da conta: " + err.message);
    } finally {
      setSaindo(false);
    }
  };

  /* ITENS DO MENU DE SEÇÕES */
  const itensMenu: { id: Secao; label: string; icon: React.ReactNode; contador?: number; alerta?: boolean }[] = [
    { id: "dados", label: "Meus Dados", icon: <User size={16} /> },
    { id: "publicacoes", label: "Minhas Publicações", icon: <ImageIcon size={16} />, contador: minhasPublicacoes.length },
    { id: "emergencia", label: "Dados de Emergência", icon: <HeartPulse size={16} />, alerta: emergenciaIncompleta },
    { id: "notificacoes", label: "Notificações", icon: <Bell size={16} /> },
    { id: "seguranca", label: "Segurança", icon: <Shield size={16} /> },
  ];

  /* ═══════════════════════════════════════════════════════════════════
     PEDAÇOS DE INTERFACE REUTILIZÁVEIS
     São funções de render (e não componentes) de propósito: componentes
     declarados dentro do corpo são recriados a cada render e fazem os
     inputs perderem o foco a cada tecla digitada.
     ═══════════════════════════════════════════════════════════════════ */

  const renderAvatar = (classeTamanho: string, classeTexto: string) => (
    <div
      className={`${classeTamanho} rounded-full bg-blue-50 overflow-hidden flex items-center justify-center text-[#091f75] font-black select-none shrink-0 ${classeTexto}`}
    >
      {perfil.avatar_url && !contaRestrita ? (
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
      ) : (
        gerarIniciais(perfil.nome_completo || "Você") || "P"
      )}
    </div>
  );

  // Capa padrão — mesmo clima do banner do Feed: azul-marinho, grade de pontos,
  // linhas de rota e alfinetes de mapa bem discretos
  const renderCapaPadrao = () => (
    <>
      <div className="absolute inset-0 bg-gradient-to-br from-[#0b1f6e] via-[#0d2580] to-[#12329a]" />
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1200 220"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M-20 150 C 180 80, 320 210, 520 140 S 860 40, 1220 120" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <path d="M-20 60 C 220 120, 420 20, 640 90 S 980 190, 1220 70" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <path d="M760 240 C 800 160, 880 110, 940 -20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <path d="M-20 195 C 260 175, 520 205, 760 165 S 1100 155, 1220 180" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeDasharray="3 7" vectorEffect="non-scaling-stroke" />
      </svg>
      {[
        { left: "24%", top: "30%" },
        { left: "47%", top: "58%" },
        { left: "66%", top: "24%" },
        { left: "84%", top: "52%" },
      ].map((pos, i) => (
        <MapPin key={i} size={16} className="absolute text-white/30" style={pos} />
      ))}
    </>
  );

  const renderCardHeader = (icon: React.ReactNode, title: string, bloco: Bloco, subtitulo?: string) => (
    <div className="flex justify-between items-start gap-3 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 shrink-0">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 leading-tight">{title}</h3>
          {subtitulo && <p className="text-[11px] text-slate-500 mt-0.5">{subtitulo}</p>}
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        {editandoBloco === bloco ? (
          <>
            <button
              onClick={cancelarEdicao}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-all"
            >
              <X size={13} />
              <span className="hidden sm:inline">Cancelar</span>
            </button>
            <button
              onClick={() => salvarDados(bloco)}
              disabled={salvandoBloco === bloco}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white bg-[#091f75] hover:bg-[#0f35a0] rounded-lg cursor-pointer transition-all disabled:opacity-60"
            >
              {salvandoBloco === bloco ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              Salvar
            </button>
          </>
        ) : (
          <button
            onClick={() => iniciarEdicao(bloco)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-[#091f75] rounded-lg hover:bg-blue-50 transition-all cursor-pointer"
          >
            <Pencil size={12} />
            Editar
          </button>
        )}
      </div>
    </div>
  );

  const renderCampo = (
    label: string,
    icone: React.ReactNode,
    editando: boolean,
    visualizacao: React.ReactNode,
    edicao: React.ReactNode,
    classeExtra = "",
  ) => (
    <div
      key={label}
      className={`bg-slate-50 hover:bg-blue-50/40 p-3 rounded-xl border border-slate-100 hover:border-blue-100 transition ${classeExtra}`}
    >
      <span className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase tracking-wide mb-1">
        {icone}
        {label}
      </span>
      {editando ? (
        edicao
      ) : (
        <span className="text-[13px] font-semibold text-slate-800 block break-words">{visualizacao}</span>
      )}
    </div>
  );

  const nivelSenha = NIVEIS_SENHA[forcaDaSenha(senha.nova)];

  return (
    <main className="w-full mt-15 bg-[#f4f6fb] font-sans antialiased min-h-full px-3 sm:px-4 lg:px-5 py-5">
      <div className="w-full space-y-5">
        {/* ═══════════════ CAPA + IDENTIDADE ═══════════════ */}
        <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
          {/* CAPA — imagem enviada pelo usuário ou o padrão no estilo do Feed */}
          <div className="relative h-36 sm:h-48 md:h-52 bg-[#0b1f6e] overflow-hidden">
            {perfil.banner_url && !contaRestrita ? (
              <img
                src={perfil.banner_url}
                alt="Capa do perfil"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              renderCapaPadrao()
            )}

            {/* AÇÕES DA CAPA (escondidas no modo restrito) */}
            <div className={`absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-2 ${contaRestrita ? "hidden" : ""}`}>
              {perfil.banner_url && (
                <button
                  onClick={removerCapa}
                  disabled={salvandoCapa}
                  title="Remover capa"
                  className="p-2 rounded-lg bg-black/35 hover:bg-black/55 text-white backdrop-blur-sm transition cursor-pointer disabled:opacity-60"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <label
                htmlFor="input-capa"
                title="Tamanho recomendado: 1500 × 400 px"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/90 hover:bg-white text-[#0b1f6e] text-[11px] font-bold shadow-sm backdrop-blur-sm transition cursor-pointer"
              >
                {salvandoCapa ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                {perfil.banner_url ? "Trocar capa" : "Adicionar capa"}
              </label>
              <input
                id="input-capa"
                type="file"
                accept="image/*"
                onChange={handleTrocarCapa}
                disabled={salvandoCapa}
                className="hidden"
              />
            </div>
          </div>

          <div className="px-5 sm:px-8 pb-6">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
              {/* AVATAR — só ele sobe por cima da capa */}
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 -mt-14 sm:-mt-16 z-10">
                <div className="w-full h-full rounded-full ring-4 ring-white shadow-md overflow-hidden bg-white">
                  {renderAvatar("w-full h-full", "text-4xl")}
                </div>
                <label
                  htmlFor="input-avatar"
                  title="Trocar foto"
                  hidden={contaRestrita}
                  className="absolute bottom-1 right-1 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-md cursor-pointer transition-all ring-2 ring-white flex items-center justify-center active:scale-90"
                >
                  <Camera size={13} />
                </label>
                <input
                  id="input-avatar"
                  type="file"
                  accept="image/*"
                  onChange={handleTrocarFoto}
                  className="hidden"
                />
              </div>

              {/* NOME, SELOS E AÇÕES — inteiros na área branca */}
              <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-start md:justify-between gap-4 sm:pt-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight truncate">
                      {perfil.nome_completo || "Usuário"}
                    </h1>
                    {contaInfo.emailConfirmado && (
                      <BadgeCheck size={20} className="text-blue-600 shrink-0" aria-label="E-mail verificado" />
                    )}
                  </div>
                  {perfil.email && (
                    <p className="text-xs text-slate-500 font-medium truncate mt-0.5">{perfil.email}</p>
                  )}

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-full border border-blue-100">
                      <MapPin size={11} />
                      {perfil.cidade
                        ? `${perfil.bairro ? perfil.bairro + ", " : ""}${perfil.cidade}`
                        : "Cidade não informada"}
                    </span>
                    {contaInfo.criadoEm && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 text-slate-600 text-[11px] font-bold rounded-full border border-slate-200">
                        <CalendarDays size={11} />
                        Membro desde {formatarData(contaInfo.criadoEm, { month: "long", year: "numeric" })}
                      </span>
                    )}
                    {idade !== null && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 text-slate-600 text-[11px] font-bold rounded-full border border-slate-200">
                        <User size={11} />
                        {idade} anos
                      </span>
                    )}
                    {perfil.tipo_sanguineo && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 text-[11px] font-bold rounded-full border border-red-100">
                        <Droplet size={11} />
                        {perfil.tipo_sanguineo}
                      </span>
                    )}
                    {perfil.pcd && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-50 text-violet-700 text-[11px] font-bold rounded-full border border-violet-100">
                        <Accessibility size={11} />
                        PCD
                      </span>
                    )}
                    {contaRestrita && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 text-[11px] font-bold rounded-full border border-amber-200">
                        <ShieldCheck size={11} />
                        Conta protegida · menor de {IDADE_MINIMA_SEM_RESTRICAO}
                      </span>
                    )}
                  </div>
                </div>

                {/* STATUS DOS ALERTAS + SAIR */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => trocarSecao("notificacoes")}
                    className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-lg border cursor-pointer transition ${alertasAtivos
                      ? "text-emerald-700 bg-emerald-50 border-emerald-100 hover:bg-emerald-100"
                      : "text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-100"
                      }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${alertasAtivos ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}
                    />
                    {alertasAtivos ? "Alertas ativos" : "Alertas pausados"}
                  </button>
                  <button
                    onClick={handleSair}
                    disabled={saindo}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-red-500 hover:text-white bg-red-50 hover:bg-red-500 border border-red-100 hover:border-red-500 rounded-lg px-3 py-2 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {saindo ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                    {saindo ? "Saindo..." : "Sair da conta"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ABAS DO PERFIL — estilo canal do YouTube */}
          <nav className="border-t border-slate-100 px-2 sm:px-6">
            <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
              {itensMenu.map((item) => {
                const ativo = secaoAtiva === item.id;
                return (
                  <li key={item.id} className="shrink-0">
                    <button
                      onClick={() => trocarSecao(item.id)}
                      className={`relative flex items-center gap-2 px-3 sm:px-4 py-3.5 text-xs sm:text-[13px] font-bold whitespace-nowrap transition-colors cursor-pointer ${ativo ? "text-[#0b1f6e]" : "text-slate-500 hover:text-slate-800"
                        }`}
                    >
                      {item.icon}
                      {item.label}
                      {item.contador !== undefined && item.contador > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-md ${ativo ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {item.contador}
                        </span>
                      )}
                      {item.alerta && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Informações pendentes" />
                      )}
                      <span
                        className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t-full transition-colors ${ativo ? "bg-blue-600" : "bg-transparent"}`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </section>

        {/* ═══════════════ AVISO DO MODO RESTRITO ═══════════════ */}
        {contaRestrita && (
          <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-4">
            <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <ShieldCheck size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-amber-900">
                Perfil restrito para menores de {IDADE_MINIMA_SEM_RESTRICAO} anos
              </h2>
              <p className="text-xs text-amber-800 leading-relaxed mt-0.5">
                Para sua proteção, sua foto e capa não aparecem, comentários e compartilhamento ficam
                desativados nas suas publicações e é preciso cadastrar um responsável legal. Os alertas de
                chuva e os dados de emergência continuam funcionando normalmente.
              </p>
            </div>
            {!(perfil.contato_emergencia_nome && perfil.contato_emergencia_telefone) && (
              <button
                onClick={() => trocarSecao("emergencia")}
                className="self-start md:self-auto shrink-0 px-3.5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition cursor-pointer"
              >
                Cadastrar responsável
              </button>
            )}
          </section>
        )}

        {/* ═══════════════ NÚMEROS DA PARTICIPAÇÃO ═══════════════ */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {estatisticas.map((e) => {
            const Icone = e.icon;
            return (
              <div
                key={e.label}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex items-center gap-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${e.cor}`}>
                  <Icone size={19} />
                </span>
                <div className="min-w-0">
                  <p className="text-2xl font-black text-slate-900 leading-none">
                    {carregandoPublicacoes ? "–" : e.valor}
                  </p>
                  <p className="text-xs text-slate-500 font-semibold mt-1 truncate">{e.label}</p>
                </div>
              </div>
            );
          })}
        </section>

        {/* ═══════════════ CONTEÚDO DA ABA ═══════════════ */}
        <div>
          <div>
            {/* ─────────── MEUS DADOS ─────────── */}
            {secaoAtiva === "dados" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 flex flex-col gap-5">

                  {/* INFORMACOES PESSOAIS */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    {renderCardHeader(<User size={15} />, "Informações Pessoais", "pessoais")}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {renderCampo(
                        "Nome completo",
                        <User size={11} />,
                        editandoBloco === "pessoais",
                        perfil.nome_completo || NAO_INFORMADO,
                        <input
                          type="text"
                          name="nome_completo"
                          value={perfil.nome_completo}
                          onChange={handleChange}
                          className={CLASSE_INPUT}
                        />,
                      )}
                      {renderCampo(
                        "Telefone / Celular",
                        <Phone size={11} />,
                        editandoBloco === "pessoais",
                        perfil.telefone || NAO_INFORMADO,
                        <input
                          type="tel"
                          name="telefone"
                          placeholder="(00) 00000-0000"
                          maxLength={15}
                          value={perfil.telefone}
                          onChange={handleChange}
                          className={CLASSE_INPUT}
                        />,
                      )}
                      {renderCampo(
                        "Data de nascimento",
                        <CalendarDays size={11} />,
                        editandoBloco === "pessoais",
                        perfil.data_nascimento ? (
                          <>
                            {formatarNascimento(perfil.data_nascimento)}
                            {idade !== null && (
                              <span className="text-slate-400 font-medium"> · {idade} anos</span>
                            )}
                          </>
                        ) : (
                          NAO_INFORMADO
                        ),
                        contaRestrita ? (
                          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800 mt-1">
                            {formatarNascimento(perfil.data_nascimento)}
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                              <Lock size={11} />
                              bloqueada · fale com o suporte para corrigir
                            </span>
                          </span>
                        ) : (
                          <input
                            type="date"
                            name="data_nascimento"
                            max={new Date().toISOString().slice(0, 10)}
                            value={perfil.data_nascimento}
                            onChange={handleChange}
                            className={CLASSE_INPUT}
                          />
                        ),
                      )}
                      {renderCampo(
                        "E-mail",
                        <Mail size={11} />,
                        false,
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{perfil.email || NAO_INFORMADO}</span>
                          {contaInfo.emailConfirmado && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 shrink-0">
                              <BadgeCheck size={12} />
                              verificado
                            </span>
                          )}
                        </span>,
                        null,
                      )}
                    </div>
                  </div>

                  {/* ENDEREÇO */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    {renderCardHeader(
                      <MapPin size={15} />,
                      "Endereço",
                      "endereco",
                      "Usado para enviar alertas da sua região.",
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {renderCampo(
                        "CEP",
                        <MapPin size={11} />,
                        editandoBloco === "endereco",
                        perfil.cep || NAO_INFORMADO,
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            name="cep"
                            placeholder="00000-000"
                            maxLength={9}
                            value={perfil.cep}
                            onChange={handleChange}
                            className={CLASSE_INPUT}
                          />
                          {buscandoCep && (
                            <Loader2
                              size={13}
                              className="absolute right-2 top-1/2 -translate-y-1/3 text-slate-400 animate-spin"
                            />
                          )}
                        </div>,
                      )}
                      {renderCampo(
                        "Cidade",
                        <MapPin size={11} />,
                        editandoBloco === "endereco",
                        perfil.cidade || NAO_INFORMADO,
                        <select name="cidade" value={perfil.cidade} onChange={handleChange} className={CLASSE_INPUT}>
                          <option value="">Selecione...</option>
                          {perfil.cidade && !(CIDADES as readonly string[]).includes(perfil.cidade) && (
                            <option value={perfil.cidade}>{perfil.cidade}</option>
                          )}
                          {CIDADES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>,
                      )}
                      {renderCampo(
                        "Bairro",
                        <MapPin size={11} />,
                        editandoBloco === "endereco",
                        perfil.bairro || NAO_INFORMADO,
                        <input
                          type="text"
                          name="bairro"
                          value={perfil.bairro}
                          onChange={handleChange}
                          className={CLASSE_INPUT}
                        />,
                      )}
                    </div>

                    {editandoBloco === "endereco" && (
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-3">
                        <Info size={12} />
                        Digite o CEP que a cidade e o bairro são preenchidos automaticamente.
                      </p>
                    )}
                  </div>

                  {/* ACESSIBILIDADE */}
                  <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    {renderCardHeader(
                      <Accessibility size={15} />,
                      "Acessibilidade",
                      "pcd",
                      "Ajuda as equipes a priorizar quem precisa de apoio na evacuação.",
                    )}

                    {editandoBloco === "pcd" ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={perfil.pcd}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setPerfil((prev) => ({
                                ...prev,
                                pcd: checked,
                                tipo_deficiencia: checked ? prev.tipo_deficiencia : "",
                              }));
                            }}
                            className="accent-[#091f75] w-4 h-4"
                          />
                          Sou pessoa com deficiência
                        </label>
                        {perfil.pcd && (
                          <input
                            type="text"
                            name="tipo_deficiencia"
                            placeholder="Qual deficiência? Ex: visual, mobilidade reduzida..."
                            value={perfil.tipo_deficiencia}
                            onChange={handleChange}
                            className={`${CLASSE_INPUT} mt-0 flex-1`}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                        <span
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${perfil.pcd
                            ? "bg-violet-50 text-violet-700 border-violet-100"
                            : "bg-white text-slate-500 border-slate-200"
                            }`}
                        >
                          {perfil.pcd ? "Pessoa com deficiência" : "Não possui deficiência"}
                        </span>
                        {perfil.pcd && perfil.tipo_deficiencia && (
                          <span className="text-xs font-semibold text-slate-600">{perfil.tipo_deficiencia}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <aside className="flex flex-col gap-5">
                  {/* COMPLETUDE DO PERFIL */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-2.5">
                      <h3 className="text-sm font-bold text-slate-800">Perfil completo</h3>
                      <span className="text-lg font-black text-slate-800">{percentualCompleto}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${corCompletude} transition-all duration-700`}
                        style={{ width: `${Math.max(percentualCompleto, 3)}%` }}
                      />
                    </div>

                    {itensFaltando.length === 0 ? (
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 mt-3">
                        <Sparkles size={14} />
                        Tudo preenchido. Obrigado!
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-0.5">
                        {itensFaltando.slice(0, 4).map((item) => (
                          <li key={item.label}>
                            <button
                              onClick={() => trocarSecao(item.secao)}
                              className="w-full flex items-center gap-2 text-left text-xs font-semibold text-slate-600 hover:text-blue-700 py-1.5 cursor-pointer transition"
                            >
                              <Plus size={13} className="text-blue-500 shrink-0" />
                              <span className="flex-1">Adicionar {item.label.toLowerCase()}</span>
                              <ChevronRight size={13} className="text-slate-300 shrink-0" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="flex items-start gap-1.5 text-[11px] text-slate-400 leading-relaxed mt-3 pt-3 border-t border-slate-100">
                      <Info size={12} className="mt-0.5 shrink-0" />
                      Um perfil completo ajuda a Defesa Civil a te alertar e a te atender mais rápido numa emergência.
                    </p>
                  </div>

                  {/* ATIVIDADE RECENTE — sempre no máximo 3 itens, não cresce com o número de posts */}
                  <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-slate-800">Atividade recente</h3>
                      {minhasPublicacoes.length > 0 && (
                        <button
                          onClick={() => trocarSecao("publicacoes")}
                          className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                        >
                          Ver todas ({minhasPublicacoes.length})
                        </button>
                      )}
                    </div>

                    {carregandoPublicacoes ? (
                      <div className="py-4 flex justify-center">
                        <Loader2 size={18} className="text-slate-300 animate-spin" />
                      </div>
                    ) : minhasPublicacoes.length === 0 ? (
                      <div className="text-center py-3">
                        <p className="text-xs text-slate-400 font-medium mb-3">
                          Você ainda não reportou nenhuma ocorrência.
                        </p>
                        <button
                          onClick={() => router.push("/Feed")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#091f75] hover:bg-[#0f35a0] rounded-lg transition cursor-pointer"
                        >
                          <Plus size={13} />
                          Reportar ocorrência
                        </button>
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {minhasPublicacoes.slice(0, 3).map((pub) => {
                          const estilo = estiloDoStatus(pub.status);
                          return (
                            <li key={pub.id}>
                              <button
                                onClick={() => setPublicacaoSelecionada(pub.id)}
                                className="w-full flex items-center gap-3 text-left rounded-xl px-2 py-2 -mx-2 hover:bg-slate-50 transition cursor-pointer"
                              >
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-blue-50 flex items-center justify-center shrink-0">
                                  {pub.imagemUrl ? (
                                    <img src={pub.imagemUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <ImageIcon size={16} className="text-[#091f75]/40" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-slate-800 truncate">{pub.tipo}</p>
                                  <p className="text-[11px] text-slate-500 truncate">
                                    {pub.bairro} · {pub.tempo}
                                  </p>
                                </div>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${estilo.badge}`}
                                >
                                  {estilo.texto}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </aside>
              </div>
            )}

            {/* ─────────── MINHAS PUBLICAÇÕES ─────────── */}
            {secaoAtiva === "publicacoes" && (
              <div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                      <ImageIcon size={15} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-800 leading-tight">Minhas Publicações</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Ocorrências que você reportou no feed. Clique numa foto para ver os detalhes.
                      </p>
                    </div>
                  </div>

                  {/* FILTRO POR STATUS */}
                  {minhasPublicacoes.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] mb-4 -mx-1 px-1">
                      {(["Todos", ...Object.keys(STATUS_ESTILO_PUB)] as ("Todos" | StatusPublicacao)[]).map(
                        (status) => {
                          const ativo = filtroStatus === status;
                          return (
                            <button
                              key={status}
                              onClick={() => {
                                setFiltroStatus(status);
                                setLimitePublicacoes(PUBLICACOES_POR_PAGINA);
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition cursor-pointer ${ativo
                                ? "bg-[#091f75] text-white border-[#091f75]"
                                : "bg-white text-slate-500 border-slate-200 hover:border-[#091f75]/40 hover:text-[#091f75]"
                                }`}
                            >
                              {status !== "Todos" && (
                                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_ESTILO_PUB[status].ponto}`} />
                              )}
                              {status}
                              <span className={ativo ? "text-white/70" : "text-slate-400"}>
                                {contagemPorStatus[status] ?? 0}
                              </span>
                            </button>
                          );
                        },
                      )}
                    </div>
                  )}

                  {carregandoPublicacoes ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="aspect-square rounded-xl bg-slate-100 animate-pulse" />
                      ))}
                    </div>
                  ) : minhasPublicacoes.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                        <ImageIcon size={24} className="text-[#091f75]/50" />
                      </div>
                      <p className="text-sm font-bold text-slate-700">Nenhuma publicação ainda</p>
                      <p className="text-xs text-slate-400 mt-1 mb-4 max-w-xs mx-auto">
                        Viu um alagamento, uma árvore caída ou um deslizamento? Avise a comunidade pelo feed.
                      </p>
                      <button
                        onClick={() => router.push("/Feed")}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#091f75] hover:bg-[#0f35a0] rounded-lg transition cursor-pointer"
                      >
                        <Plus size={14} />
                        Reportar ocorrência
                      </button>
                    </div>
                  ) : publicacoesFiltradas.length === 0 ? (
                    <p className="py-10 text-center text-xs text-slate-400 font-medium">
                      Nenhuma publicação com o status “{filtroStatus}”.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                        {publicacoesFiltradas.slice(0, limitePublicacoes).map((pub) => {
                          const estilo = estiloDoStatus(pub.status);
                          return (
                            <button
                              key={pub.id}
                              onClick={() => setPublicacaoSelecionada(pub.id)}
                              className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer bg-slate-100"
                            >
                              {pub.imagemUrl ? (
                                <img
                                  src={pub.imagemUrl}
                                  alt={pub.tipo}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100/60">
                                  <ImageIcon size={24} className="text-[#091f75]/30" />
                                </div>
                              )}

                              {/* SELO DE STATUS */}
                              <span
                                className={`absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${estilo.badge}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${estilo.ponto}`} />
                                {estilo.texto}
                              </span>

                              {/* LEGENDA INFERIOR */}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent p-2.5 pt-8 text-left">
                                <p className="text-[11px] font-bold text-white truncate">{pub.tipo}</p>
                                <p className="text-[10px] text-white/70 truncate">
                                  {pub.bairro} · {pub.tempo}
                                </p>
                              </div>

                              {/* CURTIDAS E COMENTÁRIOS NO HOVER */}
                              <div className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/45 transition-all flex items-center justify-center gap-4 opacity-0 group-hover:opacity-100">
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
                          );
                        })}
                      </div>
                      {publicacoesFiltradas.length > limitePublicacoes && (
                        <div className="flex justify-center pt-5">
                          <button
                            onClick={() => setLimitePublicacoes((n) => n + PUBLICACOES_POR_PAGINA)}
                            className="px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-lg transition cursor-pointer"
                          >
                            Mostrar mais ({publicacoesFiltradas.length - limitePublicacoes})
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ─────────── DADOS DE EMERGÊNCIA ─────────── */}
            {secaoAtiva === "emergencia" && (
              <div className="space-y-5">

                {/* CARTÃO DE EMERGÊNCIA (resumo visual) */}
                <div className="rounded-2xl overflow-hidden shadow-sm border border-red-100 bg-white">
                  <div className="bg-gradient-to-r from-red-600 to-rose-500 px-5 py-3 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-white text-[11px] font-black uppercase tracking-[0.2em]">
                      <HeartPulse size={15} />
                      Cartão de emergência
                    </span>
                    <span className="text-white/80 text-[10px] font-bold">Pluvite</span>
                  </div>
                  <div className="p-5 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5">
                    <div className="flex sm:flex-col items-center gap-3">
                      <div className="w-20 h-20 rounded-2xl bg-red-50 border-2 border-red-100 flex flex-col items-center justify-center shrink-0">
                        <Droplet size={14} className="text-red-400" />
                        <span className="text-2xl font-black text-red-600 leading-none mt-0.5">
                          {perfil.tipo_sanguineo || "?"}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        Tipo sanguíneo
                      </span>
                    </div>
                    <div className="space-y-3 min-w-0">
                      <div>
                        <p className="text-base font-bold text-slate-800 truncate">
                          {perfil.nome_completo || "Usuário"}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium">
                          {[
                            idade !== null ? `${idade} anos` : null,
                            perfil.pcd ? `PCD${perfil.tipo_deficiencia ? ` (${perfil.tipo_deficiencia})` : ""}` : null,
                            perfil.cidade || null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Complete seus dados pessoais"}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {[
                          { label: "Alergias", valor: perfil.alergias, icone: <AlertTriangle size={11} /> },
                          { label: "Condições", valor: perfil.condicoes_medicas, icone: <Stethoscope size={11} /> },
                          { label: "Medicamentos", valor: perfil.medicamentos_uso, icone: <Pill size={11} /> },
                        ].map((item) => (
                          <div key={item.label} className="bg-slate-50 rounded-lg px-2.5 py-2">
                            <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                              {item.icone}
                              {item.label}
                            </span>
                            <p className="text-[11px] font-semibold text-slate-700 mt-0.5 line-clamp-2">
                              {item.valor || "Nenhuma informada"}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-xs pt-1">
                        <Phone size={13} className="text-red-500 shrink-0" />
                        {perfil.contato_emergencia_nome ? (
                          <span className="font-semibold text-slate-700 truncate">
                            {perfil.contato_emergencia_nome}
                            {perfil.contato_emergencia_parentesco && (
                              <span className="text-slate-400 font-medium"> ({perfil.contato_emergencia_parentesco})</span>
                            )}
                            {perfil.contato_emergencia_telefone && (
                              <span className="text-slate-500"> · {perfil.contato_emergencia_telefone}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Nenhum contato de emergência cadastrado</span>
                        )}
                      </div>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                        <Shield size={12} className="shrink-0" />
                        Essas informações só são usadas em caso de resgate durante uma emergência.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* INFORMACOES MEDICAS */}
                  <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    {renderCardHeader(<Stethoscope size={15} />, "Informações Médicas", "medico")}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {renderCampo(
                        "Tipo sanguíneo",
                        <Droplet size={11} />,
                        editandoBloco === "medico",
                        perfil.tipo_sanguineo || NAO_INFORMADO,
                        <select
                          name="tipo_sanguineo"
                          value={perfil.tipo_sanguineo}
                          onChange={handleChange}
                          className={CLASSE_INPUT}
                        >
                          <option value="">Não sei / não informar</option>
                          {TIPOS_SANGUINEOS.map((tipo) => (
                            <option key={tipo} value={tipo}>
                              {tipo}
                            </option>
                          ))}
                        </select>,
                      )}
                      {renderCampo(
                        "Alergias",
                        <AlertTriangle size={11} />,
                        editandoBloco === "medico",
                        perfil.alergias || NAO_INFORMADO,
                        <textarea
                          name="alergias"
                          rows={2}
                          placeholder="Ex: alergia a dipirona, látex..."
                          value={perfil.alergias}
                          onChange={handleChange}
                          className={`${CLASSE_INPUT} resize-none`}
                        />,
                      )}
                      {renderCampo(
                        "Condições médicas",
                        <Stethoscope size={11} />,
                        editandoBloco === "medico",
                        perfil.condicoes_medicas || NAO_INFORMADO,
                        <textarea
                          name="condicoes_medicas"
                          rows={2}
                          placeholder="Ex: diabetes, hipertensão..."
                          value={perfil.condicoes_medicas}
                          onChange={handleChange}
                          className={`${CLASSE_INPUT} resize-none`}
                        />,
                      )}
                      {renderCampo(
                        "Medicamentos de uso contínuo",
                        <Pill size={11} />,
                        editandoBloco === "medico",
                        perfil.medicamentos_uso || NAO_INFORMADO,
                        <textarea
                          name="medicamentos_uso"
                          rows={2}
                          placeholder="Ex: losartana 50mg..."
                          value={perfil.medicamentos_uso}
                          onChange={handleChange}
                          className={`${CLASSE_INPUT} resize-none`}
                        />,
                      )}
                    </div>
                  </div>

                  {/* CONTATO DE EMERGENCIA */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    {renderCardHeader(
                      <Phone size={15} />,
                      contaRestrita ? "Responsável Legal" : "Contato de Emergência",
                      "contatoEmergencia",
                      contaRestrita
                        ? "Obrigatório para menores de 16 anos. Será avisado em caso de emergência."
                        : "Quem devemos avisar se algo acontecer com você.",
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-1 gap-3">
                      {renderCampo(
                        "Nome",
                        <User size={11} />,
                        editandoBloco === "contatoEmergencia",
                        perfil.contato_emergencia_nome || NAO_INFORMADO,
                        <input
                          type="text"
                          name="contato_emergencia_nome"
                          value={perfil.contato_emergencia_nome}
                          onChange={handleChange}
                          className={CLASSE_INPUT}
                        />,
                      )}
                      {renderCampo(
                        "Telefone",
                        <Phone size={11} />,
                        editandoBloco === "contatoEmergencia",
                        perfil.contato_emergencia_telefone ? (
                          <a
                            href={`tel:${perfil.contato_emergencia_telefone.replace(/\D/g, "")}`}
                            className="hover:text-[#091f75] hover:underline"
                          >
                            {perfil.contato_emergencia_telefone}
                          </a>
                        ) : (
                          NAO_INFORMADO
                        ),
                        <input
                          type="tel"
                          name="contato_emergencia_telefone"
                          placeholder="(00) 00000-0000"
                          maxLength={15}
                          value={perfil.contato_emergencia_telefone}
                          onChange={handleChange}
                          className={CLASSE_INPUT}
                        />,
                      )}
                      {renderCampo(
                        "Parentesco / Relação",
                        <HeartPulse size={11} />,
                        editandoBloco === "contatoEmergencia",
                        perfil.contato_emergencia_parentesco || NAO_INFORMADO,
                        <input
                          type="text"
                          name="contato_emergencia_parentesco"
                          placeholder="Ex: mãe, cônjuge..."
                          value={perfil.contato_emergencia_parentesco}
                          onChange={handleChange}
                          className={CLASSE_INPUT}
                        />,
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─────────── NOTIFICAÇÕES ─────────── */}
            {secaoAtiva === "notificacoes" && (
              <div className="space-y-5">

                <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
                  <MapPin size={16} className="text-[#091f75] shrink-0" />
                  <p className="text-xs text-slate-600 leading-relaxed flex-1">
                    {perfil.cidade ? (
                      <>
                        Região monitorada:{" "}
                        <strong className="text-[#091f75]">
                          {perfil.bairro ? `${perfil.bairro}, ` : ""}
                          {perfil.cidade}
                        </strong>
                      </>
                    ) : (
                      "Cadastre sua cidade para receber alertas da sua região."
                    )}
                  </p>
                  <button
                    onClick={() => trocarSecao("dados")}
                    className="text-[11px] font-bold text-[#0f35a0] hover:underline cursor-pointer shrink-0"
                  >
                    {perfil.cidade ? "Alterar" : "Cadastrar"}
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {[
                    {
                      grupo: "Tipos de alerta",
                      itens: [
                        {
                          label: "Alertas de chuva forte",
                          desc: "Avisos em tempo real sobre tempestades e acumulados de chuva na sua região.",
                          campo: "notif_chuva_forte",
                          icon: <CloudRain size={16} className="text-blue-600" />,
                          fundo: "bg-blue-50",
                        },
                        {
                          label: "Risco de deslizamento",
                          desc: "Alertas críticos para áreas de encosta com risco iminente de alagamento ou deslizamento.",
                          campo: "notif_deslizamento",
                          icon: <Mountain size={16} className="text-amber-600" />,
                          fundo: "bg-amber-50",
                        },
                      ],
                    },
                    {
                      grupo: "Canais de envio",
                      itens: [
                        {
                          label: "Notificações por e-mail",
                          desc: "Relatórios periódicos e avisos importantes na sua caixa de entrada.",
                          campo: "notif_email",
                          icon: <Mail size={16} className="text-indigo-600" />,
                          fundo: "bg-indigo-50",
                        },
                        {
                          label: "Notificações push no navegador",
                          desc: "Avisos sonoros e visuais na tela enquanto o navegador estiver aberto.",
                          campo: "notif_push",
                          icon: <BellRing size={16} className="text-emerald-600" />,
                          fundo: "bg-emerald-50",
                        },
                      ],
                    },
                  ].map(({ grupo, itens }) => (
                    <div key={grupo} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-3">{grupo}</h3>
                      <div className="divide-y divide-slate-100">
                        {itens.map(({ label, desc, campo, icon, fundo }) => {
                          const chave = campo as "notif_chuva_forte" | "notif_deslizamento" | "notif_email" | "notif_push";
                          return (
                            <div key={campo} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                              <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-xl ${fundo} shrink-0`}>{icon}</div>
                                <div>
                                  <span className="text-xs font-bold text-slate-800 block">{label}</span>
                                  <span className="text-[11px] text-slate-400 leading-snug block mt-0.5">{desc}</span>
                                </div>
                              </div>

                              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input
                                  type="checkbox"
                                  checked={perfil[chave]}
                                  onChange={() => alternarNotificacao(chave)}
                                  className="sr-only peer"
                                />
                                <div className="w-10 h-5 bg-slate-200 peer-checked:bg-[#091f75] rounded-full transition-all after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:shadow-sm after:transition-all peer-checked:after:translate-x-5"></div>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─────────── SEGURANÇA ─────────── */}
            {secaoAtiva === "seguranca" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* RESUMO DA CONTA */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-4">Sua conta</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        label: "Forma de login",
                        valor: entraComSenha
                          ? "E-mail e senha"
                          : contaInfo.provedor.charAt(0).toUpperCase() + contaInfo.provedor.slice(1),
                        icone: <KeyRound size={14} />,
                      },
                      {
                        label: "E-mail",
                        valor: contaInfo.emailConfirmado ? "Verificado" : "Aguardando verificação",
                        icone: <BadgeCheck size={14} />,
                        destaque: contaInfo.emailConfirmado ? "text-emerald-600" : "text-amber-600",
                      },
                      {
                        label: "Conta criada em",
                        valor: formatarData(contaInfo.criadoEm, { day: "2-digit", month: "long", year: "numeric" }),
                        icone: <CalendarDays size={14} />,
                      },
                      {
                        label: "Último acesso",
                        valor: formatarDataHora(contaInfo.ultimoAcesso),
                        icone: <Clock size={14} />,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-100"
                      >
                        <span className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                          {item.icone}
                        </span>
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide block">
                            {item.label}
                          </span>
                          <span className={`text-xs font-semibold block truncate ${item.destaque || "text-slate-700"}`}>
                            {item.valor}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {entraComSenha ? (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                    {/* ALTERAR SENHA */}
                    <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <span className="text-xs font-bold text-slate-800 block">Alterar senha</span>
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            Use pelo menos 8 caracteres, misturando letras, números e símbolos.
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setAlterandoSenha((prev) => !prev);
                            setSenha({ atual: "", nova: "", confirmar: "" });
                          }}
                          className="px-3 py-1.5 text-xs font-bold text-[#091f75] bg-blue-50 hover:bg-blue-100 rounded-lg transition-all cursor-pointer border border-blue-100 shrink-0"
                        >
                          {alterandoSenha ? "Cancelar" : "Alterar"}
                        </button>
                      </div>

                      {alterandoSenha && (
                        <div className="pt-3 border-t border-slate-200/60 space-y-3">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Senha atual</span>
                            <input
                              type="password"
                              autoComplete="current-password"
                              placeholder="Digite sua senha atual"
                              value={senha.atual}
                              onChange={(e) => setSenha((prev) => ({ ...prev, atual: e.target.value }))}
                              className={CLASSE_INPUT}
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase block">Nova senha</span>
                              <input
                                type="password"
                                autoComplete="new-password"
                                placeholder="Nova senha"
                                value={senha.nova}
                                onChange={(e) => setSenha((prev) => ({ ...prev, nova: e.target.value }))}
                                className={CLASSE_INPUT}
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase block">
                                Confirmar nova senha
                              </span>
                              <input
                                type="password"
                                autoComplete="new-password"
                                placeholder="Repita a nova senha"
                                value={senha.confirmar}
                                onChange={(e) => setSenha((prev) => ({ ...prev, confirmar: e.target.value }))}
                                className={CLASSE_INPUT}
                              />
                            </div>
                          </div>

                          {/* MEDIDOR DE FORÇA */}
                          {senha.nova && (
                            <div className="space-y-1">
                              <div className="flex gap-1">
                                {[1, 2, 3, 4].map((n) => (
                                  <div
                                    key={n}
                                    className={`h-1.5 flex-1 rounded-full transition-all ${forcaDaSenha(senha.nova) >= n ? nivelSenha.cor : "bg-slate-200"}`}
                                  />
                                ))}
                              </div>
                              <p className={`text-[11px] font-bold ${nivelSenha.textoCor}`}>{nivelSenha.texto}</p>
                            </div>
                          )}
                          {senha.confirmar && senha.confirmar !== senha.nova && (
                            <p className="text-[11px] font-semibold text-red-500">As senhas não coincidem.</p>
                          )}

                          <button
                            onClick={salvarNovaSenha}
                            disabled={salvandoSenha}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#091f75] hover:bg-[#0f35a0] text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-60"
                          >
                            {salvandoSenha ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Salvar nova senha
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ESQUECI MINHA SENHA */}
                    <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Esqueceu sua senha?</span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Enviaremos um link de redefinição para{" "}
                          <strong className="text-slate-600">{perfil.email}</strong>
                        </span>
                      </div>
                      <button
                        onClick={enviarLinkRedefinicao}
                        className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 rounded-lg transition-all cursor-pointer border border-slate-200 shrink-0 self-start sm:self-auto"
                      >
                        Enviar link
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
                    <Info size={16} className="text-[#091f75] mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Você entra no Pluvite com sua conta{" "}
                      <strong className="capitalize">{contaInfo.provedor}</strong>, então a senha é gerenciada
                      por lá. Para trocá-la, acesse as configurações de segurança do {contaInfo.provedor}.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════ MODAL DE POST COMPLETO (ESTILO INSTAGRAM) ═══════════════ */}
      {publicacaoSelecionada &&
        (() => {
          const pub = minhasPublicacoes.find((p) => p.id === publicacaoSelecionada);
          if (!pub) return null;
          const estiloPub = estiloDoStatus(pub.status);
          const StatusIconPub = estiloPub.icon;

          return (
            <div
              className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[10002] flex items-center justify-center p-4"
              onClick={fecharModal}
            >
              <button
                onClick={fecharModal}
                className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white/80 hover:text-white cursor-pointer z-10"
                title="Fechar"
              >
                <X size={28} />
              </button>

              <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
                onClick={(e) => e.stopPropagation()}
              >
                {/* IMAGEM GRANDE */}
                <div className="w-full md:w-3/5 bg-black flex items-center justify-center max-h-[40vh] md:max-h-[90vh] shrink-0">
                  {pub.imagemUrl ? (
                    <img src={pub.imagemUrl} alt="Publicação" className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-white/60 p-10 text-center">
                      <ImageIcon size={36} />
                      <span className="text-xs font-bold">{pub.tipo}</span>
                      <span className="text-[11px] text-white/40">Essa publicação não tem foto</span>
                    </div>
                  )}
                </div>

                {/* PAINEL DE LEGENDA E COMENTÁRIOS */}
                <div className="w-full md:w-2/5 flex flex-col min-h-0">
                  {/* CABEÇALHO DO POST */}
                  <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      {renderAvatar("w-10 h-10", "text-xs")}
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
                                  onClick={() => iniciarEdicaoPublicacao(pub)}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                                >
                                  <Pencil size={14} className="text-slate-400" />
                                  Editar
                                </button>
                              </li>
                              <li hidden={contaRestrita}>
                                <button
                                  onClick={() => handleCompartilharPub(pub)}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                                >
                                  <Share2 size={14} className="text-slate-400" />
                                  Compartilhar
                                </button>
                              </li>
                              <li className="border-t border-slate-100 mt-1 pt-1">
                                <button
                                  onClick={() => apagarPublicacao(pub.id)}
                                  disabled={apagandoPub}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  {apagandoPub ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                  Apagar
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
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 border shrink-0 ${estiloPub.badge}`}
                      >
                        <StatusIconPub size={11} />
                        {estiloPub.texto}
                      </span>
                    </div>
                  </div>

                  {/* DETALHES DA OCORRÊNCIA */}
                  {!editandoPublicacao && (
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 space-y-1.5 shrink-0">
                      <p className="text-xs font-bold text-slate-800">{pub.tipo}</p>
                      <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        {[pub.endereco, pub.bairro, pub.cidade].filter(Boolean).join(", ")}
                      </p>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <CalendarDays size={12} className="shrink-0" />
                        {formatarDataHora(pub.criadoEm)}
                      </p>
                    </div>
                  )}

                  {/* LEGENDA + COMENTÁRIOS (rolável) */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5">
                    {editandoPublicacao && edicaoPub ? (
                      /* FORMULÁRIO DE EDIÇÃO */
                      <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            Tipo de ocorrência
                          </span>
                          <select
                            value={edicaoPub.tipo}
                            onChange={(e) => setEdicaoPub((prev) => prev && { ...prev, tipo: e.target.value })}
                            className={CLASSE_INPUT}
                          >
                            {TIPOS_OCORRENCIA.map((tipo) => (
                              <option key={tipo} value={tipo}>
                                {tipo}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Cidade</span>
                          <select
                            value={edicaoPub.cidade}
                            onChange={(e) => setEdicaoPub((prev) => prev && { ...prev, cidade: e.target.value })}
                            className={CLASSE_INPUT}
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
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Bairro</span>
                            <input
                              type="text"
                              value={edicaoPub.bairro}
                              onChange={(e) => setEdicaoPub((prev) => prev && { ...prev, bairro: e.target.value })}
                              className={CLASSE_INPUT}
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Endereço</span>
                            <input
                              type="text"
                              value={edicaoPub.endereco}
                              onChange={(e) => setEdicaoPub((prev) => prev && { ...prev, endereco: e.target.value })}
                              className={CLASSE_INPUT}
                            />
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Descrição</span>
                          <textarea
                            rows={3}
                            value={edicaoPub.descricao}
                            onChange={(e) => setEdicaoPub((prev) => prev && { ...prev, descricao: e.target.value })}
                            className={`${CLASSE_INPUT} resize-none`}
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
                            {salvandoEdicaoPub ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      pub.descricao && (
                        <div className="flex items-start gap-2.5">
                          {renderAvatar("w-7 h-7", "text-[10px]")}
                          <p className="text-xs text-slate-700 leading-relaxed">
                            <span className="font-bold text-slate-900">{perfil.nome_completo || "Você"}</span>{" "}
                            {pub.descricao}
                          </p>
                        </div>
                      )
                    )}

                    {contaRestrita ? (
                      <div className="text-center py-6 px-4">
                        <ShieldCheck size={22} className="text-amber-400 mx-auto mb-1.5" />
                        <p className="text-xs text-slate-500 font-medium">
                          Comentários desativados em contas de menores de {IDADE_MINIMA_SEM_RESTRICAO} anos.
                        </p>
                      </div>
                    ) : pub.comentarios.length === 0 ? (
                      <div className="text-center py-6">
                        <MessageSquare size={22} className="text-slate-200 mx-auto mb-1.5" />
                        <p className="text-xs text-slate-400 font-medium">Nenhum comentário ainda.</p>
                      </div>
                    ) : (
                      pub.comentarios.map((com) => (
                        <div key={com.id} className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-[10px] shrink-0">
                            {gerarIniciais(com.autor)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-slate-700 leading-relaxed">
                              <span className="font-bold text-slate-900">{com.autor}</span> {com.texto}
                            </p>
                            {com.tempo && <span className="text-[10px] text-slate-400">{com.tempo}</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* AÇÕES, CURTIDAS E CAMPO DE COMENTÁRIO */}
                  <div className="border-t border-slate-100 shrink-0">
                    <div className="flex items-center gap-4 px-4 pt-3">
                      <button
                        onClick={() => handleCurtirPublicacao(pub.id)}
                        className={`transition cursor-pointer active:scale-90 ${pub.curtido ? "text-[#091f75]" : "text-slate-500 hover:text-[#091f75]"}`}
                        title="Curtir"
                      >
                        <ThumbsUp size={20} fill={pub.curtido ? "currentColor" : "none"} />
                      </button>
                      {!contaRestrita && <MessageSquare size={20} className="text-slate-500" />}
                    </div>

                    <div className={`px-4 pt-2 ${contaRestrita ? "pb-4" : ""}`}>
                      <span className="text-xs font-bold text-slate-800">
                        {pub.curtidas} {pub.curtidas === 1 ? "curtida" : "curtidas"}
                      </span>
                      {!contaRestrita && (
                        <span className="text-xs text-slate-400">
                          {" "}
                          · {pub.comentarios.length} {pub.comentarios.length === 1 ? "comentário" : "comentários"}
                        </span>
                      )}
                    </div>

                    <div className={`flex items-center gap-2 p-4 pt-3 ${contaRestrita ? "hidden" : ""}`}>
                      <input
                        type="text"
                        value={comentarioAtualPub[pub.id] || ""}
                        onChange={(e) => setComentarioAtualPub((prev) => ({ ...prev, [pub.id]: e.target.value }))}
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

      {/* ═══════════════ AVISO FLUTUANTE ═══════════════ */}
      {aviso && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[10010] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-xs font-bold max-w-[calc(100%-2rem)] ${aviso.tipo === "sucesso" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
            }`}
        >
          {aviso.tipo === "sucesso" ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
          <span>{aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="ml-1 opacity-70 hover:opacity-100 cursor-pointer">
            <X size={13} />
          </button>
        </div>
      )}
    </main>
  );
}

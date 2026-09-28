"use client";

import { useState, useRef, useEffect } from "react";
// Ajuste este caminho se você já tem um cliente Supabase em outro arquivo do projeto
import { supabase } from "@/app/lib/banco";
import {
  AlertTriangle,
  Wrench,
  Eye,
  Plus,
  Search,
  MapPin,
  Filter,
  MessageSquare,
  ThumbsUp,
  Share2,
  TrendingUp,
  ImagePlus,
  X,
  Send,
  CheckCircle,
  ChevronDown,
  Check,
  Megaphone,
  FileText,
  Camera,
  Copy,
  Mail,
  MessageCircle,
  Users,
  ShieldAlert,
  Droplets,
  TreeDeciduous,
  Construction,
  Mountain,
  Ban,
  LayoutGrid,
} from "lucide-react";

interface Comentario {
  id: string;
  autor: string;
  texto: string;
}

type StatusOcorrencia =
  | "Aguardando"
  | "Em Andamento"
  | "Visualizado"
  | "Concluído";

// Tipos de ocorrência — usados no menu da publicação e nos filtros do feed
const TIPOS_OCORRENCIA = [
  "Alagamento",
  "Árvore caída",
  "Buraco na via",
  "Deslizamento de terra",
  "Via interditada",
  "Outros",
] as const;

type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];

// Ícone de cada categoria nos chips de filtro
const ICONE_CATEGORIA: Record<string, any> = {
  Todas: LayoutGrid,
  Alagamento: Droplets,
  "Árvore caída": TreeDeciduous,
  "Buraco na via": Construction,
  "Deslizamento de terra": Mountain,
  "Via interditada": Ban,
  Outros: FileText,
};

// Os 39 municípios do Vale do Paraíba e Litoral Norte — usados no filtro e na publicação
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
  tempo: string;
  criadoEm: string;
  status: StatusOcorrencia;
  descricao: string;
  imagemUrl: string | null;
  curtido: boolean;
  curtidas: number;
  comentarios: Comentario[];
}

const STATUS_ESTILO: Record<
  StatusOcorrencia,
  { badge: string; icon: any; texto: string }
> = {
  Aguardando: {
    badge: "bg-red-50 text-red-700 border-red-200",
    icon: AlertTriangle,
    texto: "Aguardando",
  },
  "Em Andamento": {
    badge: "bg-amber-50 text-amber-800 border-amber-200",
    icon: Wrench,
    texto: "Em Andamento",
  },
  Visualizado: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: Eye,
    texto: "Visualizado",
  },
  Concluído: {
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    icon: CheckCircle,
    texto: "Concluído",
  },
};

// Remove acentos e maiúsculas pra a busca achar "Tremembe" digitando "tremembé" e vice-versa
const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Calcula um texto relativo ("há 15 minutos", "há 2 horas"...) a partir do
// timestamp `criado_em` que vem do Supabase
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

// Campo padrão (inputs, textarea e gatilho dos menus suspensos): cantos bem arredondados.
const CAMPO_CLASSE =
  "w-full bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#0f2a8f] focus:ring-2 focus:ring-[#0f2a8f]/10";

interface OpcaoMenu {
  valor: string;
  rotulo: string;
}

const paraOpcoes = (lista: readonly string[]): OpcaoMenu[] =>
  lista.map((item) => ({ valor: item, rotulo: item }));

/**
 * Menu suspenso próprio do Pluvite.
 * O <select> nativo desenha a lista de opções pelo sistema/navegador (sem como mudar cor, borda
 * ou arredondamento com CSS), então aqui a lista é montada à mão: fundo azul escuro, borda azul
 * mais clara e cantos arredondados. Funciona com mouse e teclado (setas, Enter, Espaço, Esc e
 * digitar a primeira letra pra pular até a cidade — útil na lista grande de municípios).
 */
function MenuSuspenso({
  id,
  valor,
  onChange,
  opcoes,
  placeholder = "Selecione",
  icone,
  negrito = false,
  className = "",
}: {
  id: string;
  valor: string;
  onChange: (valor: string) => void;
  opcoes: OpcaoMenu[];
  placeholder?: string;
  icone?: React.ReactNode;
  negrito?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);
  const raizRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const selecionada = opcoes.find((op) => op.valor === valor);

  // Fecha ao clicar fora do menu
  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: MouseEvent) => {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  // Mantém a opção destacada visível ao navegar com as setas
  useEffect(() => {
    if (aberto && indiceAtivo >= 0) {
      (
        listaRef.current?.children[indiceAtivo] as HTMLElement | undefined
      )?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [indiceAtivo, aberto]);

  const abrir = () => {
    setIndiceAtivo(
      Math.max(
        0,
        opcoes.findIndex((op) => op.valor === valor),
      ),
    );
    setAberto(true);
  };

  const selecionar = (novoValor: string) => {
    onChange(novoValor);
    setAberto(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      if (aberto) {
        e.stopPropagation();
        setAberto(false);
      }
      return;
    }
    if (e.key === "Tab") {
      setAberto(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!aberto) abrir();
      else setIndiceAtivo((i) => Math.min(opcoes.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!aberto) abrir();
      else setIndiceAtivo((i) => Math.max(0, i - 1));
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && aberto) {
      e.preventDefault();
      if (indiceAtivo >= 0) selecionar(opcoes[indiceAtivo].valor);
      return;
    }

    // Digitar uma letra pula pra próxima opção que começa com ela
    if (
      e.key.length === 1 &&
      /\S/.test(e.key) &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      const letra = normalizar(e.key);
      const base = aberto
        ? indiceAtivo
        : opcoes.findIndex((op) => op.valor === valor);
      for (let passo = 1; passo <= opcoes.length; passo++) {
        const i = (base + passo + opcoes.length) % opcoes.length;
        if (normalizar(opcoes[i].rotulo).startsWith(letra)) {
          e.preventDefault();
          if (!aberto) setAberto(true);
          setIndiceAtivo(i);
          break;
        }
      }
    }
  };

  return (
    <div ref={raizRef} className={`relative ${className}`}>
      {icone && (
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          {icone}
        </span>
      )}

      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={handleKeyDown}
        className={`${CAMPO_CLASSE} flex items-center justify-between gap-2 text-left cursor-pointer ${icone ? "pl-10" : ""} ${aberto ? "border-[#0f2a8f] ring-2 ring-[#0f2a8f]/10" : ""}`}
      >
        <span
          className={`truncate ${selecionada ? (negrito ? "font-semibold" : "") : "text-slate-400"}`}
        >
          {selecionada ? selecionada.rotulo : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${aberto ? "rotate-180" : ""}`}
        />
      </button>

      {aberto && (
        <ul
          ref={listaRef}
          id={`${id}-lista`}
          role="listbox"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#3d5cc9 transparent",
          }}
          className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-64 overflow-y-auto rounded-2xl border border-[#3d5cc9] bg-[#091f75] p-1.5 shadow-xl shadow-[#091f75]/30"
        >
          {opcoes.map((op, i) => {
            const escolhida = op.valor === valor;
            const destacada = i === indiceAtivo;

            return (
              <li
                key={op.valor}
                role="option"
                aria-selected={escolhida}
                onMouseEnter={() => setIndiceAtivo(i)}
                onClick={() => selecionar(op.valor)}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer transition-colors ${escolhida
                  ? "bg-white/15 text-white font-semibold"
                  : destacada
                    ? "bg-white/10 text-white"
                    : "text-white/85"
                  }`}
              >
                <span className="truncate">{op.rotulo}</span>
                {escolhida && <Check size={14} className="shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Campo com rótulo (e asterisco azul quando obrigatório) usado no modal de publicação
function CampoModal({
  htmlFor,
  rotulo,
  obrigatorio = false,
  children,
}: {
  htmlFor: string;
  rotulo: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-bold text-slate-700 mb-1.5"
      >
        {rotulo}
        {obrigatorio && <span className="text-[#0f2a8f] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function FeedPage() {
  const [busca, setBusca] = useState("");
  const [cidade, setCidade] = useState("");
  const [categoriaAtiva, setCategoriaAtiva] = useState("Todas");

  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [carregandoFeed, setCarregandoFeed] = useState(true);

  // Usuário logado (Supabase Auth) — null enquanto carrega ou se ninguém estiver logado
  // IMPORTANTE: usuarioId guarda o id da tabela "cidadao" (não o id do auth.users),
  // porque é esse id que as foreign keys de ocorrencias/curtidas/comentarios esperam.
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [usuarioNome, setUsuarioNome] = useState("Você");
  // true quando há sessão no Auth mas nenhuma linha em "cidadao" para esse auth_id
  const [semCadastro, setSemCadastro] = useState(false);

  // Modal de nova publicação
  const [modalAberto, setModalAberto] = useState(false);
  const [novaLegenda, setNovaLegenda] = useState("");
  const [novaImagemPreview, setNovaImagemPreview] = useState<string | null>(
    null,
  );
  const [novaImagemArquivo, setNovaImagemArquivo] = useState<File | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [novoTipo, setNovoTipo] = useState<TipoOcorrencia | "">("");
  const [novaCidade, setNovaCidade] = useState("");
  const [novoBairro, setNovoBairro] = useState("");
  const [novoEndereco, setNovoEndereco] = useState("");
  const inputImagemRef = useRef<HTMLInputElement>(null);

  // Texto do comentário sendo digitado, por ocorrência (id -> texto)
  const [comentarioAtual, setComentarioAtual] = useState<
    Record<string, string>
  >({});
  // Controla qual ocorrência deve tocar a animação de "curtir" no momento
  const [curtidaAnimando, setCurtidaAnimando] = useState<
    Record<string, boolean>
  >({});
  // Id da ocorrência aberta no modal estilo Instagram (null = nenhum aberto)
  const [postoSelecionado, setPostoSelecionado] = useState<string | null>(null);

  // Id da ocorrência aberta no menu de compartilhamento (null = nenhum aberto)
  const [compartilhandoId, setCompartilhandoId] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);

  // Se a página foi aberta a partir de um link compartilhado (?ocorrencia=<id>),
  // abre automaticamente o post correspondente assim que a página carrega.
  // Roda depois que o feed carrega, já que a ocorrência agora vem do Supabase.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const idNaUrl = params.get("ocorrencia");
    if (idNaUrl) {
      setPostoSelecionado(idNaUrl);
    }
  }, []);

  const categorias = ["Todas", ...TIPOS_OCORRENCIA];

  // Opções dos menus suspensos
  const opcoesCidadeFiltro: OpcaoMenu[] = [
    { valor: "", rotulo: "Todas as cidades" },
    ...paraOpcoes(CIDADES),
  ];
  const opcoesCidade = paraOpcoes(CIDADES);
  const opcoesTipo = paraOpcoes(TIPOS_OCORRENCIA);

  const gerarIniciais = (nome: string) =>
    nome
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("");

  // ───── USUÁRIO LOGADO ─────
  // Busca o registro do usuário logado na tabela "cidadao" a partir do auth_id
  // (o id do Supabase Auth), e guarda o id da própria linha de "cidadao" em
  // usuarioId — é esse id que as tabelas ocorrencias/curtidas/comentarios exigem.
  useEffect(() => {
    const carregarUsuario = async () => {
      const { data } = await supabase.auth.getUser();
      const usuario = data.user;
      if (!usuario) return;

      // maybeSingle (e não single): contas criadas antes do trigger
      // handle_new_user não têm linha em "cidadao", e o single devolvia o erro
      // PGRST116 ("0 rows") como se a consulta tivesse falhado.
      const { data: cidadaoRow, error: erroCidadao } = await supabase
        .from("cidadao")
        .select("id, nome_completo")
        .eq("auth_id", usuario.id)
        .maybeSingle();

      if (erroCidadao) {
        console.error("Erro ao carregar o cidadão logado:", {
          message: erroCidadao.message,
          details: erroCidadao.details,
          hint: erroCidadao.hint,
          code: erroCidadao.code,
        });
        return;
      }

      if (!cidadaoRow) {
        console.warn(
          `Sem linha em "cidadao" para o auth_id ${usuario.id}. Aplique a migration ` +
            "supabase/migrations/20260924120000_cidadao_automatico.sql (cria a linha " +
            "no cadastro e preenche as contas antigas) ou salve o perfil uma vez.",
        );
        setSemCadastro(true);
        return;
      }

      setSemCadastro(false);
      setUsuarioId(cidadaoRow.id);
      setUsuarioNome(cidadaoRow.nome_completo || "Você");
    };
    carregarUsuario();
  }, []);

  // ───── CARREGAR FEED DO SUPABASE ─────
  const carregarFeed = async () => {
    setCarregandoFeed(true);

    const { data: linhas, error: erroOcorrencias } = await supabase
      .from("ocorrencias")
      .select(
        "*, cidadao!ocorrencias_autor_id_fkey(nome_completo, avatar_url)",
      )
      .order("criado_em", { ascending: false });

    if (erroOcorrencias || !linhas) {
      console.error("Erro ao carregar feed:", {
        message: erroOcorrencias?.message,
        details: erroOcorrencias?.details,
        hint: erroOcorrencias?.hint,
        code: erroOcorrencias?.code,
      });
      setCarregandoFeed(false);
      return;
    }

    const { data: curtidasLinhas } = await supabase
      .from("curtidas")
      .select("ocorrencia_id, usuario_id");
    const { data: comentariosLinhas } = await supabase
      .from("comentarios")
      .select("id, ocorrencia_id, texto, cidadao(nome_completo)")
      .order("criado_em", { ascending: true });

    // idUsuarioAtual precisa ser o id de "cidadao" (mesmo valor de usuarioId),
    // já que curtidas.usuario_id referencia cidadao.id — não auth.users.id.
    const { data: sessaoAtual } = await supabase.auth.getUser();
    let idUsuarioAtual: string | null = null;
    if (sessaoAtual.user) {
      const { data: cidadaoAtual } = await supabase
        .from("cidadao")
        .select("id")
        .eq("auth_id", sessaoAtual.user.id)
        .maybeSingle();
      idUsuarioAtual = cidadaoAtual?.id ?? null;
    }

    const ocorrenciasMontadas: Ocorrencia[] = linhas.map((linha: any) => {
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

      const nomeAutor = linha.cidadao?.nome_completo || "Cidadão";
      // avatar_url pode ser um caminho relativo (ex: "/perfil.png", o padrão de
      // quem nunca trocou a foto) — nesse caso trata como "sem foto"
      const avatarAutor = linha.cidadao?.avatar_url;
      const avatarAutorValido =
        avatarAutor && avatarAutor !== "/perfil.png" ? avatarAutor : null;

      return {
        id: linha.id,
        autorId: linha.autor_id,
        autor: nomeAutor,
        autorAvatarUrl: avatarAutorValido,
        iniciais: gerarIniciais(nomeAutor),
        endereco: linha.endereco,
        bairro: linha.bairro,
        cidade: linha.cidade,
        tipo: linha.tipo,
        tempo: tempoRelativo(linha.criado_em),
        criadoEm: linha.criado_em,
        status: linha.status,
        descricao: linha.descricao || "",
        imagemUrl: linha.imagem_url,
        curtido: idUsuarioAtual
          ? curtidasDaOcorrencia.some(
            (c: any) => c.usuario_id === idUsuarioAtual,
          )
          : false,
        curtidas: curtidasDaOcorrencia.length,
        comentarios: comentariosDaOcorrencia,
      };
    });

    setOcorrencias(ocorrenciasMontadas);
    setCarregandoFeed(false);
  };

  useEffect(() => {
    carregarFeed();
  }, []);

  // ───── FILTROS E BUSCA ─────
  const termoBusca = normalizar(busca);
  const temFiltroAtivo =
    cidade !== "" || termoBusca !== "" || categoriaAtiva !== "Todas";

  const ocorrenciasFiltradas = ocorrencias.filter((oc) => {
    if (cidade && oc.cidade !== cidade) return false;
    if (categoriaAtiva !== "Todas" && oc.tipo !== categoriaAtiva) return false;
    if (termoBusca) {
      const texto = normalizar(
        `${oc.bairro} ${oc.endereco} ${oc.cidade} ${oc.tipo} ${oc.descricao}`,
      );
      if (!texto.includes(termoBusca)) return false;
    }
    return true;
  });

  // Quantas ocorrências existem por categoria (respeita a cidade escolhida) — aparece nos chips
  const ocorrenciasNaCidade = ocorrencias.filter(
    (o) => !cidade || o.cidade === cidade,
  );

  const limparFiltros = () => {
    setBusca("");
    setCidade("");
    setCategoriaAtiva("Todas");
  };

  // Aviso quando usuarioId está vazio: quem não tem sessão precisa entrar; quem
  // está logada mas ainda não tem cadastro de cidadão precisa salvar o perfil.
  const avisarSemCadastro = (acao: string) =>
    alert(
      semCadastro
        ? `Complete seu perfil antes de ${acao}.`
        : `Você precisa estar logada para ${acao}.`,
    );

  // ───── NOVA PUBLICAÇÃO ─────
  const handleSelecionarImagem = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setNovaImagemArquivo(arquivo);
    setNovaImagemPreview(URL.createObjectURL(arquivo));
  };

  const handleAbrirModal = () => {
    if (!usuarioId) {
      avisarSemCadastro("publicar uma ocorrência");
      return;
    }
    // Já sugere a cidade escolhida no filtro, se houver
    setNovaCidade(cidade);
    setModalAberto(true);
  };

  const handleFecharModal = () => {
    setNovaLegenda("");
    setNovaImagemPreview(null);
    setNovaImagemArquivo(null);
    setNovoTipo("");
    setNovaCidade("");
    setNovoBairro("");
    setNovoEndereco("");
    setModalAberto(false);
  };

  // Três etapas do formulário: tipo, local e conteúdo (descrição ou foto)
  const etapasConcluidas = [
    novoTipo !== "",
    novaCidade !== "" && novoEndereco.trim() !== "",
    novaLegenda.trim() !== "" || novaImagemPreview !== null,
  ].filter(Boolean).length;

  const formularioValido = etapasConcluidas === 3;

  const handlePublicar = async () => {
    if (!usuarioId) {
      avisarSemCadastro("publicar uma ocorrência");
      return;
    }
    if (!novoTipo || !novaCidade || !novoEndereco.trim()) return;
    if (!novaLegenda.trim() && !novaImagemArquivo) return;

    setPublicando(true);

    let imagemUrlFinal: string | null = null;

    if (novaImagemArquivo) {
      const nomeArquivo = `${usuarioId}/${Date.now()}-${novaImagemArquivo.name}`;
      // Ajuste "ocorrencias" abaixo caso o bucket de Storage tenha outro nome
      const { error: erroUpload } = await supabase.storage
        .from("ocorrencias")
        .upload(nomeArquivo, novaImagemArquivo);

      if (erroUpload) {
        console.error("Erro ao enviar imagem:", {
          message: erroUpload.message,
          name: (erroUpload as any).name,
          statusCode: (erroUpload as any).statusCode,
        });
        alert(`Não foi possível enviar a foto: ${erroUpload.message}`);
        setPublicando(false);
        return;
      }

      const { data: urlPublica } = supabase.storage
        .from("ocorrencias")
        .getPublicUrl(nomeArquivo);
      imagemUrlFinal = urlPublica.publicUrl;
    }

    const { error: erroInsercao } = await supabase.from("ocorrencias").insert({
      autor_id: usuarioId,
      tipo: novoTipo,
      cidade: novaCidade,
      bairro: novoBairro.trim(),
      endereco: novoEndereco.trim(),
      descricao: novaLegenda.trim() || null,
      imagem_url: imagemUrlFinal,
      status: "Aguardando",
    });

    setPublicando(false);

    if (erroInsercao) {
      console.error("Erro ao inserir ocorrência:", {
        message: erroInsercao.message,
        details: erroInsercao.details,
        hint: erroInsercao.hint,
        code: erroInsercao.code,
      });
      alert(`Não foi possível publicar a ocorrência: ${erroInsercao.message}`);
      return;
    }

    // Garante que a publicação nova apareça no feed, mesmo com filtros ativos
    setBusca("");
    setCategoriaAtiva("Todas");
    if (cidade && cidade !== novaCidade) setCidade("");

    handleFecharModal();
    carregarFeed();
  };

  const handleCurtir = async (id: string) => {
    if (!usuarioId) {
      avisarSemCadastro("curtir uma ocorrência");
      return;
    }

    const ocorrencia = ocorrencias.find((oc) => oc.id === id);
    if (!ocorrencia) return;
    const vaiCurtir = !ocorrencia.curtido;

    // Atualização otimista — muda na tela antes da resposta do banco
    setOcorrencias((prev) =>
      prev.map((oc) =>
        oc.id === id
          ? {
            ...oc,
            curtido: vaiCurtir,
            curtidas: vaiCurtir ? oc.curtidas + 1 : oc.curtidas - 1,
          }
          : oc,
      ),
    );

    if (vaiCurtir) {
      setCurtidaAnimando((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCurtidaAnimando((prev) => ({ ...prev, [id]: false }));
      }, 500);

      const { error } = await supabase
        .from("curtidas")
        .insert({ ocorrencia_id: id, usuario_id: usuarioId });
      if (error) console.error(error);
    } else {
      const { error } = await supabase
        .from("curtidas")
        .delete()
        .eq("ocorrencia_id", id)
        .eq("usuario_id", usuarioId);
      if (error) console.error(error);
    }
  };

  const abrirPost = (id: string) => setPostoSelecionado(id);
  const fecharPost = () => setPostoSelecionado(null);

  // ───── COMPARTILHAMENTO ─────
  // Link "público" da ocorrência (usa a própria URL da página + um parâmetro de identificação)
  const gerarLinkOcorrencia = (id: string) => {
    if (typeof window === "undefined") return "";
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?ocorrencia=${id}`;
  };

  const gerarTextoCompartilhamento = (oc: Ocorrencia) =>
    `${oc.tipo} em ${oc.bairro}, ${oc.cidade} — via Pluvite`;

  // No celular, abre o menu nativo de compartilhamento (o mesmo que apps como YouTube usam).
  // No desktop (ou se o navegador não suportar), abre o menu próprio com as opções abaixo.
  const handleCompartilhar = async (id: string) => {
    const ocorrencia = ocorrencias.find((oc) => oc.id === id);
    if (!ocorrencia) return;
    const link = gerarLinkOcorrencia(id);
    const texto = gerarTextoCompartilhamento(ocorrencia);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Pluvite", text: texto, url: link });
        return;
      } catch {
        // Se o usuário cancelar o share nativo, não faz nada
        return;
      }
    }

    setLinkCopiado(false);
    setCompartilhandoId(id);
  };

  const fecharCompartilhar = () => {
    setCompartilhandoId(null);
    setLinkCopiado(false);
  };

  const handleCopiarLink = async (id: string) => {
    const link = gerarLinkOcorrencia(id);
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2000);
    } catch {
      // Navegador sem permissão de clipboard — sem tratamento extra por enquanto
    }
  };

  const handleEnviarComentario = async (id: string) => {
    if (!usuarioId) {
      avisarSemCadastro("comentar");
      return;
    }

    const texto = (comentarioAtual[id] || "").trim();
    if (!texto) return;

    setComentarioAtual((prev) => ({ ...prev, [id]: "" }));

    // Atualização otimista — mostra o comentário antes da resposta do banco
    setOcorrencias((prev) =>
      prev.map((oc) =>
        oc.id === id
          ? {
            ...oc,
            comentarios: [
              ...oc.comentarios,
              { id: `temp-${Date.now()}`, autor: usuarioNome, texto },
            ],
          }
          : oc,
      ),
    );

    const { error } = await supabase.from("comentarios").insert({
      ocorrencia_id: id,
      autor_id: usuarioId,
      texto,
    });

    if (error) {
      console.error(error);
      alert("Não foi possível enviar o comentário.");
    }
  };

  // Contadores refletem o que está sendo exibido no feed
  const contagem = {
    aguardando: ocorrenciasFiltradas.filter((o) => o.status === "Aguardando")
      .length,
    andamento: ocorrenciasFiltradas.filter((o) => o.status === "Em Andamento")
      .length,
    visualizado: ocorrenciasFiltradas.filter((o) => o.status === "Visualizado")
      .length,
  };

  // Ranking de bairros calculado a partir das publicações (respeita a cidade escolhida)
  const bairrosRanking = Object.entries(
    ocorrencias
      .filter((o) => !cidade || o.cidade === cidade)
      .reduce<Record<string, number>>((acc, o) => {
        acc[o.bairro] = (acc[o.bairro] || 0) + 1;
        return acc;
      }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Números gerais da comunidade (sempre do total, sem respeitar filtros do feed)
  const estatisticas = {
    total: ocorrencias.length,
    concluidas: ocorrencias.filter((o) => o.status === "Concluído").length,
    cidadaosAtivos: new Set(ocorrencias.map((o) => o.autorId)).size,
  };

  return (
    <div className="min-h-screen w-full bg-[#f4f5f7]">
      {/* Animação do like — "pop" no ícone + onda saindo dele */}
      <style>{`
                @keyframes pluviteCurtirPop {
                    0% { transform: scale(1); }
                    35% { transform: scale(1.4) rotate(-10deg); }
                    65% { transform: scale(0.9); }
                    100% { transform: scale(1); }
                }
                .animate-curtir-pop {
                    animation: pluviteCurtirPop 450ms ease;
                }
            `}</style>
      {/* Um único acento de marca, discreto, no topo — em vez de vários blobs azuis espalhados */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-[#091f75]/[0.04] to-transparent" />

      <main className="relative z-10 max-w-[1600px] w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* BANNER — no lugar do título, mapa decorativo com "pessoas" e marcações plotadas */}
        <div className="relative overflow-hidden rounded-2xl bg-[#091f75] p-6 sm:p-8 text-white shadow-sm">
          <svg
            className="absolute inset-0 w-full h-full opacity-[0.18]"
            viewBox="0 0 1200 220"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M-20 30 C 200 0, 320 80, 480 50 S 780 0, 920 60 S 1180 50, 1240 15"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M-20 110 C 180 140, 360 90, 520 120 S 820 170, 980 110 S 1200 130, 1260 165"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M100 -10 C 130 50, 80 100, 140 150 S 260 210, 300 260"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M560 -10 C 540 40, 600 80, 570 130 S 520 200, 550 250"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M900 -10 C 880 50, 940 90, 910 140 S 870 200, 900 250"
              stroke="white"
              strokeWidth="1"
            />
            {/* "rio" — linha um pouco mais grossa e ondulada, cruzando o mapa */}
            <path
              d="M-20 175 C 240 150, 440 200, 700 165 S 1080 130, 1260 175"
              stroke="white"
              strokeWidth="1.5"
              strokeDasharray="1 7"
              strokeLinecap="round"
            />
          </svg>

          {/* grade de pontos, pra lembrar textura de papel de mapa */}
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(white 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />

          {/* Marcações "pin" com foto — como pessoas plotadas no mapa */}
          {[
            { img: 11, left: "42%", top: "10%", size: 40 },
            { img: 32, left: "54%", top: "56%", size: 32 },
            { img: 47, left: "66%", top: "16%", size: 44 },
            { img: 5, left: "78%", top: "50%", size: 36 },
            { img: 59, left: "90%", top: "12%", size: 36, lgOnly: true },
          ].map((m) => (
            <div
              key={m.img}
              className={`${m.lgOnly ? "hidden lg:block" : "hidden sm:block"} absolute -translate-x-1/2`}
              style={{ left: m.left, top: m.top }}
            >
              <div className="relative flex flex-col items-center">
                <img
                  src={`https://i.pravatar.cc/100?img=${m.img}`}
                  alt=""
                  aria-hidden="true"
                  style={{ width: m.size, height: m.size }}
                  className="rounded-full object-cover ring-2 ring-white shadow-md"
                />
                {/* ponta do pin */}
                <span className="w-2.5 h-2.5 bg-white rotate-45 -mt-[5px] shadow-sm" />
              </div>
            </div>
          ))}

          {/* Marcações simples, sem foto — reforçam a leitura de "vários pontos no mapa" */}
          {[
            { left: "35%", top: "40%" },
            { left: "60%", top: "38%" },
            { left: "73%", top: "68%" },
            { left: "25%", top: "62%" },
          ].map((m, i) => (
            <MapPin
              key={i}
              size={16}
              strokeWidth={2.5}
              className="hidden sm:block absolute -translate-x-1/2 -translate-y-full text-white/70 drop-shadow"
              style={{ left: m.left, top: m.top }}
            />
          ))}

          <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-5">
            <div className="max-w-xl space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Feed de Ocorrências
              </h1>
              <p className="text-xs sm:text-sm text-white leading-relaxed">
                Aqui você acompanha, em tempo real, alagamentos, quedas de
                árvore, buracos e outros riscos relatados pela comunidade da sua
                região. Publique o que você vê, siga o status de cada
                atendimento e ajude a mapear onde agir primeiro.
              </p>
            </div>

            <button
              onClick={handleAbrirModal}
              className="flex items-center justify-center gap-2 bg-white hover:bg-blue-50 text-[#091f75] text-sm font-semibold px-5 py-3 rounded-xl transition cursor-pointer shadow-sm shrink-0"
            >
              <Plus size={18} />
              <span>Publicar Ocorrência</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* COLUNA ESQUERDA */}
          <div className="w-full lg:w-2/3">
            {/* FILTROS DE PESQUISA  */}
            <div className="pt-6 pb-2 md:bg-[#f4f5f7] md:sticky md:top-14 md:z-30">
              <div className="bg-white px-3 py-4 sm:px-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <MenuSuspenso
                    id="filtro-cidade"
                    className="sm:w-64"
                    valor={cidade}
                    onChange={setCidade}
                    opcoes={opcoesCidadeFiltro}
                    placeholder="Todas as cidades"
                    icone={<MapPin size={16} />}
                    negrito
                  />

                  <div className="relative flex-1">
                    <Search
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Buscar por bairro, rua ou descrição (ex: Quiririm)..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      className={`${CAMPO_CLASSE} pl-10 pr-10`}
                    />
                    {busca && (
                      <button
                        onClick={() => setBusca("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="Limpar busca"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* CATEGORIAS — chips quadrados (rounded-lg), com ícone e quantidade.
                    Rola horizontalmente se não couber, mas sem mostrar a barra de rolagem. */}
                <div
                  className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 pt-3 pb-0.5 -mx-1 px-1 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  <Filter size={13} className="text-slate-400 mr-0.5 shrink-0" />
                  {categorias.map((cat) => {
                    const IconeCat = ICONE_CATEGORIA[cat] ?? FileText;
                    const ativa = categoriaAtiva === cat;
                    const total =
                      cat === "Todas"
                        ? ocorrenciasNaCidade.length
                        : ocorrenciasNaCidade.filter((o) => o.tipo === cat).length;

                    return (
                      <button
                        key={cat}
                        onClick={() => setCategoriaAtiva(cat)}
                        className={`group flex items-center gap-1 pl-2 pr-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${ativa
                          ? "bg-[#091f75] text-white border-[#091f75] shadow-sm shadow-[#091f75]/25"
                          : "bg-white text-slate-600 border-slate-200 hover:border-[#091f75]/30 hover:bg-blue-50/60 hover:text-[#091f75]"
                          }`}
                      >
                        <IconeCat
                          size={13}
                          className={
                            ativa
                              ? "text-white"
                              : "text-slate-400 group-hover:text-[#091f75]"
                          }
                        />
                        {cat}
                        <span
                          className={`min-w-[16px] text-center rounded-md px-0.5 py-px text-[10px] font-bold ${ativa
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 text-slate-500 group-hover:bg-white"
                            }`}
                        >
                          {total}
                        </span>
                      </button>
                    );
                  })}

                  {temFiltroAtivo && (
                    <button
                      onClick={limparFiltros}
                      className="ml-auto pl-3 flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-red-600 whitespace-nowrap shrink-0 cursor-pointer transition"
                    >
                      <X size={13} />
                      Limpar filtros
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* FEED */}
            <div className="space-y-4 pt-4">
              <p className="text-xs font-semibold text-slate-500 px-1">
                {ocorrenciasFiltradas.length}{" "}
                {ocorrenciasFiltradas.length === 1
                  ? "ocorrência encontrada"
                  : "ocorrências encontradas"}
              </p>

              {carregandoFeed && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center text-center gap-3">
                  <p className="text-xs text-slate-500 font-semibold">
                    Carregando ocorrências...
                  </p>
                </div>
              )}

              {!carregandoFeed && ocorrenciasFiltradas.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center text-center gap-3">
                  <div className="p-3 rounded-full bg-slate-100 text-slate-400">
                    <Search size={22} />
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    Nenhuma ocorrência encontrada
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xs">
                    Não há publicações com esses filtros. Tente outra busca ou
                    limpe os filtros.
                  </p>
                  <button
                    onClick={limparFiltros}
                    className="mt-1 bg-[#091f75] hover:bg-[#0f2a8f] text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
                  >
                    Limpar filtros
                  </button>
                </div>
              )}

              {ocorrenciasFiltradas.map((oc) => {
                const estilo = STATUS_ESTILO[oc.status];
                const StatusIcon = estilo.icon;

                return (
                  <article
                    key={oc.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:border-slate-300 transition"
                  >
                    <div className="p-4 sm:p-5 flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-[#091f75] text-white font-bold flex items-center justify-center text-xs shrink-0 overflow-hidden">
                          {oc.autorAvatarUrl ? (
                            <img
                              src={oc.autorAvatarUrl}
                              alt={oc.autor}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            oc.iniciais
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 text-sm leading-snug truncate">
                            {oc.autor}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 mt-0.5">
                            <MapPin
                              size={12}
                              className="text-slate-400 shrink-0"
                            />
                            <span className="truncate">{oc.endereco}</span>
                            <span className="text-slate-300">•</span>
                            <span className="font-semibold text-slate-700">
                              {oc.bairro}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span>{oc.cidade}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-[11px] text-slate-400 font-medium">
                          {oc.tempo}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 border ${estilo.badge}`}
                        >
                          <StatusIcon size={12} />
                          {estilo.texto}
                        </span>
                      </div>
                    </div>

                    {/* TIPO DA OCORRÊNCIA — chip neutro, quadrado, combinando com os filtros */}
                    <div className="px-4 sm:px-5 pb-3 -mt-1.5">
                      <span className="text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                        {oc.tipo}
                      </span>
                    </div>

                    {/* FOTO DA OCORRÊNCIA — clique abre o post completo, tipo Instagram */}
                    {oc.imagemUrl && (
                      <button
                        onClick={() => abrirPost(oc.id)}
                        className="w-full h-72 sm:h-80 bg-slate-100 overflow-hidden relative block cursor-pointer"
                      >
                        <img
                          src={oc.imagemUrl}
                          alt="Foto da ocorrência"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    )}

                    {/* BARRA DE INTERAÇÕES E AÇÕES */}
                    <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-semibold">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => handleCurtir(oc.id)}
                          className={`relative flex items-center gap-1.5 transition cursor-pointer ${oc.curtido ? "text-red-600" : "text-slate-500 hover:text-red-600"}`}
                        >
                          {curtidaAnimando[oc.id] && (
                            <span className="absolute -left-1.5 -top-1.5 w-7 h-7 rounded-full bg-red-500/20 animate-ping pointer-events-none" />
                          )}
                          <ThumbsUp
                            size={15}
                            fill={oc.curtido ? "currentColor" : "none"}
                            className={
                              curtidaAnimando[oc.id] ? "animate-curtir-pop" : ""
                            }
                          />
                          <span>Curtidas ({oc.curtidas})</span>
                        </button>
                        <button
                          onClick={() => abrirPost(oc.id)}
                          className="flex items-center gap-1.5 hover:text-[#091f75] transition cursor-pointer"
                        >
                          <MessageSquare size={15} />
                          <span>Comentários ({oc.comentarios.length})</span>
                        </button>
                      </div>

                      <button
                        onClick={() => handleCompartilhar(oc.id)}
                        className="flex items-center gap-1.5 hover:text-[#091f75] transition cursor-pointer"
                      >
                        <Share2 size={15} />
                        <span className="hidden sm:inline">Compartilhar</span>
                      </button>
                    </div>

                    {/* PRÉVIA DA LEGENDA — clique abre o post completo */}
                    {oc.descricao && (
                      <button
                        onClick={() => abrirPost(oc.id)}
                        className="block w-full text-left px-4 sm:px-5 pb-3 text-xs text-slate-700 font-medium leading-relaxed cursor-pointer"
                      >
                        <span className="font-bold text-slate-900">
                          {oc.autor}
                        </span>{" "}
                        <span className="line-clamp-2">{oc.descricao}</span>
                      </button>
                    )}

                    {oc.comentarios.length > 0 && (
                      <button
                        onClick={() => abrirPost(oc.id)}
                        className="block w-full text-left px-4 sm:px-5 pb-4 -mt-1.5 text-xs text-slate-400 font-semibold hover:text-slate-600 cursor-pointer"
                      >
                        Ver{" "}
                        {oc.comentarios.length === 1
                          ? "o comentário"
                          : `todos os ${oc.comentarios.length} comentários`}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          {/* COLUNA DIREITA */}
          <aside className="w-full lg:w-1/3 lg:sticky lg:top-14 lg:self-start pt-6 space-y-3">
            {/* STATUS */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center gap-1 shadow-sm">
                <div className="p-1.5 rounded-lg bg-red-50 text-red-600">
                  <AlertTriangle size={15} />
                </div>
                <span className="text-lg font-black text-slate-800 leading-tight">
                  {contagem.aguardando}
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center">
                  Aguardando
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center gap-1 shadow-sm">
                <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                  <Wrench size={15} />
                </div>
                <span className="text-lg font-black text-slate-800 leading-tight">
                  {contagem.andamento}
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center">
                  Em Andamento
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center gap-1 shadow-sm">
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <Eye size={15} />
                </div>
                <span className="text-lg font-black text-slate-800 leading-tight">
                  {contagem.visualizado}
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center">
                  Visualizados
                </span>
              </div>
            </div>

            {/* CARD BAIRROS */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-[#091f75]" />
                Bairros com mais relatos
              </h3>

              <div className="space-y-2 pt-1">
                {bairrosRanking.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium">
                    Nenhum relato nessa região ainda.
                  </p>
                ) : (
                  bairrosRanking.map(([bairro, chamados]) => (
                    <div
                      key={bairro}
                      className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100"
                    >
                      <span className="font-semibold text-slate-700">
                        {bairro}
                      </span>
                      <span className="text-[11px] font-bold text-[#091f75] bg-blue-50 px-2 py-0.5 rounded-md">
                        {chamados} {chamados === 1 ? "relato" : "relatos"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* CARD ESTATÍSTICAS DA COMUNIDADE */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <Users size={16} className="text-[#091f75]" />
                Estatísticas da comunidade
              </h3>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 flex flex-col items-center gap-0.5">
                  <span className="text-lg font-black text-[#091f75] leading-tight">
                    {estatisticas.total}
                  </span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center">
                    Relatos no total
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col items-center gap-0.5">
                  <span className="text-lg font-black text-emerald-600 leading-tight">
                    {estatisticas.concluidas}
                  </span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center">
                    Resolvidos
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col items-center gap-0.5">
                  <span className="text-lg font-black text-slate-800 leading-tight">
                    {estatisticas.cidadaosAtivos}
                  </span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center">
                    Cidadãos ativos
                  </span>
                </div>
              </div>
            </div>

            {/* CARD DICAS DE SEGURANÇA */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <ShieldAlert size={16} className="text-[#091f75]" />
                Dicas de segurança
              </h3>
              <ul className="space-y-1.5">
                {[
                  "Evite atravessar ruas alagadas, mesmo que a água pareça rasa.",
                  "Em caso de deslizamento, afaste-se de encostas e barrancos.",
                  "Desligue a energia elétrica se a água invadir sua casa.",
                ].map((dica, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[11px] text-slate-600 leading-snug"
                  >
                    <span className="w-4 h-4 rounded-full bg-blue-50 text-[#091f75] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {dica}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </main>

      {/* MODAL DE POST COMPLETO (ESTILO INSTAGRAM) */}
      {postoSelecionado &&
        (() => {
          const post = ocorrencias.find((o) => o.id === postoSelecionado);
          if (!post) return null;
          const estiloPost = STATUS_ESTILO[post.status];
          const StatusIconPost = estiloPost.icon;

          return (
            <div
              className="fixed inset-0 bg-slate-950/90 z-[10002] flex items-center justify-center p-4"
              onClick={fecharPost}
            >
              <button
                onClick={fecharPost}
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
                {post.imagemUrl && (
                  <div className="w-full md:w-3/5 bg-black flex items-center justify-center max-h-[45vh] md:max-h-[90vh] shrink-0">
                    <img
                      src={post.imagemUrl}
                      alt="Foto da ocorrência"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {/* PAINEL DE LEGENDA E COMENTÁRIOS */}
                <div className="w-full md:w-2/5 flex flex-col min-h-0">
                  {/* CABEÇALHO DO POST */}
                  <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[#091f75] text-white font-bold flex items-center justify-center text-xs shadow-sm shrink-0 overflow-hidden">
                        {post.autorAvatarUrl ? (
                          <img
                            src={post.autorAvatarUrl}
                            alt={post.autor}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          post.iniciais
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-sm leading-snug truncate">
                          {post.autor}
                        </h3>
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                          <MapPin
                            size={11}
                            className="text-slate-400 shrink-0"
                          />
                          <span className="truncate">
                            {post.endereco} • {post.bairro} • {post.cidade}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 border shrink-0 ${estiloPost.badge}`}
                    >
                      <StatusIconPost size={11} />
                      {estiloPost.texto}
                    </span>
                  </div>

                  {/* LEGENDA + COMENTÁRIOS (rolável) */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5">
                    <span className="inline-block text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                      {post.tipo}
                    </span>

                    {post.descricao && (
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#091f75] text-white font-bold flex items-center justify-center text-[10px] shrink-0 overflow-hidden">
                          {post.autorAvatarUrl ? (
                            <img
                              src={post.autorAvatarUrl}
                              alt={post.autor}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            post.iniciais
                          )}
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          <span className="font-bold text-slate-900">
                            {post.autor}
                          </span>{" "}
                          {post.descricao}
                        </p>
                      </div>
                    )}

                    {post.comentarios.length === 0 ? (
                      <p className="text-xs text-slate-400 font-medium pt-1">
                        Nenhum comentário ainda. Seja o primeiro a comentar.
                      </p>
                    ) : (
                      post.comentarios.map((com) => (
                        <div key={com.id} className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-[10px] shrink-0">
                            {gerarIniciais(com.autor)}
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            <span className="font-bold text-slate-900">
                              {com.autor}
                            </span>{" "}
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
                          onClick={() => handleCurtir(post.id)}
                          className={`relative transition cursor-pointer ${post.curtido ? "text-red-600" : "text-slate-500 hover:text-red-600"}`}
                          title="Curtir"
                        >
                          {curtidaAnimando[post.id] && (
                            <span className="absolute -left-2 -top-2 w-9 h-9 rounded-full bg-red-500/20 animate-ping pointer-events-none" />
                          )}
                          <ThumbsUp
                            size={20}
                            fill={post.curtido ? "currentColor" : "none"}
                            className={
                              curtidaAnimando[post.id]
                                ? "animate-curtir-pop"
                                : ""
                            }
                          />
                        </button>
                        <MessageSquare size={20} className="text-slate-500" />
                        <button
                          onClick={() => handleCompartilhar(post.id)}
                          className="text-slate-500 hover:text-[#091f75] transition cursor-pointer"
                          title="Compartilhar"
                        >
                          <Share2 size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="px-4 pt-2">
                      <span className="text-xs font-bold text-slate-800 block">
                        {post.curtidas}{" "}
                        {post.curtidas === 1 ? "curtida" : "curtidas"}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">
                        {post.tempo}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 p-4 pt-3">
                      <input
                        type="text"
                        value={comentarioAtual[post.id] || ""}
                        onChange={(e) =>
                          setComentarioAtual((prev) => ({
                            ...prev,
                            [post.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleEnviarComentario(post.id);
                        }}
                        placeholder="Adicione um comentário..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#091f75]"
                      />
                      <button
                        onClick={() => handleEnviarComentario(post.id)}
                        className="p-2.5 rounded-xl bg-[#091f75] hover:bg-[#0f2a8f] text-white transition cursor-pointer shrink-0"
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

      {/* MENU DE COMPARTILHAMENTO — link + redes sociais, estilo YouTube/Instagram.
                Só aparece em telas onde a Web Share API nativa não está disponível (desktop). */}
      {compartilhandoId &&
        (() => {
          const oc = ocorrencias.find((o) => o.id === compartilhandoId);
          if (!oc) return null;

          const link = gerarLinkOcorrencia(oc.id);
          const texto = gerarTextoCompartilhamento(oc);

          const opcoes = [
            {
              nome: "WhatsApp",
              href: `https://wa.me/?text=${encodeURIComponent(`${texto} ${link}`)}`,
              classe: "bg-[#25D366]",
              icone: (
                <MessageCircle size={20} className="text-white" fill="white" />
              ),
            },
            {
              nome: "Telegram",
              href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(texto)}`,
              classe: "bg-[#26A5E4]",
              icone: <Send size={19} className="text-white" />,
            },
            {
              nome: "Facebook",
              href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
              classe: "bg-[#1877F2]",
              icone: (
                <span className="text-white font-black text-base leading-none">
                  f
                </span>
              ),
            },
            {
              nome: "X",
              href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(link)}&text=${encodeURIComponent(texto)}`,
              classe: "bg-slate-900",
              icone: (
                <span className="text-white font-black text-sm leading-none">
                  X
                </span>
              ),
            },
            {
              nome: "E-mail",
              href: `mailto:?subject=${encodeURIComponent("Ocorrência reportada no Pluvite")}&body=${encodeURIComponent(`${texto}\n\n${link}`)}`,
              classe: "bg-slate-500",
              icone: <Mail size={19} className="text-white" />,
            },
          ];

          return (
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[10003] flex items-end sm:items-center justify-center p-4"
              onClick={fecharCompartilhar}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* CABEÇALHO */}
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
                  <div className="min-w-0">
                    <h2 className="font-bold text-slate-900 text-sm leading-tight">
                      Compartilhar
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {oc.tipo} em {oc.bairro}, {oc.cidade}
                    </p>
                  </div>
                  <button
                    onClick={fecharCompartilhar}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer shrink-0"
                    title="Fechar"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* OPÇÕES DE REDES SOCIAIS */}
                <div className="px-5 pt-5 pb-2">
                  <div className="grid grid-cols-5 gap-2.5">
                    {opcoes.map((op) => (
                      <a
                        key={op.nome}
                        href={op.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center gap-1.5 group"
                      >
                        <span
                          className={`w-11 h-11 rounded-full flex items-center justify-center shadow-sm transition group-hover:opacity-90 group-active:scale-95 ${op.classe}`}
                        >
                          {op.icone}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">
                          {op.nome}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>

                {/* LINK COPIÁVEL */}
                <div className="px-5 pb-5 pt-3">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1.5 pl-3.5">
                    <span className="flex-1 text-xs text-slate-500 truncate">
                      {link}
                    </span>
                    <button
                      onClick={() => handleCopiarLink(oc.id)}
                      className={`flex items-center gap-1.5 shrink-0 text-xs font-bold px-3.5 py-2 rounded-xl transition cursor-pointer ${linkCopiado
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-[#091f75] hover:bg-[#0f2a8f] text-white"
                        }`}
                    >
                      {linkCopiado ? <Check size={14} /> : <Copy size={14} />}
                      {linkCopiado ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* MODAL DE NOVA PUBLICAÇÃO
                Largo e em duas colunas (tipo/local à esquerda, descrição/foto à direita) pra caber
                sem rolagem. Nas telas maiores o corpo não tem overflow, assim as listas dos menus
                suspensos abrem por cima do modal em vez de criar uma barra de rolagem. */}
      {modalAberto && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[10001] flex items-center justify-center p-4"
          onClick={handleFecharModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 border-t-[3px] border-t-[#091f75] w-full max-w-4xl max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#091f75]/[0.08] text-[#091f75] flex items-center justify-center shrink-0">
                  <Megaphone size={18} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base leading-tight">
                    Publicar Ocorrência
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Conte o que está acontecendo e ajude a mapear onde agir
                    primeiro.
                  </p>
                </div>
              </div>

              <button
                onClick={handleFecharModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer shrink-0"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto md:overflow-visible">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6">
                {/* COLUNA ESQUERDA: TIPO E LOCALIZAÇÃO */}
                <div className="space-y-4 md:pr-8">
                  <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <MapPin size={13} className="text-[#091f75]/70" />
                    Tipo e localização
                  </h3>

                  <CampoModal
                    htmlFor="novo-tipo"
                    rotulo="Categoria"
                    obrigatorio
                  >
                    <MenuSuspenso
                      id="novo-tipo"
                      valor={novoTipo}
                      onChange={(v) => setNovoTipo(v as TipoOcorrencia | "")}
                      opcoes={opcoesTipo}
                      placeholder="Selecione o tipo"
                    />
                  </CampoModal>

                  <CampoModal htmlFor="nova-cidade" rotulo="Cidade" obrigatorio>
                    <MenuSuspenso
                      id="nova-cidade"
                      valor={novaCidade}
                      onChange={setNovaCidade}
                      opcoes={opcoesCidade}
                      placeholder="Selecione a cidade"
                    />
                  </CampoModal>

                  <CampoModal htmlFor="novo-bairro" rotulo="Bairro">
                    <input
                      id="novo-bairro"
                      type="text"
                      value={novoBairro}
                      onChange={(e) => setNovoBairro(e.target.value)}
                      placeholder="Ex: Quiririm (deixe vazio em rodovias)"
                      className={CAMPO_CLASSE}
                    />
                  </CampoModal>

                  <CampoModal
                    htmlFor="novo-endereco"
                    rotulo="Endereço"
                    obrigatorio
                  >
                    <div className="relative">
                      <MapPin
                        size={16}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        id="novo-endereco"
                        type="text"
                        value={novoEndereco}
                        onChange={(e) => setNovoEndereco(e.target.value)}
                        placeholder="Rua e número (ou ponto de referência)"
                        className={`${CAMPO_CLASSE} pl-10`}
                      />
                    </div>
                  </CampoModal>
                </div>

                {/* COLUNA DIREITA: DESCRIÇÃO E FOTO */}
                <div className="space-y-4 md:pl-8 md:border-l md:border-slate-100">
                  <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <FileText size={13} className="text-[#091f75]/70" />
                    Detalhes
                  </h3>

                  <CampoModal htmlFor="nova-legenda" rotulo="Descrição">
                    <textarea
                      id="nova-legenda"
                      value={novaLegenda}
                      onChange={(e) => setNovaLegenda(e.target.value)}
                      placeholder="Descreva o que está acontecendo..."
                      rows={4}
                      className={`${CAMPO_CLASSE} resize-none`}
                    />
                  </CampoModal>

                  <input
                    ref={inputImagemRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSelecionarImagem}
                    className="hidden"
                  />

                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1.5">
                      <Camera size={13} className="text-slate-400" />
                      Foto
                      <span className="font-medium text-slate-400">
                        (descrição ou foto — ao menos um)
                      </span>
                    </p>

                    {novaImagemPreview ? (
                      <div className="relative w-full h-36 rounded-2xl overflow-hidden border border-slate-200">
                        <img
                          src={novaImagemPreview}
                          alt="Prévia"
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => {
                            setNovaImagemPreview(null);
                            setNovaImagemArquivo(null);
                          }}
                          className="absolute top-2 right-2 bg-slate-900/60 hover:bg-slate-900/80 text-white p-1.5 rounded-full cursor-pointer transition"
                          title="Remover foto"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => inputImagemRef.current?.click()}
                        className="w-full h-36 flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-200 hover:border-[#091f75]/50 hover:bg-slate-50 rounded-2xl text-slate-400 hover:text-[#091f75] transition cursor-pointer"
                      >
                        <ImagePlus size={22} />
                        <span className="text-xs font-bold">
                          Adicionar foto
                        </span>
                        <span className="text-[11px] font-medium text-slate-400">
                          Clique para escolher uma imagem
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* RODAPÉ */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/70 rounded-b-2xl shrink-0">
              <p
                className={`text-[11px] font-semibold flex items-center gap-1.5 ${formularioValido ? "text-[#091f75]" : "text-slate-500"}`}
              >
                {formularioValido && <CheckCircle size={13} />}
                {formularioValido
                  ? "Tudo certo para publicar."
                  : `${etapasConcluidas} de 3 etapas: tipo, local e descrição ou foto.`}
              </p>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleFecharModal}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-4 py-2.5 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePublicar}
                  disabled={!formularioValido || publicando}
                  className="flex items-center gap-2 bg-[#091f75] hover:bg-[#0f2a8f] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold px-5 py-2.5 rounded-xl transition cursor-pointer"
                >
                  <Plus size={14} />
                  {publicando ? "Publicando..." : "Publicar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

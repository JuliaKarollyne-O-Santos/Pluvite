// Listas oficiais do domínio Pluvite (ver SKILLS/pluvite-domain). Importe daqui em vez de
// redeclarar as listas em cada página.

// Os 39 municípios do Vale do Paraíba e Litoral Norte
export const MUNICIPIOS = [
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

export type Municipio = (typeof MUNICIPIOS)[number];

// Centro urbano de cada município [lat, lng]: média das interseções da área de ~3 km mais densa do
// grafo viário OSM (Rotas/*_graph.json). Cunha não tem grafo: coordenada aproximada da sede.
// Usado para abrir mapas já na cidade (ex.: marcar o local de uma ocorrência no Feed).
export const CENTRO_MUNICIPIO: Record<Municipio, [number, number]> = {
  Aparecida: [-22.8459, -45.233],
  Arapeí: [-22.6759, -44.4474],
  Areias: [-22.5831, -44.6985],
  Bananal: [-22.6834, -44.3188],
  Caçapava: [-23.1058, -45.7062],
  "Cachoeira Paulista": [-22.6675, -45.0124],
  "Campos do Jordão": [-22.7356, -45.5847],
  Canas: [-22.705, -45.0537],
  Caraguatatuba: [-23.6281, -45.4255],
  Cruzeiro: [-22.5749, -44.9644],
  Cunha: [-23.0746, -44.9597],
  Guaratinguetá: [-22.8055, -45.1927],
  Igaratá: [-23.2098, -46.1572],
  Ilhabela: [-23.8194, -45.366],
  Jacareí: [-23.2957, -45.955],
  Jambeiro: [-23.3198, -45.7268],
  Lagoinha: [-23.0907, -45.1925],
  Lavrinhas: [-22.5618, -44.9191],
  Lorena: [-22.7355, -45.1161],
  "Monteiro Lobato": [-22.9542, -45.8386],
  "Natividade da Serra": [-23.3774, -45.445],
  Paraibuna: [-23.3837, -45.6651],
  Pindamonhangaba: [-22.9349, -45.4642],
  Piquete: [-22.6136, -45.178],
  Potim: [-22.8354, -45.2565],
  Queluz: [-22.5381, -44.7748],
  "Redenção da Serra": [-23.2761, -45.5338],
  Roseira: [-22.898, -45.3079],
  "Santa Branca": [-23.4009, -45.8857],
  "Santo Antônio do Pinhal": [-22.8192, -45.6719],
  "São Bento do Sapucaí": [-22.6919, -45.7335],
  "São José do Barreiro": [-22.6439, -44.5773],
  "São José dos Campos": [-23.2452, -45.9047],
  "São Luiz do Paraitinga": [-23.2202, -45.3129],
  "São Sebastião": [-23.8054, -45.4069],
  Silveiras: [-22.6666, -44.852],
  Taubaté: [-23.0257, -45.5554],
  Tremembé: [-22.9723, -45.5468],
  Ubatuba: [-23.446, -45.0759],
};

// Tipos de ocorrência publicados no Feed. O efeito de cada um na rota (bloqueio/restrição, raio,
// validade) fica no backend: app/backend/rotas/ocorrencias.js › EFEITO_OCORRENCIA.
export const TIPOS_OCORRENCIA = [
  "Acidente",
  "Alagamento",
  "Árvore caída",
  "Buraco na via",
  "Deslizamento de terra",
  "Via interditada",
  "Outros",
] as const;

export type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];

// Remove acentos e maiúsculas pra a busca achar "Tremembe" digitando "tremembé" e vice-versa
export const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Fluxo de status de uma ocorrência, nessa ordem
export const STATUS_OCORRENCIA = [
  "Aguardando",
  "Visualizado",
  "Em Andamento",
  "Concluído",
] as const;

export type StatusOcorrencia = (typeof STATUS_OCORRENCIA)[number];

// Níveis de prioridade/risco (do mais brando ao mais grave) e a cor de cada um
export const PRIORIDADES = [
  "Zona Segura",
  "Atenção Crítica",
  "Estado de Alerta",
  "Alerta Máximo",
] as const;

export type Prioridade = (typeof PRIORIDADES)[number];

export const CORES_PRIORIDADE: Record<Prioridade, string> = {
  "Zona Segura": "#0a9667",
  "Atenção Crítica": "#f59e0b",
  "Estado de Alerta": "#ef4444",
  "Alerta Máximo": "#653dc2",
};

// Mapeamento padrão tipo de ocorrência → prioridade. É o valor usado quando a
// equipe Pluvite ainda não configurou nada na tela "Níveis de Risco" do
// painel /Adm (tabela "config_prioridades") — ver web/app/Adm/PainelPrioridades.tsx.
export const PRIORIDADE_POR_TIPO_PADRAO: Record<TipoOcorrencia, Prioridade> = {
  "Deslizamento de terra": "Alerta Máximo",
  Alagamento: "Estado de Alerta",
  Acidente: "Atenção Crítica",
  "Via interditada": "Atenção Crítica",
  "Árvore caída": "Atenção Crítica",
  "Buraco na via": "Atenção Crítica",
  Outros: "Zona Segura",
};
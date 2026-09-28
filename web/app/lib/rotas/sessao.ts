// Cidade e trajeto escolhidos em /Rotas guardados FORA do componente: sair da página (ir ao Feed,
// por exemplo) desmonta a página e apagaria o estado. O valor fica em memória no módulo — o que já
// o preserva na navegação entre páginas — e em sessionStorage, para sobreviver a um recarregamento.
// Dura enquanto a aba estiver aberta; a rota em si é recalculada ao voltar (o tempo depende do horário).

import { MUNICIPIOS, type Municipio } from "@/app/lib/constantes";
import type { Ponto } from "./api";

// Campo de origem/destino: o texto digitado e o ponto já escolhido (rua da lista, GPS ou mapa)
export interface CampoPonto {
  texto: string;
  ponto: Ponto | null;
}

export interface SessaoRotas {
  cidade: Municipio | null;
  origem: CampoPonto;
  destino: CampoPonto;
}

export const CAMPO_VAZIO: CampoPonto = { texto: "", ponto: null };

const SESSAO_VAZIA: SessaoRotas = { cidade: null, origem: CAMPO_VAZIO, destino: CAMPO_VAZIO };

const CHAVE_SESSAO = "pluvite:rotas:sessao";

let sessao: SessaoRotas | null = null;
const ouvintes = new Set<() => void>();

const ehPonto = (valor: unknown): valor is Ponto => {
  if (typeof valor !== "object" || valor === null) return false;
  const ponto = valor as Record<string, unknown>;
  if (typeof ponto.rua === "string") return true;
  return typeof ponto.lat === "number" && typeof ponto.lng === "number";
};

const lerCampo = (valor: unknown): CampoPonto => {
  const campo = valor as Partial<CampoPonto> | undefined;
  if (typeof campo?.texto !== "string") return CAMPO_VAZIO;
  return { texto: campo.texto, ponto: ehPonto(campo.ponto) ? campo.ponto : null };
};

// O conteúdo do sessionStorage pode estar velho ou adulterado: só volta o que ainda é válido
const restaurar = (): SessaoRotas => {
  try {
    const bruto = sessionStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return SESSAO_VAZIA;
    const dados = JSON.parse(bruto) as Partial<SessaoRotas>;
    const cidade = MUNICIPIOS.find((m) => m === dados.cidade) ?? null;
    if (!cidade) return SESSAO_VAZIA;
    return { cidade, origem: lerCampo(dados.origem), destino: lerCampo(dados.destino) };
  } catch {
    // Sem sessionStorage (aba anônima, bloqueio) ou JSON inválido: começa do zero
    return SESSAO_VAZIA;
  }
};

export const assinarSessao = (ouvinte: () => void) => {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
};

// Snapshot estável para useSyncExternalStore: só muda quando gravarSessao é chamado
export const lerSessao = (): SessaoRotas => (sessao ??= restaurar());

// O servidor não tem sessionStorage. null = "ainda não hidratou", para a página não piscar a
// caixa de escolher cidade antes de saber se já existe uma guardada.
export const lerSessaoNoServidor = (): SessaoRotas | null => null;

export const gravarSessao = (mudanca: Partial<SessaoRotas>) => {
  sessao = { ...lerSessao(), ...mudanca };
  try {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  } catch {
    // Sem sessionStorage o trajeto ainda sobrevive à troca de páginas (memória do módulo)
  }
  ouvintes.forEach((ouvinte) => ouvinte());
};

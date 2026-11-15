// Identidade visual do ScoreRP

export const COR_SCORE = 0x2cb6ff;

export interface Departamento {
  sigla: string;
  nome: string;
  emoji: string;
  cor: string; // #RRGGBB
  termoMembro: string; // ex.: "Agente", "Guarda"
  termoMembros: string; // ex.: "Agentes", "Guardas"
  iconUrl?: string;
}

// Departamentos oficiais do ScoreRP
export const DEPARTAMENTOS: Departamento[] = [
  {
    sigla: "PSP",
    nome: "Polícia de Segurança Pública",
    emoji: "👮",
    cor: "#0071C7",
    termoMembro: "Agente",
    termoMembros: "Agentes",
  },
  {
    sigla: "GNR",
    nome: "Guarda Nacional Republicana",
    emoji: "💂",
    cor: "#197016",
    termoMembro: "Guarda",
    termoMembros: "Guardas",
  },
  {
    sigla: "RSB",
    nome: "Regimento de Sapadores Bombeiros",
    emoji: "🧑🚒",
    cor: "#740ABB",
    termoMembro: "Sapador",
    termoMembros: "Sapadores",
  },
  {
    sigla: "SEM",
    nome: "Serviço de Emergência Médica",
    emoji: "🧑⚕️",
    cor: "#D3EA1A",
    termoMembro: "Operacional",
    termoMembros: "Operacionais",
  },
  {
    sigla: "STJ",
    nome: "Supremo Tribunal de Justiça",
    emoji: "🧑⚖️",
    cor: "#7A7A7A",
    termoMembro: "Magistrado",
    termoMembros: "Magistrados",
  },
  {
    sigla: "MP",
    nome: "Ministério Público",
    emoji: "🧑🎓",
    cor: "#FF1C20",
    termoMembro: "Procurador",
    termoMembros: "Procuradores",
  },
  {
    sigla: "ANEPC",
    nome: "Autoridade Nacional de Emergência e Proteção Civil",
    emoji: "🧑💻",
    cor: "#EC5F01",
    termoMembro: "Operacional",
    termoMembros: "Operacionais",
  },
];

export const EMOJI_ESTADO = {
  PENDENTE: "⏳",
  APROVADO: "✅",
  SUSPENSO: "⛔",
} as const;

// Converte hex "#0071C7" para número decimal que o Discord usa nos Embeds
export function corParaNumero(cor: string): number {
  return parseInt(cor.replace("#", ""), 16);
}

// Procura um departamento pela sigla (ex: "PSP", "GNR", etc.)
export function obterDepartamento(sigla?: string | null): Departamento | undefined {
  if (!sigla) return undefined;
  return DEPARTAMENTOS.find((d) => d.sigla.toUpperCase() === sigla.toUpperCase());
}

// Utilitários de interface e mensagens padrão
export const UI = {
  COR_SCORE,
  cor: COR_SCORE,
  corPadrao: COR_SCORE,
  corSucesso: 0x57f287,
  corErro: 0xed4245,
  corAviso: 0xfee75c,
  corPendente: 0xf0b232,

  divisoria: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",

  EMOJI_ESTADO,
  DEPARTAMENTOS,

  corParaNumero,
  obterDepartamento,

  obterCor(siglaOuDep?: string | Departamento | null): number {
    if (!siglaOuDep) return COR_SCORE;
    if (typeof siglaOuDep === "string") {
      const dep = obterDepartamento(siglaOuDep);
      return dep ? corParaNumero(dep.cor) : COR_SCORE;
    }
    return corParaNumero(siglaOuDep.cor);
  },

  sucesso(msg: string): string {
    return `✅ ${msg}`;
  },

  recusado(msg: string): string {
    return `❌ ${msg}`;
  },

  atencao(msg: string): string {
    return `⚠️ ${msg}`;
  },

  info(msg: string): string {
    return `ℹ️ ${msg}`;
  },

  formatarTempo(totalMinutos: number): string {
    const horas = Math.floor(totalMinutos / 60);
    const minutos = totalMinutos % 60;
    if (horas > 0) return `${horas}h ${minutos}min`;
    return `${minutos}min`;
  },

  barraProgresso(atual: number, total: number, tamanho = 10): string {
    const pct = total <= 0 ? 0 : Math.min(1, Math.max(0, atual / total));
    const cheios = Math.round(pct * tamanho);
    const vazios = Math.max(0, tamanho - cheios);
    return `[${"█".repeat(cheios)}${"░".repeat(vazios)}] ${Math.round(pct * 100)}%`;
  },

  emojis: {
    sucesso: "✅",
    erro: "❌",
    aviso: "⚠️",
    pendente: "⏳",
    info: "ℹ️",
  },
};    
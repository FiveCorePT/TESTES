// Regras de permissões do ScoreRP

export type Nivel = "GLOBAL" | "RESPONSAVEL" | "MEMBRO";

export type Acao =
  | "bot.controlar" // mexer no bot em qualquer servidor
  | "servidor.aprovar" // aprovar, suspender e definir o responsável
  | "bot.repor" // reposição de fábrica
  | "servidor.configurar" // configurar o próprio servidor e os módulos
  | "servidor.ver" // ver o estado do servidor
  | "operacional"; // ponto, tickets, etc.

const PERMISSOES: Record<Acao, Nivel[]> = {
  "bot.controlar": ["GLOBAL"],
  "servidor.aprovar": ["GLOBAL"],
  "bot.repor": ["GLOBAL"],
  "servidor.configurar": ["GLOBAL", "RESPONSAVEL"],
  "servidor.ver": ["GLOBAL", "RESPONSAVEL"],
  operacional: ["GLOBAL", "RESPONSAVEL", "MEMBRO"],
};

export interface DadosNivel {
  cargosNoPrincipal: string[]; // cargos da pessoa no servidor principal
  cargosNoServidor: string[]; // cargos da pessoa no servidor atual
  cargosGlobais: string[]; // Fundação, Direção, Manager
  cargoResponsavelId: string | null; // cargo de responsável deste servidor
  isOwnerPrincipal?: boolean; // Dono do servidor principal
  isOwnerServidor?: boolean; // Dono do servidor de departamento
  isAdminServidor?: boolean; // Administrador do servidor de departamento
}

export function calcularNivel(dados: DadosNivel): Nivel {
  if (dados.isOwnerPrincipal || dados.cargosNoPrincipal.some((id) => dados.cargosGlobais.includes(id))) {
    return "GLOBAL";
  }
  if (
    dados.isOwnerServidor ||
    dados.isAdminServidor ||
    (dados.cargoResponsavelId && dados.cargosNoServidor.includes(dados.cargoResponsavelId))
  ) {
    return "RESPONSAVEL";
  }
  return "MEMBRO";
}

export function pode(nivel: Nivel, acao: Acao): boolean {
  return PERMISSOES[acao].includes(nivel);
}
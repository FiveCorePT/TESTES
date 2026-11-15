import type { Auditoria, Prisma } from "../generated/prisma/client.js";
import type { OrigemAcao } from "../generated/prisma/enums.js";
import { prisma } from "../database/client.js";

interface DadosAuditoria {
  servidorId: string;
  autorId: string;
  modulo: string;
  acao: string;
  alvoId?: string;
  antes?: Prisma.InputJsonValue;
  depois?: Prisma.InputJsonValue;
  reversivel?: boolean;
  origem?: OrigemAcao;
}

// Quem quer ser avisado sempre que há um registo novo (ex.: as logs do Discord)
type Ouvinte = (registo: Auditoria) => void;
const ouvintes: Ouvinte[] = [];

export function aoRegistarAuditoria(ouvinte: Ouvinte) {
  ouvintes.push(ouvinte);
}

export async function registarAuditoria(dados: DadosAuditoria) {
  const registo = await prisma.auditoria.create({
    data: {
      servidorId: dados.servidorId,
      autorId: dados.autorId,
      modulo: dados.modulo,
      acao: dados.acao,
      alvoId: dados.alvoId,
      antes: dados.antes,
      depois: dados.depois,
      reversivel: dados.reversivel ?? false,
      origem: dados.origem ?? "DISCORD",
    },
  });

  for (const ouvinte of ouvintes) {
    try {
      ouvinte(registo);
    } catch (erro) {
      console.error("❌ Erro ao avisar sobre a auditoria:", erro);
    }
  }

  return registo;
}
import type { Client } from "discord.js";
import { prisma } from "../database/client.js";
import { env } from "../config/env.js";
import { obterConfig } from "./config.js";
import { obterNivel } from "../discord/permissoes.js";
import { reiniciarPresence } from "../discord/presence.js";
import { registarAuditoria } from "./auditoria.js";
import type { Nivel } from "./permissoes.js";
import type { Prisma } from "../generated/prisma/client.js";

const ITENS_POR_PAGINA = 5;
const RETENCAO_DEPARTAMENTO_DIAS = 30;

// Lista os registos de auditoria mais recentes (global permanente ou últimos 30 dias para departamentos)
export async function listarHistorico(servidorId?: string, pagina: number = 0) {
  const dataLimite = new Date(Date.now() - RETENCAO_DEPARTAMENTO_DIAS * 24 * 60 * 60 * 1000);
  
  // O servidor principal/Direção vê todo o histórico permanente; departamentos veem os últimos 30 dias
  const where = servidorId
    ? { servidorId, criadoEm: { gte: dataLimite } }
    : {};

  const total = await prisma.auditoria.count({ where });
  const totalPaginas = Math.max(1, Math.ceil(total / ITENS_POR_PAGINA));
  const paginaValida = Math.max(0, Math.min(pagina, totalPaginas - 1));

  const registos = await prisma.auditoria.findMany({
    where,
    orderBy: { id: "desc" },
    skip: paginaValida * ITENS_POR_PAGINA,
    take: ITENS_POR_PAGINA,
    include: {
      servidor: { select: { nome: true, departamento: true, tipo: true } },
    },
  });

  return {
    registos,
    total,
    pagina: paginaValida,
    totalPaginas,
  };
}

export async function obterRegisto(id: number) {
  return prisma.auditoria.findUnique({
    where: { id },
    include: {
      servidor: { select: { nome: true, departamento: true, tipo: true } },
    },
  });
}

export type ResultadoDesfazer =
  | { sucesso: true }
  | { sucesso: false; erro: "NAO_ENCONTRADO" | "JA_DESFEITA" | "NAO_REVERSIVEL" | "SO_DIRECAO" | "EXPIRADA" | "FALHA" };

// Executa o rollback de uma ação gravada na Auditoria
export async function desfazerAcao(
  client: Client,
  registoId: number,
  utilizadorId: string,
  nivelQuemDesfaz: Nivel,
): Promise<ResultadoDesfazer> {
  if (isNaN(registoId)) {
    return { sucesso: false, erro: "NAO_ENCONTRADO" };
  }

  const registo = await obterRegisto(registoId);
  if (!registo) return { sucesso: false, erro: "NAO_ENCONTRADO" };
  if (registo.desfeitaEm) return { sucesso: false, erro: "JA_DESFEITA" };
  if (!registo.reversivel) return { sucesso: false, erro: "NAO_REVERSIVEL" };

  // Regra fundamental: só a Direção pode desfazer ações que a Direção fez!
  const nivelAutorOriginal = await obterNivel(client, registo.autorId, env.mainGuildId);
  console.log(`[DESFAZER] Registo #${registo.id} (${registo.acao}) | Autor: ${registo.autorId} (${nivelAutorOriginal}) | Quem desfaz: ${utilizadorId} (${nivelQuemDesfaz})`);

  if (
    (registo.modulo === "staff" || nivelAutorOriginal === "GLOBAL") &&
    nivelQuemDesfaz !== "GLOBAL"
  ) {
    return { sucesso: false, erro: "SO_DIRECAO" };
  }

  // Se não for da Direção, ações com mais de 30 dias (1 mês) expiram e não podem ser desfeitas pelo departamento
  const limite30Dias = new Date(Date.now() - RETENCAO_DEPARTAMENTO_DIAS * 24 * 60 * 60 * 1000);
  if (registo.criadoEm < limite30Dias && nivelQuemDesfaz !== "GLOBAL") {
    return { sucesso: false, erro: "EXPIRADA" };
  }

  try {
    // 1. Reverter com base no tipo de ação
    switch (registo.acao) {
      case "logs.canal_definido": {
        const antes = registo.antes as { canalLogs?: string | null } | null;
        const canalAnterior = antes?.canalLogs ?? null;
        const configAtual = await obterConfig(registo.servidorId);
        const dados = { ...configAtual, canalLogs: canalAnterior } as Prisma.InputJsonObject;

        await prisma.configuracao.upsert({
          where: { servidorId: registo.servidorId },
          update: { dados, versao: { increment: 1 } },
          create: { servidorId: registo.servidorId, dados },
        });
        break;
      }

      case "modulo.ligado":
      case "modulo.desligado": {
        const antes = registo.antes as { ativo?: boolean } | null;
        const estadoAnterior = antes?.ativo ?? (registo.acao === "modulo.desligado");

        await prisma.modulo.upsert({
          where: { servidorId_nome: { servidorId: registo.servidorId, nome: registo.modulo } },
          update: { ativo: estadoAnterior },
          create: { servidorId: registo.servidorId, nome: registo.modulo, ativo: estadoAnterior },
        });
        break;
      }

      case "presence.frase_adicionada": {
        if (registo.alvoId) {
          const id = Number(registo.alvoId);
          await prisma.frasePresence.delete({ where: { id } }).catch(() => null);
          reiniciarPresence(client);
        }
        break;
      }

      case "presence.frase_apagada": {
        const antes = registo.antes as { texto?: string; ativa?: boolean } | null;
        if (antes?.texto) {
          await prisma.frasePresence.create({
            data: {
              servidorId: registo.servidorId,
              texto: antes.texto,
              ativa: antes.ativa ?? true,
              criadoPor: utilizadorId,
            },
          });
          reiniciarPresence(client);
        }
        break;
      }

      case "presence.frase_ligada":
      case "presence.frase_desligada": {
        if (registo.alvoId) {
          const id = Number(registo.alvoId);
          const antes = registo.antes as { ativa?: boolean } | null;
          if (antes?.ativa !== undefined) {
            await prisma.frasePresence.update({
              where: { id },
              data: { ativa: antes.ativa },
            }).catch(() => null);
            reiniciarPresence(client);
          }
        }
        break;
      }

      case "presence.intervalo_alterado": {
        const antes = registo.antes as { segundos?: number } | null;
        if (antes?.segundos) {
          await prisma.definicoes.upsert({
            where: { id: 1 },
            update: { intervaloPresence: antes.segundos },
            create: { id: 1, intervaloPresence: antes.segundos },
          });
          reiniciarPresence(client);
        }
        break;
      }

      case "servidor.aprovado": {
        const antes = registo.antes as {
          estado?: "PENDENTE" | "APROVADO" | "SUSPENSO";
          departamento?: string | null;
          cargoResponsavelId?: string | null;
          cor?: string;
        } | null;

        await prisma.servidor.update({
          where: { id: registo.servidorId },
          data: {
            estado: antes?.estado ?? "PENDENTE",
            departamento: antes?.departamento ?? null,
            cargoResponsavelId: antes?.cargoResponsavelId ?? null,
            cor: antes?.cor ?? "#5865F2",
            aprovadoPor: null,
            aprovadoEm: null,
          },
        });
        break;
      }

      case "servidor.suspenso": {
        const antes = registo.antes as {
          estado?: "PENDENTE" | "APROVADO" | "SUSPENSO";
        } | null;

        await prisma.servidor.update({
          where: { id: registo.servidorId },
          data: {
            estado: antes?.estado ?? "APROVADO",
          },
        });
        break;
      }

      case "ponto.validado":
      case "ponto.invalidado": {
        if (registo.alvoId) {
          const turnoId = Number(registo.alvoId);
          const antes = registo.antes as { validacao?: "PENDENTE" | "VALIDADO" | "INVALIDADO" } | null;
          const validacaoAnterior = antes?.validacao ?? "PENDENTE";

          await prisma.registoPonto.update({
            where: { id: turnoId },
            data: {
              validacao: validacaoAnterior,
              validadoPor: null,
              validadoEm: null,
              motivoInvalido: null,
            },
          }).catch(() => null);
        }
        break;
      }

      case "ponto.fecho_forcado": {
        if (registo.alvoId) {
          const turnoId = Number(registo.alvoId);
          const antes = registo.antes as { estado?: "EM_SERVICO" | "EM_PAUSA" } | null;
          await prisma.registoPonto.update({
            where: { id: turnoId },
            data: {
              saidaEm: null,
              estado: antes?.estado ?? "EM_SERVICO",
              validacao: "PENDENTE",
            },
          }).catch(() => null);
        }
        break;
      }

      default:
        return { sucesso: false, erro: "NAO_REVERSIVEL" };
    }

    // 2. Marcar o registo original como desfeito
    await prisma.auditoria.update({
      where: { id: registo.id },
      data: {
        desfeitaEm: new Date(),
        desfeitaPor: utilizadorId,
      },
    });

    // 3. Registar na auditoria que a ação foi desfeita
    await registarAuditoria({
      servidorId: registo.servidorId,
      autorId: utilizadorId,
      modulo: "auditoria",
      acao: "auditoria.desfeita",
      alvoId: String(registo.id),
      depois: { acaoDesfeita: registo.acao },
      reversivel: false,
    });

    return { sucesso: true };
  } catch (erro) {
    console.error(`❌ Falha ao desfazer registo #${registo.id}:`, erro);
    return { sucesso: false, erro: "FALHA" };
  }
}
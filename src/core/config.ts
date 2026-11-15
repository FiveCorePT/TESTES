import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../database/client.js";
import { registarAuditoria } from "./auditoria.js";

export async function obterConfig(servidorId: string): Promise<Record<string, unknown>> {
  const config = await prisma.configuracao.findUnique({ where: { servidorId } });
  return (config?.dados as Record<string, unknown> | undefined) ?? {};
}

export async function obterCanalLogs(servidorId: string) {
  const canal = (await obterConfig(servidorId)).canalLogs;
  return typeof canal === "string" ? canal : null;
}

// canalId = null desliga as logs desse servidor
export async function definirCanalLogs(servidorId: string, canalId: string | null, autorId: string) {
  const antes = await obterConfig(servidorId);
  const dados = { ...antes, canalLogs: canalId } as Prisma.InputJsonObject;

  await prisma.configuracao.upsert({
    where: { servidorId },
    update: { dados, versao: { increment: 1 } },
    create: { servidorId, dados },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "logs",
    acao: "logs.canal_definido",
    antes: { canalLogs: (antes.canalLogs as string | undefined) ?? null },
    depois: { canalLogs: canalId },
    reversivel: true,
  });
}

export async function obterCanalComunicados(servidorId: string) {
  const canal = (await obterConfig(servidorId)).canalComunicados;
  return typeof canal === "string" ? canal : null;
}

export async function definirCanalComunicados(servidorId: string, canalId: string | null, autorId: string) {
  const antes = await obterConfig(servidorId);
  const dados = { ...antes, canalComunicados: canalId } as Prisma.InputJsonObject;

  await prisma.configuracao.upsert({
    where: { servidorId },
    update: { dados, versao: { increment: 1 } },
    create: { servidorId, dados },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "comunicados",
    acao: "comunicados.canal_definido",
    antes: { canalComunicados: (antes.canalComunicados as string | undefined) ?? null },
    depois: { canalComunicados: canalId },
    reversivel: true,
  });
}

export async function obterCanalPonto(servidorId: string) {
  const canal = (await obterConfig(servidorId)).canalPonto;
  return typeof canal === "string" ? canal : null;
}

export async function definirCanalPonto(servidorId: string, canalId: string | null, autorId: string) {
  const antes = await obterConfig(servidorId);
  const dados = { ...antes, canalPonto: canalId } as Prisma.InputJsonObject;

  await prisma.configuracao.upsert({
    where: { servidorId },
    update: { dados, versao: { increment: 1 } },
    create: { servidorId, dados },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "ponto",
    acao: "ponto.canal_definido",
    antes: { canalPonto: (antes.canalPonto as string | undefined) ?? null },
    depois: { canalPonto: canalId },
    reversivel: true,
  });
}

export async function obterCargoAuditorPonto(servidorId: string) {
  const cargo = (await obterConfig(servidorId)).cargoAuditorPonto;
  return typeof cargo === "string" ? cargo : null;
}

export async function definirCargoAuditorPonto(servidorId: string, cargoId: string | null, autorId: string) {
  const antes = await obterConfig(servidorId);
  const dados = { ...antes, cargoAuditorPonto: cargoId } as Prisma.InputJsonObject;

  await prisma.configuracao.upsert({
    where: { servidorId },
    update: { dados, versao: { increment: 1 } },
    create: { servidorId, dados },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "ponto",
    acao: "ponto.cargo_auditor_definido",
    antes: { cargoAuditorPonto: (antes.cargoAuditorPonto as string | undefined) ?? null },
    depois: { cargoAuditorPonto: cargoId },
    reversivel: true,
  });
}

export async function obterCargoComunicados(servidorId: string) {
  const cargo = (await obterConfig(servidorId)).cargoComunicados;
  return typeof cargo === "string" ? cargo : null;
}

export async function definirCargoComunicados(servidorId: string, cargoId: string | null, autorId: string) {
  const antes = await obterConfig(servidorId);
  const dados = { ...antes, cargoComunicados: cargoId } as Prisma.InputJsonObject;

  await prisma.configuracao.upsert({
    where: { servidorId },
    update: { dados, versao: { increment: 1 } },
    create: { servidorId, dados },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "comunicados",
    acao: "comunicados.cargo_definido",
    antes: { cargoComunicados: (antes.cargoComunicados as string | undefined) ?? null },
    depois: { cargoComunicados: cargoId },
    reversivel: true,
  });
}

// ───────────── Configuração dos Tickets ─────────────

export interface ConfigTickets {
  canalLogsTickets: string | null;
  categoriaTickets: string | null;
  cargoAtendimento: string | null;
  motivosGerais: string[];
  motivosInternos: string[];
}

const MOTIVOS_GERAIS_PADRAO = [
  "Dúvidas Gerais",
  "Denúncia / Corregedoria",
  "Recrutamento / Candidatura",
  "Apresentação de Queixa",
  "Outro Assunto",
];

const MOTIVOS_INTERNOS_PADRAO = [
  "Pedido de Ausência",
  "Relatório / Assunto Disciplinar",
  "Pedido de Transferência",
  "Reunião com Chefia",
  "Esclarecimento Interno",
];

export async function obterConfigTickets(servidorId: string): Promise<ConfigTickets> {
  const dados = await obterConfig(servidorId);
  return {
    canalLogsTickets: typeof dados.canalLogsTickets === "string" ? dados.canalLogsTickets : null,
    categoriaTickets: typeof dados.categoriaTickets === "string" ? dados.categoriaTickets : null,
    cargoAtendimento: typeof dados.cargoAtendimentoTickets === "string" ? dados.cargoAtendimentoTickets : null,
    motivosGerais: Array.isArray(dados.motivosGeraisTickets) && dados.motivosGeraisTickets.length > 0
      ? (dados.motivosGeraisTickets as string[])
      : MOTIVOS_GERAIS_PADRAO,
    motivosInternos: Array.isArray(dados.motivosInternosTickets) && dados.motivosInternosTickets.length > 0
      ? (dados.motivosInternosTickets as string[])
      : MOTIVOS_INTERNOS_PADRAO,
  };
}

export async function atualizarConfigTickets(
  servidorId: string,
  atualizacao: Partial<ConfigTickets>,
  autorId: string,
) {
  const antes = await obterConfig(servidorId);
  const mapaAtualizado: Record<string, unknown> = { ...antes };

  if (atualizacao.canalLogsTickets !== undefined) mapaAtualizado.canalLogsTickets = atualizacao.canalLogsTickets;
  if (atualizacao.categoriaTickets !== undefined) mapaAtualizado.categoriaTickets = atualizacao.categoriaTickets;
  if (atualizacao.cargoAtendimento !== undefined) mapaAtualizado.cargoAtendimentoTickets = atualizacao.cargoAtendimento;
  if (atualizacao.motivosGerais !== undefined) mapaAtualizado.motivosGeraisTickets = atualizacao.motivosGerais;
  if (atualizacao.motivosInternos !== undefined) mapaAtualizado.motivosInternosTickets = atualizacao.motivosInternos;

  const dados = mapaAtualizado as Prisma.InputJsonObject;

  await prisma.configuracao.upsert({
    where: { servidorId },
    update: { dados, versao: { increment: 1 } },
    create: { servidorId, dados },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "tickets",
    acao: "tickets.config_alterada",
    antes: antes as Prisma.InputJsonValue,
    depois: mapaAtualizado as Prisma.InputJsonValue,
    reversivel: true,
  });
}

// ───────────── Configuração da Moderação ─────────────

export interface ConfigModeracao {
  canalLogsMod: string | null;
  cargoModerador: string | null;
  limiteWarnsAutoMute: number; // Por defeito: 3
}

export async function obterConfigModeracao(servidorId: string): Promise<ConfigModeracao> {
  const dados = await obterConfig(servidorId);
  return {
    canalLogsMod: typeof dados.canalLogsMod === "string" ? dados.canalLogsMod : null,
    cargoModerador: typeof dados.cargoModerador === "string" ? dados.cargoModerador : null,
    limiteWarnsAutoMute: typeof dados.limiteWarnsAutoMute === "number" ? dados.limiteWarnsAutoMute : 3,
  };
}

export async function atualizarConfigModeracao(
  servidorId: string,
  atualizacao: Partial<ConfigModeracao>,
  autorId: string,
) {
  const antes = await obterConfig(servidorId);
  const mapaAtualizado: Record<string, unknown> = { ...antes };

  if (atualizacao.canalLogsMod !== undefined) mapaAtualizado.canalLogsMod = atualizacao.canalLogsMod;
  if (atualizacao.cargoModerador !== undefined) mapaAtualizado.cargoModerador = atualizacao.cargoModerador;
  if (atualizacao.limiteWarnsAutoMute !== undefined) mapaAtualizado.limiteWarnsAutoMute = atualizacao.limiteWarnsAutoMute;

  const dados = mapaAtualizado as Prisma.InputJsonObject;

  await prisma.configuracao.upsert({
    where: { servidorId },
    update: { dados, versao: { increment: 1 } },
    create: { servidorId, dados },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "moderacao",
    acao: "moderacao.config_alterada",
    antes: antes as Prisma.InputJsonValue,
    depois: mapaAtualizado as Prisma.InputJsonValue,
    reversivel: true,
  });
}

// ───────────── Configuração de Punições Internas ─────────────

export interface ConfigPunicoes {
  canalLogsPunicoes: string | null;
  cargoCorregedoria: string | null;
}

export async function obterConfigPunicoes(servidorId: string): Promise<ConfigPunicoes> {
  const dados = await obterConfig(servidorId);
  return {
    canalLogsPunicoes: typeof dados.canalLogsPunicoes === "string" ? dados.canalLogsPunicoes : null,
    cargoCorregedoria: typeof dados.cargoCorregedoria === "string" ? dados.cargoCorregedoria : null,
  };
}

export async function atualizarConfigPunicoes(
  servidorId: string,
  atualizacao: Partial<ConfigPunicoes>,
  autorId: string,
) {
  const antes = await obterConfig(servidorId);
  const mapaAtualizado: Record<string, unknown> = { ...antes };

  if (atualizacao.canalLogsPunicoes !== undefined) mapaAtualizado.canalLogsPunicoes = atualizacao.canalLogsPunicoes;
  if (atualizacao.cargoCorregedoria !== undefined) mapaAtualizado.cargoCorregedoria = atualizacao.cargoCorregedoria;

  const dados = mapaAtualizado as Prisma.InputJsonObject;

  await prisma.configuracao.upsert({
    where: { servidorId },
    update: { dados, versao: { increment: 1 } },
    create: { servidorId, dados },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "punicoes",
    acao: "punicoes.config_alterada",
    antes: antes as Prisma.InputJsonValue,
    depois: mapaAtualizado as Prisma.InputJsonValue,
    reversivel: true,
  });
}

// ───────────── Configuração do Sistema de Ponto ─────────────

export async function obterMetaSemanalHoras(servidorId: string): Promise<number> {
  const dados = await obterConfig(servidorId);
  return typeof dados.metaSemanalHoras === "number" ? dados.metaSemanalHoras : 10; // Por defeito: 10h
}

export async function definirMetaSemanalHoras(servidorId: string, horas: number, autorId: string) {
  const antes = await obterConfig(servidorId);
  const dados = { ...antes, metaSemanalHoras: horas } as Prisma.InputJsonObject;

  await prisma.configuracao.upsert({
    where: { servidorId },
    update: { dados, versao: { increment: 1 } },
    create: { servidorId, dados },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "ponto",
    acao: "ponto.meta_definida",
    antes: { metaSemanalHoras: antes.metaSemanalHoras ?? null },
    depois: { metaSemanalHoras: horas },
    reversivel: true,
  });
}
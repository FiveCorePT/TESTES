import type { Guild } from "discord.js";
import { env } from "../config/env.js";
import { prisma } from "../database/client.js";
import { registarAuditoria } from "./auditoria.js";

export async function registarServidor(guild: Guild) {
  const principal = guild.id === env.mainGuildId;

  await prisma.servidor.upsert({
    where: { id: guild.id },
    // O servidor principal fica sempre aprovado
    update: principal
      ? { nome: guild.name, tipo: "PRINCIPAL", estado: "APROVADO" }
      : { nome: guild.name },
    create: {
      id: guild.id,
      nome: guild.name,
      tipo: principal ? "PRINCIPAL" : "DEPARTAMENTO",
      estado: principal ? "APROVADO" : "PENDENTE",
      config: { create: {} }, // cria já a configuração vazia
    },
  });
}

export async function obterServidor(servidorId: string) {
  return prisma.servidor.findUnique({ where: { id: servidorId } });
}

interface DadosAprovacao {
  servidorId: string;
  autorId: string;
  departamento: string;
  cargoResponsavelId: string;
  cor?: string;
}

export async function aprovarServidor(dados: DadosAprovacao) {
  const antes = await prisma.servidor.findUniqueOrThrow({
    where: { id: dados.servidorId },
  });

  const depois = await prisma.servidor.update({
    where: { id: dados.servidorId },
    data: {
      estado: "APROVADO",
      departamento: dados.departamento,
      cargoResponsavelId: dados.cargoResponsavelId,
      cor: dados.cor ?? antes.cor,
      aprovadoPor: dados.autorId,
      aprovadoEm: new Date(),
    },
  });

  await registarAuditoria({
    servidorId: dados.servidorId,
    autorId: dados.autorId,
    modulo: "staff",
    acao: "servidor.aprovado",
    antes: resumo(antes),
    depois: resumo(depois),
    reversivel: true,
  });

  return depois;
}

export async function suspenderServidor(servidorId: string, autorId: string) {
  const antes = await prisma.servidor.findUniqueOrThrow({
    where: { id: servidorId },
  });

  const depois = await prisma.servidor.update({
    where: { id: servidorId },
    data: { estado: "SUSPENSO" },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "staff",
    acao: "servidor.suspenso",
    antes: resumo(antes),
    depois: resumo(depois),
    reversivel: true,
  });

  return depois;
}

export async function recusarServidor(servidorId: string, autorId: string) {
  await prisma.servidor.update({
    where: { id: servidorId },
    data: { estado: "SUSPENSO" },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "staff",
    acao: "servidor.recusado",
  });
}

export async function listarDepartamentos() {
  return prisma.servidor.findMany({
    where: { tipo: "DEPARTAMENTO" },
    orderBy: { criadoEm: "asc" },
  });
}

export async function contarPorEstado() {
  const grupos = await prisma.servidor.groupBy({
    by: ["estado"],
    where: { tipo: "DEPARTAMENTO" },
    _count: true,
  });
  const total: Record<string, number> = { PENDENTE: 0, APROVADO: 0, SUSPENSO: 0 };
  for (const g of grupos) total[g.estado] = g._count;
  return total as { PENDENTE: number; APROVADO: number; SUSPENSO: number };
}

// Reposição de fábrica de um servidor de departamento
export async function reporServidorFabrica(servidorId: string, autorId: string) {
  const antes = await prisma.servidor.findUniqueOrThrow({
    where: { id: servidorId },
  });

  // Limpa configuração
  await prisma.configuracao.upsert({
    where: { servidorId },
    update: { dados: {}, versao: 1 },
    create: { servidorId, dados: {}, versao: 1 },
  });

  // Remove módulos configurados
  await prisma.modulo.deleteMany({ where: { servidorId } });

  // Remove frases locais da presence
  await prisma.frasePresence.deleteMany({ where: { servidorId } });

  // Reseta o servidor para PENDENTE e sem atribuições
  const depois = await prisma.servidor.update({
    where: { id: servidorId },
    data: {
      estado: "PENDENTE",
      departamento: null,
      cargoResponsavelId: null,
      cor: "#5865F2",
      aprovadoPor: null,
      aprovadoEm: null,
    },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "staff",
    acao: "servidor.reposicao_fabrica",
    antes: resumo(antes),
    depois: resumo(depois),
    reversivel: false,
  });

  return depois;
}

// Só os campos que interessam para o histórico e para o undo
function resumo(servidor: {
  estado: string;
  departamento: string | null;
  cargoResponsavelId: string | null;
  cor: string;
}) {
  return {
    estado: servidor.estado,
    departamento: servidor.departamento,
    cargoResponsavelId: servidor.cargoResponsavelId,
    cor: servidor.cor,
  };
}
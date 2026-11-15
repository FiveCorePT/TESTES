import { env } from "../config/env.js";
import { prisma } from "../database/client.js";
import { registarAuditoria } from "./auditoria.js";

export const INTERVALO_MINIMO = 15;
export const INTERVALO_MAXIMO = 3600;
export const TAMANHO_MAXIMO = 120;

export type TipoAtividade = "PLAYING" | "STREAMING" | "LISTENING" | "WATCHING" | "CUSTOM";

export function formatarTextoComTipo(tipo: string, texto: string): string {
  const tipoLimpo = (tipo || "CUSTOM").toUpperCase().trim();
  const textoLimpo = texto.replace(/^\[(PLAYING|STREAMING|LISTENING|WATCHING|CUSTOM)\]\s*/i, "").trim();
  if (["PLAYING", "STREAMING", "LISTENING", "WATCHING", "CUSTOM"].includes(tipoLimpo)) {
    return `[${tipoLimpo}] ${textoLimpo}`;
  }
  return `[CUSTOM] ${textoLimpo}`;
}

export function extrairTipoTexto(textoBruto: string): { tipo: TipoAtividade; texto: string; emoji: string } {
  const match = (textoBruto || "").match(/^\[(PLAYING|STREAMING|LISTENING|WATCHING|CUSTOM)\]\s*(.*)$/i);
  if (match) {
    const tipo = match[1].toUpperCase() as TipoAtividade;
    const texto = match[2];
    const emojis: Record<TipoAtividade, string> = {
      PLAYING: "🎮",
      STREAMING: "🟣",
      LISTENING: "🎧",
      WATCHING: "📺",
      CUSTOM: "💬",
    };
    return { tipo, texto, emoji: emojis[tipo] ?? "💬" };
  }
  return { tipo: "CUSTOM", texto: textoBruto || "", emoji: "💬" };
}

export async function obterIntervalo(): Promise<number> {
  const definicoes = await prisma.definicoes.findUnique({ where: { id: 1 } });
  return definicoes?.intervaloPresence ?? 30;
}

export async function definirIntervalo(segundos: number, autorId: string): Promise<void> {
  const antes = await obterIntervalo();
  await prisma.definicoes.upsert({
    where: { id: 1 },
    update: { intervaloPresence: segundos },
    create: { id: 1, intervaloPresence: segundos },
  });
  await registarAuditoria({
    servidorId: env.mainGuildId,
    autorId,
    modulo: "presence",
    acao: "presence.intervalo_alterado",
    antes: { segundos: antes },
    depois: { segundos },
    reversivel: true,
  });
}

export async function listarFrases(servidorId?: string) {
  return prisma.frasePresence.findMany({
    where: servidorId ? { servidorId } : {},
    include: { servidor: { select: { nome: true, tipo: true, departamento: true } } },
    orderBy: { id: "asc" },
  });
}

export async function listarFrasesPendentes() {
  return prisma.frasePresence.findMany({
    where: { estado: "PENDENTE" },
    include: { servidor: { select: { nome: true, tipo: true, departamento: true } } },
    orderBy: { id: "asc" },
  });
}

export async function frasesEmRotacao() {
  return prisma.frasePresence.findMany({
    where: { ativa: true, estado: "APROVADA", servidor: { estado: "APROVADO" } },
    orderBy: { id: "asc" },
  });
}

export async function obterFrase(id: number) {
  return prisma.frasePresence.findUnique({
    where: { id },
    include: { servidor: { select: { nome: true, tipo: true, departamento: true } } },
  });
}

export async function adicionarFrase(
  servidorId: string,
  texto: string,
  autorId: string,
  aprovada = true,
  tipo = "CUSTOM",
) {
  const estado = aprovada ? "APROVADA" : "PENDENTE";
  const textoFinal = formatarTextoComTipo(tipo, texto);

  const frase = await prisma.frasePresence.create({
    data: {
      servidorId,
      texto: textoFinal,
      criadoPor: autorId,
      estado,
      ativa: aprovada,
      aprovadoPor: aprovada ? autorId : null,
      aprovadoEm: aprovada ? new Date() : null,
    },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: "presence",
    acao: "presence.frase_adicionada",
    alvoId: String(frase.id),
    depois: { texto: textoFinal, ativa: aprovada, estado },
    reversivel: true,
  });

  return frase;
}

export async function aprovarFrase(id: number, autorId: string) {
  const antes = await prisma.frasePresence.findUniqueOrThrow({ where: { id } });
  const depois = await prisma.frasePresence.update({
    where: { id },
    data: {
      estado: "APROVADA",
      ativa: true,
      aprovadoPor: autorId,
      aprovadoEm: new Date(),
    },
  });

  await registarAuditoria({
    servidorId: antes.servidorId,
    autorId,
    modulo: "presence",
    acao: "presence.frase_aprovada",
    alvoId: String(id),
    antes: { texto: antes.texto, ativa: antes.ativa, estado: antes.estado },
    depois: { texto: depois.texto, ativa: depois.ativa, estado: depois.estado },
    reversivel: true,
  });

  return depois;
}

export async function rejeitarFrase(id: number, autorId: string) {
  const antes = await prisma.frasePresence.findUniqueOrThrow({ where: { id } });
  const depois = await prisma.frasePresence.update({
    where: { id },
    data: {
      estado: "REJEITADA",
      ativa: false,
      aprovadoPor: autorId,
      aprovadoEm: new Date(),
    },
  });

  await registarAuditoria({
    servidorId: antes.servidorId,
    autorId,
    modulo: "presence",
    acao: "presence.frase_rejeitada",
    alvoId: String(id),
    antes: { texto: antes.texto, ativa: antes.ativa, estado: antes.estado },
    depois: { texto: depois.texto, ativa: depois.ativa, estado: depois.estado },
    reversivel: true,
  });

  return depois;
}

export async function alternarFrase(id: number, autorId: string) {
  const antes = await prisma.frasePresence.findUniqueOrThrow({ where: { id } });
  const depois = await prisma.frasePresence.update({
    where: { id },
    data: { ativa: !antes.ativa },
  });

  await registarAuditoria({
    servidorId: antes.servidorId,
    autorId,
    modulo: "presence",
    acao: depois.ativa ? "presence.frase_ligada" : "presence.frase_desligada",
    alvoId: String(id),
    antes: { texto: antes.texto, ativa: antes.ativa, estado: antes.estado },
    depois: { texto: depois.texto, ativa: depois.ativa, estado: depois.estado },
    reversivel: true,
  });
}

export async function apagarFrase(id: number, autorId: string) {
  const antes = await prisma.frasePresence.delete({ where: { id } });
  await registarAuditoria({
    servidorId: antes.servidorId,
    autorId,
    modulo: "presence",
    acao: "presence.frase_apagada",
    alvoId: String(id),
    antes: { texto: antes.texto, ativa: antes.ativa, estado: antes.estado },
    reversivel: true,
  });
}
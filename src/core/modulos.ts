import { prisma } from "../database/client.js";
import { registarAuditoria } from "./auditoria.js";

export interface InfoModulo {
  id: string;
  nome: string;
  emoji: string;
  descricao: string;
}

// Módulos que cada departamento pode ligar ou desligar
export const MODULOS: InfoModulo[] = [
  { id: "tickets", nome: "Tickets", emoji: "🎫", descricao: "Pedidos de apoio dos membros" },
  { id: "logs", nome: "Logs", emoji: "📜", descricao: "Registo do que acontece no servidor" },
  { id: "ponto", nome: "Ponto", emoji: "⏱️", descricao: "Entradas e saídas de serviço" },
  { id: "comunicados", nome: "Comunicados", emoji: "📢", descricao: "Anúncios para o departamento" },
  { id: "moderacao", nome: "Moderação", emoji: "🛡️", descricao: "Avisos, silenciamentos e expulsões" },
  { id: "punicoes", nome: "Punições", emoji: "⚖️", descricao: "Registo de punições internas" },
];

// Devolve, para cada módulo, se está ligado (os que nunca foram ligados ficam desligados)
export async function estadoModulos(servidorId: string) {
  const linhas = await prisma.modulo.findMany({ where: { servidorId } });
  return new Map(linhas.map((m) => [m.nome, m.ativo]));
}

export async function alternarModulo(servidorId: string, nome: string, autorId: string) {
  const chave = { servidorId_nome: { servidorId, nome } };
  const antes = (await prisma.modulo.findUnique({ where: chave }))?.ativo ?? false;
  const ativo = !antes;

  await prisma.modulo.upsert({
    where: chave,
    update: { ativo },
    create: { servidorId, nome, ativo },
  });

  await registarAuditoria({
    servidorId,
    autorId,
    modulo: nome,
    acao: ativo ? "modulo.ligado" : "modulo.desligado",
    antes: { ativo: antes },
    depois: { ativo },
    reversivel: true,
  });

  return ativo;
}
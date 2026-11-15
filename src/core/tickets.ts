import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type TextChannel,
} from "discord.js";
import { prisma } from "../database/client.js";
import { obterConfigTickets } from "./config.js";
import { obterServidor } from "./servidores.js";
import { COR_SCORE, DEPARTAMENTOS, corParaNumero } from "../config/visual.js";
import { registarAuditoria } from "./auditoria.js";

export async function obterTicketPorCanal(canalId: string) {
  return prisma.ticket.findUnique({ where: { canalId } });
}

export async function criarTicketCanal(params: {
  guild: Guild;
  autorId: string;
  tipo: "GERAL" | "INTERNO";
  motivo: string;
  dados: { nome?: string; cartaoCidadao?: string; resumo: string };
}) {
  const { guild, autorId, tipo, motivo, dados } = params;
  const cfg = await obterConfigTickets(guild.id);
  const servidor = await obterServidor(guild.id);

  const total = await prisma.ticket.count({ where: { servidorId: guild.id } });
  const numeroTicket = String(total + 1).padStart(3, "0");
  const prefixo = tipo === "GERAL" ? "geral" : "interno";
  const nomeCanal = `ticket-${prefixo}-${numeroTicket}`;

  // Configuração das permissões privadas do canal
  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: autorId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (cfg.cargoAtendimento) {
    permissionOverwrites.push({
      id: cfg.cargoAtendimento,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  if (servidor?.cargoResponsavelId) {
    permissionOverwrites.push({
      id: servidor.cargoResponsavelId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  const canal = await guild.channels.create({
    name: nomeCanal,
    type: ChannelType.GuildText,
    parent: cfg.categoriaTickets ?? undefined,
    permissionOverwrites,
  });

  const registo = await prisma.ticket.create({
    data: {
      servidorId: guild.id,
      canalId: canal.id,
      autorId,
      tipo,
      motivo,
      dados,
      estado: "ABERTO",
    },
  });

  await registarAuditoria({
    servidorId: guild.id,
    autorId,
    modulo: "tickets",
    acao: "ticket.aberto",
    alvoId: String(registo.id),
    antes: undefined,
    depois: { ticketId: registo.id, canalId: canal.id, tipo, motivo },
    reversivel: false,
  });

  return { ticket: registo, canal };
}

export async function assumirTicket(canalId: string, agenteId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { canalId } });
  if (!ticket || ticket.estado === "FECHADO") return null;

  return prisma.ticket.update({
    where: { canalId },
    data: {
      estado: "ASSUMIDO",
      atendidoPorId: agenteId,
    },
  });
}

/**
 * Recolhe histórico de mensagens, gera o .txt e envia para o canal de logs
 */
export async function fecharEArquivarTicket(params: {
  canal: TextChannel;
  fechadoPorId: string;
}) {
  const { canal, fechadoPorId } = params;
  const ticket = await prisma.ticket.findUnique({ where: { canalId: canal.id } });
  if (!ticket) return false;

  const cfg = await obterConfigTickets(canal.guildId);
  const servidor = await obterServidor(canal.guildId);
  const dep = DEPARTAMENTOS.find((d) => d.sigla === servidor?.departamento);
  const cor = dep ? corParaNumero(dep.cor) : COR_SCORE;

  // Recolhe as últimas 100 mensagens
  const mensagensColecao = await canal.messages.fetch({ limit: 100 }).catch(() => null);
  const mensagensOrdenadas = mensagensColecao
    ? [...mensagensColecao.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    : [];

  let conteudoTxt = `====================================================\n`;
  conteudoTxt += `TRANSCRIÇÃO DE ATENDIMENTO · ${dep?.nome ?? canal.guild.name}\n`;
  conteudoTxt += `Ticket: #${ticket.id}\n`;
  conteudoTxt += `Tipo: ${ticket.tipo === "GERAL" ? "Atendimento Geral" : "Assuntos Internos"}\n`;
  conteudoTxt += `Motivo: ${ticket.motivo}\n`;
  conteudoTxt += `Aberto por: <@${ticket.autorId}> em ${ticket.criadoEm.toLocaleString("pt-PT")}\n`;
  conteudoTxt += `Atendido por: ${ticket.atendidoPorId ? `<@${ticket.atendidoPorId}>` : "Ninguém"}\n`;
  conteudoTxt += `Fechado por: <@${fechadoPorId}> em ${new Date().toLocaleString("pt-PT")}\n`;
  conteudoTxt += `====================================================\n\n`;

  for (const m of mensagensOrdenadas) {
    const hora = new Date(m.createdTimestamp).toLocaleTimeString("pt-PT");
    const autor = m.author.tag;
    const texto = m.cleanContent || (m.embeds.length ? "[Embed]" : "");
    conteudoTxt += `[${hora}] ${autor}: ${texto}\n`;
    if (m.attachments.size > 0) {
      conteudoTxt += `    [Anexos: ${[...m.attachments.values()].map((a) => a.url).join(", ")}]\n`;
    }
  }

  const buffer = Buffer.from(conteudoTxt, "utf-8");
  const anexo = new AttachmentBuilder(buffer, { name: `transcricao-ticket-${ticket.id}.txt` });

  if (cfg.canalLogsTickets) {
    const canalLogs = await canal.guild.channels.fetch(cfg.canalLogsTickets).catch(() => null);
    if (canalLogs && canalLogs.isTextBased() && "send" in canalLogs) {
      const dados = ticket.dados as Record<string, string>;
      const embedLog = new EmbedBuilder()
        .setColor(cor)
        .setTitle(`📜 Ticket Encerrado #${ticket.id} · ${ticket.tipo === "GERAL" ? "Geral" : "Interno"}`)
        .addFields(
          { name: "👤 Aberto por", value: `<@${ticket.autorId}>`, inline: true },
          { name: "✋ Atendido por", value: ticket.atendidoPorId ? `<@${ticket.atendidoPorId}>` : "— Não assumido", inline: true },
          { name: "🔒 Fechado por", value: `<@${fechadoPorId}>`, inline: true },
          { name: "📋 Motivo", value: ticket.motivo, inline: true },
          { name: "🕒 Duração", value: `<t:${Math.floor(ticket.criadoEm.getTime() / 1000)}:R>`, inline: true },
        )
        .setFooter({ text: `${dep?.nome ?? "ScoreRP"} · Transcrição Arquivada` })
        .setTimestamp();

      if (dados.nome) embedLog.addFields({ name: "Cidadão", value: dados.nome, inline: true });
      if (dados.cartaoCidadao) embedLog.addFields({ name: "CC / Passaporte", value: dados.cartaoCidadao, inline: true });
      if (dados.resumo) embedLog.addFields({ name: "Resumo Inicial", value: dados.resumo });

      await canalLogs.send({ embeds: [embedLog], files: [anexo] }).catch((e) => console.error("Erro ao enviar log de ticket:", e));
    }
  }

  await prisma.ticket.update({
    where: { canalId: canal.id },
    data: {
      estado: "FECHADO",
      fechadoEm: new Date(),
      fechadoPorId,
    },
  });

  return true;
}
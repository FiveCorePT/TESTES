import {
  EmbedBuilder,
  type Guild,
  type GuildMember,
} from "discord.js";
import { prisma } from "../database/client.js";
import { obterConfigModeracao } from "./config.js";
import { obterServidor } from "./servidores.js";
import { COR_SCORE, DEPARTAMENTOS, corParaNumero } from "../config/visual.js";
import { obterNivel } from "../discord/permissoes.js";
import { pode } from "./permissoes.js";

export type AcaoMod = "WARN" | "TIMEOUT" | "UNTIMEOUT" | "KICK" | "BAN" | "UNBAN";

// Verifica se o utilizador pode USAR as ferramentas de moderação
export async function podeModerar(guild: Guild, utilizadorId: string): Promise<boolean> {
  const nivel = await obterNivel(guild.client, utilizadorId, guild.id);
  if (pode(nivel, "servidor.configurar")) return true; // Chefe ou Direção

  const cfg = await obterConfigModeracao(guild.id);
  if (!cfg.cargoModerador) return false;

  const membro = guild.members.cache.get(utilizadorId) ?? (await guild.members.fetch(utilizadorId).catch(() => null));
  return membro ? membro.roles.cache.has(cfg.cargoModerador) : false;
}

// Envia o embed formatado para o canal de logs de moderação
async function enviarLogModeracao(params: {
  guild: Guild;
  alvoId: string;
  moderadorId: string;
  tipo: AcaoMod;
  motivo: string;
  duracaoMin?: number;
  autoPunicao?: boolean;
}) {
  const { guild, alvoId, moderadorId, tipo, motivo, duracaoMin, autoPunicao } = params;
  const cfg = await obterConfigModeracao(guild.id);
  if (!cfg.canalLogsMod) return;

  const canalLogs = await guild.channels.fetch(cfg.canalLogsMod).catch(() => null);
  if (!canalLogs || !canalLogs.isTextBased() || !("send" in canalLogs)) return;

  const servidor = await obterServidor(guild.id);
  const dep = DEPARTAMENTOS.find((d) => d.sigla === servidor?.departamento);
  const cor = dep ? corParaNumero(dep.cor) : COR_SCORE;

  const titulos: Record<AcaoMod, string> = {
    WARN: "⚠️ Aviso (Warn)",
    TIMEOUT: "🔇 Silenciamento (Timeout)",
    UNTIMEOUT: "🔊 Silenciamento Removido",
    KICK: "👢 Expulsão (Kick)",
    BAN: "⛔ Banimento (Ban)",
    UNBAN: "🔓 Desbanimento (Unban)",
  };

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`${titulos[tipo]} · Registo de Moderação`)
    .addFields(
      { name: "👤 Infrator", value: `<@${alvoId}> (\`${alvoId}\`)`, inline: true },
      { name: "🛡️ Moderador", value: autoPunicao ? "🤖 Sistema Automático" : `<@${moderadorId}>`, inline: true },
      { name: "📋 Motivo", value: motivo },
    )
    .setFooter({ text: `${dep?.nome ?? guild.name} · ScoreRP` })
    .setTimestamp();

  if (duracaoMin) {
    embed.addFields({ name: "⏱️ Duração", value: `${duracaoMin} minutos`, inline: true });
  }

  if (autoPunicao) {
    embed.addFields({ name: "⚠️ Alerta", value: "Aplicado automaticamente por acumulação de avisos." });
  }

  await canalLogs.send({ embeds: [embed] }).catch(() => {});
}

// ───────────── Ações de Moderação ─────────────

export async function aplicarWarn(params: {
  guild: Guild;
  alvo: GuildMember;
  moderadorId: string;
  motivo: string;
}) {
  const { guild, alvo, moderadorId, motivo } = params;
  const cfg = await obterConfigModeracao(guild.id);

  await prisma.registoModeracao.create({
    data: {
      servidorId: guild.id,
      utilizadorId: alvo.id,
      moderadorId,
      tipo: "WARN",
      motivo,
      ativo: true,
    },
  });

  await enviarLogModeracao({ guild, alvoId: alvo.id, moderadorId, tipo: "WARN", motivo });

  // Contagem de avisos ativos
  const warnsAtivos = await prisma.registoModeracao.count({
    where: {
      servidorId: guild.id,
      utilizadorId: alvo.id,
      tipo: "WARN",
      ativo: true,
    },
  });

  let autoMuteAplicado = false;
  if (warnsAtivos >= cfg.limiteWarnsAutoMute) {
    const duracaoMs = 24 * 60 * 60 * 1000; // 24 horas
    await alvo.timeout(duracaoMs, `Auto-Mute: Atingiu ${warnsAtivos} avisos ativos`).catch(() => {});

    await prisma.registoModeracao.create({
      data: {
        servidorId: guild.id,
        utilizadorId: alvo.id,
        moderadorId: guild.client.user.id,
        tipo: "TIMEOUT",
        motivo: `Sanção Automática: Atingiu o limite de ${cfg.limiteWarnsAutoMute} avisos`,
        duracaoMin: 1440,
      },
    });

    await enviarLogModeracao({
      guild,
      alvoId: alvo.id,
      moderadorId: guild.client.user.id,
      tipo: "TIMEOUT",
      motivo: `Atingiu o limite de ${cfg.limiteWarnsAutoMute} avisos`,
      duracaoMin: 1440,
      autoPunicao: true,
    });

    autoMuteAplicado = true;
  }

  return { totalWarns: warnsAtivos, autoMuteAplicado };
}

export async function aplicarTimeout(params: {
  guild: Guild;
  alvo: GuildMember;
  moderadorId: string;
  minutos: number;
  motivo: string;
}) {
  const { guild, alvo, moderadorId, minutos, motivo } = params;
  const ms = minutos * 60 * 1000;

  await alvo.timeout(ms, motivo);

  await prisma.registoModeracao.create({
    data: {
      servidorId: guild.id,
      utilizadorId: alvo.id,
      moderadorId,
      tipo: "TIMEOUT",
      motivo,
      duracaoMin: minutos,
    },
  });

  await enviarLogModeracao({ guild, alvoId: alvo.id, moderadorId, tipo: "TIMEOUT", motivo, duracaoMin: minutos });
}

export async function removerTimeout(params: {
  guild: Guild;
  alvo: GuildMember;
  moderadorId: string;
  motivo: string;
}) {
  const { guild, alvo, moderadorId, motivo } = params;

  await alvo.timeout(null, motivo);

  await prisma.registoModeracao.create({
    data: {
      servidorId: guild.id,
      utilizadorId: alvo.id,
      moderadorId,
      tipo: "UNTIMEOUT",
      motivo,
    },
  });

  await enviarLogModeracao({ guild, alvoId: alvo.id, moderadorId, tipo: "UNTIMEOUT", motivo });
}

export async function aplicarKick(params: {
  guild: Guild;
  alvo: GuildMember;
  moderadorId: string;
  motivo: string;
}) {
  const { guild, alvo, moderadorId, motivo } = params;

  await alvo.kick(motivo);

  await prisma.registoModeracao.create({
    data: {
      servidorId: guild.id,
      utilizadorId: alvo.id,
      moderadorId,
      tipo: "KICK",
      motivo,
    },
  });

  await enviarLogModeracao({ guild, alvoId: alvo.id, moderadorId, tipo: "KICK", motivo });
}

export async function aplicarBan(params: {
  guild: Guild;
  alvoId: string;
  moderadorId: string;
  motivo: string;
  apagarMensagensSegundos?: number;
}) {
  const { guild, alvoId, moderadorId, motivo, apagarMensagensSegundos = 0 } = params;

  await guild.bans.create(alvoId, {
    reason: motivo,
    deleteMessageSeconds: apagarMensagensSegundos,
  });

  await prisma.registoModeracao.create({
    data: {
      servidorId: guild.id,
      utilizadorId: alvoId,
      moderadorId,
      tipo: "BAN",
      motivo,
    },
  });

  await enviarLogModeracao({ guild, alvoId, moderadorId, tipo: "BAN", motivo });
}

export async function aplicarUnban(params: {
  guild: Guild;
  alvoId: string;
  moderadorId: string;
  motivo: string;
}) {
  const { guild, alvoId, moderadorId, motivo } = params;

  await guild.bans.remove(alvoId, motivo);

  await prisma.registoModeracao.create({
    data: {
      servidorId: guild.id,
      utilizadorId: alvoId,
      moderadorId,
      tipo: "UNBAN",
      motivo,
    },
  });

  await enviarLogModeracao({ guild, alvoId, moderadorId, tipo: "UNBAN", motivo });
}

export async function obterHistoricoMembro(servidorId: string, utilizadorId: string) {
  return prisma.registoModeracao.findMany({
    where: { servidorId, utilizadorId },
    orderBy: { criadoEm: "desc" },
    take: 10,
  });
}
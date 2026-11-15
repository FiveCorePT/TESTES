import { EmbedBuilder, type Guild } from "discord.js";
import { prisma } from "../database/client.js";
import { obterConfigPunicoes } from "./config.js";
import { obterServidor } from "./servidores.js";
import { COR_SCORE, DEPARTAMENTOS, corParaNumero } from "../config/visual.js";
import { obterNivel } from "../discord/permissoes.js";
import { pode } from "./permissoes.js";

export type AcaoPunicao = "ADVERTENCIA_VERBAL" | "ADVERTENCIA_ESCRITA" | "SUSPENSAO" | "DESPROMOCAO" | "EXPULSAO";

export async function podePunir(guild: Guild, utilizadorId: string): Promise<boolean> {
  const nivel = await obterNivel(guild.client, utilizadorId, guild.id);
  if (pode(nivel, "servidor.configurar")) return true;

  const cfg = await obterConfigPunicoes(guild.id);
  if (!cfg.cargoCorregedoria) return false;

  const membro = guild.members.cache.get(utilizadorId) ?? (await guild.members.fetch(utilizadorId).catch(() => null));
  return membro ? membro.roles.cache.has(cfg.cargoCorregedoria) : false;
}

export async function aplicarPunicao(params: {
  guild: Guild;
  agenteId: string;
  superiorId: string;
  tipo: AcaoPunicao;
  motivo: string;
  artigo?: string;
  diasSuspensao?: number;
}) {
  const { guild, agenteId, superiorId, tipo, motivo, artigo, diasSuspensao } = params;

  const processo = await prisma.processoDisciplinar.create({
    data: {
      servidorId: guild.id,
      agenteId,
      superiorId,
      tipo,
      motivo,
      artigo,
      diasSuspensao,
      ativo: true,
    },
  });

  const cfg = await obterConfigPunicoes(guild.id);
  if (cfg.canalLogsPunicoes) {
    const canal = await guild.channels.fetch(cfg.canalLogsPunicoes).catch(() => null);
    if (canal && canal.isTextBased() && "send" in canal) {
      const servidor = await obterServidor(guild.id);
      const dep = DEPARTAMENTOS.find((d) => d.sigla === servidor?.departamento);
      const cor = dep ? corParaNumero(dep.cor) : COR_SCORE;

      const titulos: Record<AcaoPunicao, string> = {
        ADVERTENCIA_VERBAL: "🗣️ Advertência Verbal",
        ADVERTENCIA_ESCRITA: "📝 Advertência Escrita",
        SUSPENSAO: "⛔ Suspensão de Funções",
        DESPROMOCAO: "📉 Despromoção",
        EXPULSAO: "🚪 Expulsão do Departamento",
      };

      const embed = new EmbedBuilder()
        .setColor(cor)
        .setTitle(`⚖️ ${titulos[tipo]} · Processo #${processo.id}`)
        .addFields(
          { name: "👮 Agente Sancionado", value: `<@${agenteId}> (\`${agenteId}\`)`, inline: true },
          { name: "👑 Superior Instrutor", value: `<@${superiorId}>`, inline: true },
          { name: "📋 Motivo / Fatos", value: motivo },
        )
        .setFooter({ text: `${dep?.nome ?? guild.name} · Boletim Disciplinar` })
        .setTimestamp();

      if (artigo) embed.addFields({ name: "📖 Artigo / Regulamento", value: artigo, inline: true });
      if (diasSuspensao) embed.addFields({ name: "⏱️ Duração", value: `${diasSuspensao} dias`, inline: true });

      await canal.send({ embeds: [embed] }).catch(() => {});
    }
  }

  return processo;
}

export async function revogarPunicao(params: {
  guild: Guild;
  processoId: number;
  superiorId: string;
  motivoRevogacao: string;
}) {
  const { guild, processoId, superiorId, motivoRevogacao } = params;

  const processo = await prisma.processoDisciplinar.update({
    where: { id: processoId },
    data: {
      ativo: false,
      revogadoEm: new Date(),
      revogadoPor: superiorId,
      motivoRevogacao,
    },
  });

  const cfg = await obterConfigPunicoes(guild.id);
  if (cfg.canalLogsPunicoes) {
    const canal = await guild.channels.fetch(cfg.canalLogsPunicoes).catch(() => null);
    if (canal && canal.isTextBased() && "send" in canal) {
      const servidor = await obterServidor(guild.id);
      const dep = DEPARTAMENTOS.find((d) => d.sigla === servidor?.departamento);

      const embed = new EmbedBuilder()
        .setColor(0x57f287) // Verde Sucesso / Anulação
        .setTitle(`♻️ Punição Revogada / Anulada · Processo #${processo.id}`)
        .addFields(
          { name: "👮 Agente", value: `<@${processo.agenteId}>`, inline: true },
          { name: "👑 Revogado por", value: `<@${superiorId}>`, inline: true },
          { name: "📋 Tipo Anulado", value: processo.tipo, inline: true },
          { name: "📝 Motivo da Revogação", value: motivoRevogacao },
        )
        .setFooter({ text: `${dep?.nome ?? guild.name} · Boletim Disciplinar` })
        .setTimestamp();

      await canal.send({ embeds: [embed] }).catch(() => {});
    }
  }

  return processo;
}

export async function obterCadastroAgente(servidorId: string, agenteId: string) {
  return prisma.processoDisciplinar.findMany({
    where: { servidorId, agenteId },
    orderBy: { criadoEm: "desc" },
    take: 15,
  });
}

export async function obterPunicoesAtivas(servidorId: string, agenteId: string) {
  return prisma.processoDisciplinar.findMany({
    where: { servidorId, agenteId, ativo: true },
    orderBy: { criadoEm: "desc" },
  });
}
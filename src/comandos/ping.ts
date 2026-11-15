import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../database/client.js";
import { registarAuditoria } from "../core/auditoria.js";
import type { Comando } from "./tipos.js";

export const ping: Comando = {
  dados: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Verifica se o bot está online"),

  async executar(interaction) {
    await registarAuditoria({
      servidorId: interaction.guildId,
      autorId: interaction.user.id,
      modulo: "teste",
      acao: "ping.usado",
    });

    const total = await prisma.auditoria.count({
      where: { servidorId: interaction.guildId },
    });

    await interaction.reply({
      content: `🏓 Pong! Latência: ${interaction.client.ws.ping}ms\n🗄️ Registos de auditoria neste servidor: ${total}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
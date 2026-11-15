import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { env } from "../config/env.js";
import { pode } from "../core/permissoes.js";
import { obterNivel } from "../discord/permissoes.js";
import { ecraPainel } from "../paineis/departamento.js";
import type { Comando } from "./tipos.js";

export const painel: Comando = {
  dados: new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Abre o painel de configuração deste departamento"),

  async executar(interaction) {
    // ⚡ Responde imediatamente de forma efémera para evitar timeout de 3s
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.guildId === env.mainGuildId) {
      await interaction.editReply({
        content: `ℹ️ No servidor principal, a gestão faz-se no Centro de Controlo: <#${env.canalControloId}>`,
      });
      return;
    }

    const nivel = await obterNivel(interaction.client, interaction.user.id, interaction.guildId);
    if (!pode(nivel, "servidor.configurar")) {
      await interaction.editReply({
        content: "❌ Só o responsável do departamento e a Direção podem abrir o painel.",
      });
      return;
    }
    
    const tela = await ecraPainel(interaction.client, interaction.guildId);
    await interaction.editReply(tela);
  },
};
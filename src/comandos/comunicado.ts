import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { env } from "../config/env.js";
import { obterCanalComunicados } from "../core/config.js";
import { estadoModulos } from "../core/modulos.js";
import { criarModalComunicado, podeEmitirComunicados } from "../paineis/comunicados.js";
import type { Comando } from "./tipos.js";

export const comunicado: Comando = {
  dados: new SlashCommandBuilder()
    .setName("comunicado")
    .setDescription("Emite um comunicado oficial para o departamento"),

  async executar(interaction) {
    const { client, guildId, user } = interaction;

    if (guildId === env.mainGuildId) {
      await interaction.reply({
        content: "ℹ️ Este comando destina-se aos servidores de departamento.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modulos = await estadoModulos(guildId);
    if (!modulos.get("comunicados")) {
      await interaction.reply({
        content: "⚠️ O módulo de Comunicados está desativado neste departamento.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const autorizada = await podeEmitirComunicados(client, user.id, guildId);
    if (!autorizada) {
      await interaction.reply({
        content: "❌ Não tens permissão para emitir comunicados. Contacta o Chefe do Departamento.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const canalPadrao = await obterCanalComunicados(guildId);
    const modal = criarModalComunicado(guildId, {
      servidorId: guildId,
      autorId: user.id,
      titulo: "",
      conteudo: "",
      imagemUrl: null,
      canalId: canalPadrao,
      cargoId: null,
    });

    await interaction.showModal(modal);
  },
};
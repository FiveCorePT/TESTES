import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
} from "discord.js";
import { env } from "../config/env.js";
import { COR_SCORE, DEPARTAMENTOS, corParaNumero } from "../config/visual.js";
import { definirCanalLogs, obterCanalLogs } from "../core/config.js";
import { estadoModulos } from "../core/modulos.js";
import { pode } from "../core/permissoes.js";
import { obterServidor } from "../core/servidores.js";
import { obterNivel } from "../discord/permissoes.js";

// ───────────── Ecrã ─────────────

export async function ecraLogs(servidorId: string) {
  const principal = servidorId === env.mainGuildId;
  const servidor = await obterServidor(servidorId);
  const dep = DEPARTAMENTOS.find((d) => d.sigla === servidor?.departamento);
  const canal = await obterCanalLogs(servidorId);
  const ligado = principal || (await estadoModulos(servidorId)).get("logs") === true;

  const embed = new EmbedBuilder()
    .setColor(dep ? corParaNumero(dep.cor) : COR_SCORE)
    .setTitle(principal ? "📜 Logs · ScoreRP" : `📜 Logs · ${dep?.sigla ?? servidor?.nome}`)
    .setDescription(
      principal
        ? "Aqui chegam **todas** as ações de todos os servidores. Ficam guardadas permanentemente na base de dados central."
        : "Aqui chegam as ações deste departamento (ficam guardadas no canal durante 1 mês). A base de dados central da Direção guarda tudo permanentemente.",
    )
    .addFields({ name: "Canal", value: canal ? `<#${canal}>` : "— nenhum", inline: true });
  if (!principal) {
    embed.addFields({ name: "Estado", value: ligado ? "🟢 Ligado" : "⚪ Desligado", inline: true });
  }

  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(`lg_canal:${servidorId}`)
    .setPlaceholder("Escolhe o canal das logs…")
    .setChannelTypes(ChannelType.GuildText);
  if (canal) menu.setDefaultChannels(canal);

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`lg_teste:${servidorId}`).setLabel("Enviar teste").setEmoji("🧪").setStyle(ButtonStyle.Primary).setDisabled(!canal),
    new ButtonBuilder().setCustomId(`lg_remover:${servidorId}`).setLabel("Remover canal").setEmoji("🗑️").setStyle(ButtonStyle.Danger).setDisabled(!canal),
  );
  if (!principal) {
    botoes.addComponents(
      new ButtonBuilder()
        .setCustomId(`dp_tog:${servidorId}:logs`)
        .setLabel(ligado ? "Desligar" : "Ligar")
        .setEmoji(ligado ? "⚪" : "🟢")
        .setStyle(ligado ? ButtonStyle.Secondary : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`dp_voltar:${servidorId}`).setLabel("Painel").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
    );
  }

  return {
    content: "",
    embeds: [embed],
    components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu), botoes],
  };
}

// ───────────── Botões e menus ─────────────

export async function tratarLogs(
  interaction: ButtonInteraction | ChannelSelectMenuInteraction,
): Promise<boolean> {
  const [acao, servidorId = ""] = interaction.customId.split(":");
  if (!acao.startsWith("lg_")) return false;

  const { client, user } = interaction;
  const principal = servidorId === env.mainGuildId;
  const nivel = await obterNivel(client, user.id, servidorId);
  if (!pode(nivel, principal ? "bot.controlar" : "servidor.configurar")) {
    await interaction.reply({ content: "❌ Não tens permissão para mexer nas logs.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (acao === "lg_canal" && interaction.isChannelSelectMenu()) {
    const escolhido = interaction.channels.first();
    const canal = escolhido ? client.channels.cache.get(escolhido.id) : undefined;
    if (!canal || canal.type !== ChannelType.GuildText || canal.guildId !== servidorId) {
      await interaction.reply({ content: "⚠️ Escolhe um canal de texto deste servidor.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const bot = canal.guild.members.me;
    const precisa = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
    if (!bot || !canal.permissionsFor(bot).has(precisa)) {
      await interaction.reply({
        content: `⚠️ O bot não consegue escrever em ${canal}. Dá-lhe as permissões **Ver canal**, **Enviar mensagens** e **Inserir links** nesse canal.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await definirCanalLogs(servidorId, canal.id, user.id);
    await interaction.update(await ecraLogs(servidorId));
    return true;
  }

  if (acao === "lg_remover") {
    await definirCanalLogs(servidorId, null, user.id);
    await interaction.update(await ecraLogs(servidorId));
    return true;
  }

  if (acao === "lg_teste") {
    const canalId = await obterCanalLogs(servidorId);
    const canal = canalId ? await client.channels.fetch(canalId).catch(() => null) : null;
    if (!canal?.isSendable()) {
      await interaction.reply({ content: "⚠️ Não consegui escrever no canal das logs.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await canal.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COR_SCORE)
          .setTitle("🧪 Teste de logs")
          .setDescription(`Enviado por ${user}. Se estás a ver isto, as logs estão a funcionar.`)
          .setTimestamp(),
      ],
    });
    await interaction.reply({ content: `✅ Mensagem de teste enviada para ${canal}.`, flags: MessageFlags.Ephemeral });
    return true;
  }

  return false;
}
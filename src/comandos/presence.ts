import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { env } from "../config/env.js";
import { pode } from "../core/permissoes.js";
import { adicionarFrase } from "../core/presence.js";
import { listarDepartamentos } from "../core/servidores.js";
import { obterNivel } from "../discord/permissoes.js";
import { reiniciarPresence } from "../discord/presence.js";
import { ecraPresence, notificarNovaFrasePendente } from "../paineis/presence.js";
import type { Comando } from "./tipos.js";

export const presenceComando: Comando = {
  semAprovacao: true,
  dados: new SlashCommandBuilder()
    .setName("presence")
    .setDescription("Gestão e criação de frases da presence do bot")
    .addSubcommand((sub) =>
      sub
        .setName("criar")
        .setDescription("Criar uma nova frase para a presence do bot")
        .addStringOption((opt) =>
          opt
            .setName("texto")
            .setDescription("Texto da frase (suporta {membros}, {hora}, {departamentos}...)")
            .setRequired(true)
            .setMaxLength(120),
        )
        .addStringOption((opt) =>
          opt
            .setName("tipo")
            .setDescription("Tipo de atividade da presence")
            .setRequired(false)
            .addChoices(
              { name: "💬 Custom (Personalizado)", value: "CUSTOM" },
              { name: "🎮 Playing (A jogar)", value: "PLAYING" },
              { name: "🎧 Listening (A ouvir)", value: "LISTENING" },
              { name: "📺 Watching (A ver)", value: "WATCHING" },
              { name: "🟣 Streaming (Em direto)", value: "STREAMING" },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName("departamento")
            .setDescription("Departamento opcional (ex: PSP, GNR... se vazio, fica Global/Atual)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("painel").setDescription("Abre o painel interativo da presence"),
    ),

  async executar(interaction) {
    const privado = MessageFlags.Ephemeral;
    const sub = interaction.options.getSubcommand();
    const nivel = await obterNivel(interaction.client, interaction.user.id, interaction.guildId);
    const principal = interaction.guildId === env.mainGuildId;
    const ehDirecao = principal || pode(nivel, "bot.controlar");

    if (!pode(nivel, principal ? "bot.controlar" : "servidor.configurar")) {
      await interaction.reply({
        content: "❌ Não tens permissão para gerir a presence do bot.",
        flags: privado,
      });
      return;
    }

    if (sub === "painel") {
      await interaction.reply({
        ...(await ecraPresence(interaction.guildId)),
        flags: privado,
      });
      return;
    }

    if (sub === "criar") {
      const texto = interaction.options.getString("texto", true).trim();
      const tipo = interaction.options.getString("tipo") ?? "CUSTOM";
      const depNome = interaction.options.getString("departamento")?.trim().toUpperCase();

      let targetServidorId = interaction.guildId;

      if (ehDirecao && depNome) {
        const deps = await listarDepartamentos();
        const encontrado = deps.find(
          (d) => d.departamento?.toUpperCase() === depNome || d.nome.toUpperCase().includes(depNome),
        );
        if (encontrado) targetServidorId = encontrado.id;
      }

      const frase = await adicionarFrase(targetServidorId, texto, interaction.user.id, ehDirecao, tipo);
      reiniciarPresence(interaction.client);

      if (frase.estado === "APROVADA") {
        await interaction.reply({
          content: `✅ **Presença Criada com Sucesso pela Direção!**\n> 💬 "${texto}" (\`${tipo}\`)\n> 🟢 Estado: **Aprovada e Ativa na Rotação**`,
          flags: privado,
        });
      } else {
        await notificarNovaFrasePendente(interaction.client, frase.id, interaction.channelId);

        await interaction.reply({
          content: `⏳ **Presença Sugerida com Sucesso!**\n> 💬 "${texto}" (\`${tipo}\`)\n> ⚠️ O pedido foi enviado para o Centro de Controlo da Direção para aprovação.`,
          flags: privado,
        });
      }
    }
  },
};

export const presence = presenceComando;
export default presenceComando;
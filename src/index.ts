import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  type RepliableInteraction,
} from "discord.js";
import { env } from "./config/env.js";
import { comandos } from "./comandos/index.js";
import { obterServidor, registarServidor } from "./core/servidores.js";
import { iniciarLogs } from "./discord/logs.js";
import { iniciarPresence } from "./discord/presence.js";
import { atualizarCentro, avisarNovoServidor, tratarCentro } from "./paineis/centro.js";
import { tratarDepartamento } from "./paineis/departamento.js";
import { tratarHistorico } from "./paineis/historico.js";
import { tratarLogs } from "./paineis/logs.js";
import { tratarPonto } from "./paineis/ponto.js";
import { tratarComunicados } from "./paineis/comunicados.js";
import { tratarPresence } from "./paineis/presence.js";
import { tratarTickets } from "./paineis/tickets.js";
import { tratarModeracao } from "./paineis/moderacao.js";
import { tratarPunicoes } from "./paineis/punicoes.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST().setToken(env.token);
iniciarLogs(client);

// Registo seguro de comandos: nunca crasha com undefined
export async function registarComandos(guildId: string) {
  try {
    const corpo = comandos
      .map((cmd) => (cmd?.dados && typeof cmd.dados.toJSON === "function" ? cmd.dados.toJSON() : null))
      .filter(Boolean);

    await rest.put(Routes.applicationGuildCommands(env.clientId, guildId), {
      body: corpo,
    });
    console.log(`📌 ${corpo.length} comandos registados no servidor ${guildId}`);
  } catch (erro) {
    console.error(`❌ Falhou o registo no servidor ${guildId}:`, erro);
  }
}

async function atualizarCentroSemFalhar() {
  try {
    await atualizarCentro(client);
  } catch (erro) {
    console.error("❌ Falhou a atualização do Centro de Controlo:", erro);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Online como ${c.user.tag}`);

  for (const guild of c.guilds.cache.values()) {
    try {
      await registarServidor(guild);
      console.log(`🗄️ Servidor guardado: ${guild.name}`);
    } catch (erro) {
      console.error(`❌ Falhou ao guardar ${guild.name}:`, erro);
    }
    await registarComandos(guild.id);
  }

  iniciarPresence(c);
  await atualizarCentroSemFalhar();
  setInterval(atualizarCentroSemFalhar, 5 * 60 * 1000);
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    await registarServidor(guild);
    await registarComandos(guild.id);
    const servidor = await obterServidor(guild.id);
    if (guild.id !== env.mainGuildId && servidor?.estado !== "APROVADO") {
      await avisarNovoServidor(guild);
      console.log(`➕ Novo servidor (pendente): ${guild.name}`);
    }
  } catch (erro) {
    console.error(`❌ Falhou ao tratar o novo servidor ${guild.name}:`, erro);
  }
  await atualizarCentroSemFalhar();
});

async function responderErro(interaction: RepliableInteraction) {
  const resposta = {
    content: "❌ Ocorreu um erro ao processar esta ação. Tenta novamente.",
    flags: MessageFlags.Ephemeral,
  } as const;
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(resposta).catch(() => {});
  } else {
    await interaction.reply(resposta).catch(() => {});
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ Este bot apenas pode ser utilizado dentro de servidores.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const comando = comandos.find((c) => c?.dados?.name === interaction.commandName);
    if (!comando) return;

    try {
      let servidor = await obterServidor(interaction.guildId);
      if (!servidor && interaction.guild) {
        await registarServidor(interaction.guild);
        servidor = await obterServidor(interaction.guildId);
      }

      const ehPrincipal = interaction.guildId === env.mainGuildId;

      if (!comando.semAprovacao && !ehPrincipal) {
        if (servidor?.estado !== "APROVADO") {
          await interaction.reply({
            content:
              servidor?.estado === "SUSPENSO"
                ? "⛔ O bot está suspenso neste servidor."
                : "⏳ Este servidor ainda aguarda homologação e aprovação da Direção do ScoreRP.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
      }

      await comando.executar(interaction as any);
    } catch (erro) {
      console.error(`❌ Erro no comando /${interaction.commandName}:`, erro);
      await responderErro(interaction as RepliableInteraction).catch(() => {});
    }
    return;
  }

  if (
    !interaction.isButton() &&
    !interaction.isStringSelectMenu() &&
    !interaction.isChannelSelectMenu() &&
    !interaction.isRoleSelectMenu() &&
    !interaction.isUserSelectMenu() &&
    !interaction.isModalSubmit()
  ) {
    return;
  }

  const id = interaction.customId ?? "";

  try {
    if (interaction.isModalSubmit()) {
      if (id.startsWith("pun_")) {
        await tratarPunicoes(interaction as any);
        return;
      }
      if (id.startsWith("mod_")) {
        await tratarModeracao(interaction as any);
        return;
      }
      if (id.startsWith("tk_")) {
        await tratarTickets(interaction as any);
        return;
      }
      if (id.startsWith("pt_")) {
        await tratarPonto(interaction as any);
        return;
      }
      if (await tratarPresence(interaction as any)) return;
      if (await tratarComunicados(interaction as any)) return;
      return;
    }

    if (id.startsWith("pun_")) {
      await tratarPunicoes(interaction as any);
      return;
    }
    if (id.startsWith("mod_")) {
      await tratarModeracao(interaction as any);
      return;
    }
    if (id.startsWith("tk_")) {
      await tratarTickets(interaction as any);
      return;
    }
    if (id.startsWith("cm_")) {
      await tratarComunicados(interaction as any);
      return;
    }
    if (id.startsWith("lg_")) {
      await tratarLogs(interaction as any);
      return;
    }
    if (id.startsWith("pt_")) {
      await tratarPonto(interaction as any);
      return;
    }
    if (id.startsWith("pr_")) {
      await tratarPresence(interaction as any);
      return;
    }
    if (id.startsWith("hist_")) {
      await tratarHistorico(interaction as any);
      return;
    }
    if (id.startsWith("dp_")) {
      await tratarDepartamento(interaction as any);
      return;
    }
    if (
      id.startsWith("centro:") ||
      id.startsWith("srv_") ||
      id.startsWith("ap_") ||
      id.startsWith("aprovar:") ||
      id.startsWith("recusar:") ||
      id.startsWith("repor_")
    ) {
      await tratarCentro(interaction as any);
      return;
    }
  } catch (erro) {
    console.error(`❌ Erro no painel (${id}):`, erro);
    await responderErro(interaction as RepliableInteraction).catch(() => {});
  }
});

process.on("unhandledRejection", (erro) => {
  console.error("❌ Erro inesperado:", erro);
});

client.login(env.token);
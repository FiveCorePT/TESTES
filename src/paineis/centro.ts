import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  REST,
  Routes,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type Client,
  type Guild,
  type StringSelectMenuInteraction,
} from "discord.js";
import { env } from "../config/env.js";
import { COR_SCORE, DEPARTAMENTOS, EMOJI_ESTADO, corParaNumero } from "../config/visual.js";
import { pode } from "../core/permissoes.js";
import { listarFrasesPendentes, frasesEmRotacao, obterIntervalo } from "../core/presence.js";
import {
  aprovarServidor,
  contarPorEstado,
  listarDepartamentos,
  obterServidor,
  recusarServidor,
  reporServidorFabrica,
  suspenderServidor,
} from "../core/servidores.js";
import { obterNivel } from "../discord/permissoes.js";
import { comandos } from "../comandos/index.js";
import { ecraHistorico } from "./historico.js";
import { ecraLogs } from "./logs.js";
import { ecraPresence } from "./presence.js";

const rest = new REST().setToken(env.token);

const TITULO = "🛡️ Centro de Controlo · ScoreRP";
const COR_VERMELHO = 0xda373c;

type Linha = ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>;

const escolhas = new Map<string, { departamento?: string; cargoId?: string; avisoId?: string }>();

async function canalControlo(client: Client) {
  const canal = await client.channels.fetch(env.canalControloId).catch(() => null);
  return canal && canal.isTextBased() && "send" in canal ? canal : null;
}

// Registo de comandos autónomo (sem depender de index.ts)
async function registarComandosServidor(guildId: string) {
  try {
    const corpo = comandos
      .map((cmd) => (cmd?.dados && typeof cmd.dados.toJSON === "function" ? cmd.dados.toJSON() : null))
      .filter(Boolean);

    await rest.put(Routes.applicationGuildCommands(env.clientId, guildId), {
      body: corpo,
    });
    console.log(`📌 Comandos registados no servidor ${guildId}`);
  } catch (erro) {
    console.error(`❌ Falhou o registo no servidor ${guildId}:`, erro);
  }
}

async function construirCentro(client: Client) {
  const total = await contarPorEstado();
  const latencia = client.ws.ping >= 0 ? `${client.ws.ping} ms` : "a medir…";
  const frases = await frasesEmRotacao();
  const pendentesPresence = await listarFrasesPendentes();
  const intervalo = await obterIntervalo();
  const totalPendentesPresence = pendentesPresence.length;

  const embed = new EmbedBuilder()
    .setColor(COR_SCORE)
    .setTitle(TITULO)
    .setDescription("Painel central de gestão e controlo do bot em todos os servidores.")
    .addFields(
      {
        name: "Servidores",
        value: `✅ ${total.APROVADO} aprovados\n⏳ ${total.PENDENTE} pendentes\n⛔ ${total.SUSPENSO} suspensos`,
        inline: true,
      },
      {
        name: "Presence",
        value:
          totalPendentesPresence > 0
            ? `🔄 ${frases.length} ativas · ⏱️ ${intervalo}s\n⏳ **${totalPendentesPresence} a aguardar aprovação!**`
            : `🔄 ${frases.length} frases ativas\n⏱️ a cada ${intervalo} s`,
        inline: true,
      },
      {
        name: "Estado do bot",
        value: `🟢 Online\nLatência ${latencia}`,
        inline: true,
      },
    )
    .setFooter({ text: "Atualizado automaticamente" })
    .setTimestamp();

  const linha1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("centro:servidores").setLabel("Servidores").setEmoji("🏢").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("centro:presence")
      .setLabel(totalPendentesPresence > 0 ? `Presence (${totalPendentesPresence} ⏳)` : "Presence")
      .setEmoji("🔄")
      .setStyle(totalPendentesPresence > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("centro:logs").setLabel("Logs Centrais").setEmoji("📜").setStyle(ButtonStyle.Secondary),
  );

  const linha2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("centro:historico").setLabel("Histórico e Desfazer").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("centro:repor").setLabel("Reposição de Fábrica").setEmoji("🏭").setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [linha1, linha2] };
}

export async function atualizarCentro(client: Client) {
  const canal = await canalControlo(client);
  if (!canal) {
    console.error("❌ Não encontrei o canal do Centro de Controlo (CANAL_CONTROLO_ID).");
    return;
  }

  const conteudo = await construirCentro(client);
  const recentes = await canal.messages.fetch({ limit: 20 });
  const existente = recentes.find(
    (m) => m.author.id === client.user?.id && m.embeds[0]?.title === TITULO,
  );

  if (existente) await existente.edit(conteudo);
  else await canal.send(conteudo);
}

export async function avisarNovoServidor(guild: Guild) {
  const canal = await canalControlo(guild.client);
  if (!canal) return;

  const embed = new EmbedBuilder()
    .setColor(0xf0b232)
    .setTitle("⏳ Novo servidor à espera de aprovação")
    .addFields(
      { name: "Servidor", value: guild.name, inline: true },
      { name: "Membros", value: String(guild.memberCount), inline: true },
      { name: "Dono", value: `<@${guild.ownerId}>`, inline: true },
    )
    .setFooter({ text: "O bot não responde nesse servidor até ser homologado pela Direção" })
    .setTimestamp();

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`aprovar:${guild.id}`).setLabel("Aprovar Servidor").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`recusar:${guild.id}`).setLabel("Recusar e Sair").setEmoji("❌").setStyle(ButtonStyle.Danger),
  );

  await canal.send({ embeds: [embed], components: [botoes] });
}

async function ecraServidores() {
  const servidores = await listarDepartamentos();

  const embed = new EmbedBuilder()
    .setColor(COR_SCORE)
    .setTitle("🏢 Gestão de Servidores")
    .setDescription(
      servidores.length
        ? servidores
            .map((s) => `${EMOJI_ESTADO[s.estado as keyof typeof EMOJI_ESTADO]} **${s.nome}** · ${s.departamento ?? "sem departamento"}`)
            .join("\n")
        : "Ainda não há servidores de departamento registados.",
    );

  const linhas: Linha[] = [];
  if (servidores.length) {
    linhas.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("srv_escolher")
          .setPlaceholder("Escolhe um servidor para gerir…")
          .addOptions(
            servidores.slice(0, 25).map((s) => ({
              label: s.nome.slice(0, 100),
              value: s.id,
              description: s.departamento ?? "Sem departamento",
              emoji: EMOJI_ESTADO[s.estado as keyof typeof EMOJI_ESTADO],
            })),
          ),
      ),
    );
  }

  return { embeds: [embed], components: linhas };
}

async function ecraDetalhe(client: Client, servidorId: string) {
  const s = await obterServidor(servidorId);
  if (!s) return { content: "Servidor não encontrado.", embeds: [], components: [] };

  const dep = DEPARTAMENTOS.find((d) => d.sigla === s.departamento);
  const guild = client.guilds.cache.get(s.id) ?? (await client.guilds.fetch(s.id).catch(() => null));
  const cargo = s.cargoResponsavelId && guild ? guild.roles.cache.get(s.cargoResponsavelId) : undefined;

  const embed = new EmbedBuilder()
    .setColor(dep ? corParaNumero(dep.cor) : COR_SCORE)
    .setTitle(`${dep?.emoji ?? "🏢"} ${s.nome}`)
    .addFields(
      { name: "Estado", value: `${EMOJI_ESTADO[s.estado as keyof typeof EMOJI_ESTADO]} ${s.estado}`, inline: true },
      { name: "Departamento", value: dep ? `${dep.sigla} · ${dep.nome}` : "—", inline: true },
      { name: "Responsável", value: cargo ? `@${cargo.name}` : "—", inline: true },
    );

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`srv_editar:${s.id}`)
      .setLabel(s.estado === "APROVADO" ? "Editar dados" : "Aprovar")
      .setEmoji(s.estado === "APROVADO" ? "✏️" : "✅")
      .setStyle(s.estado === "APROVADO" ? ButtonStyle.Primary : ButtonStyle.Success),
  );

  if (s.estado === "APROVADO") {
    botoes.addComponents(
      new ButtonBuilder().setCustomId(`srv_suspender:${s.id}`).setLabel("Suspender").setEmoji("⛔").setStyle(ButtonStyle.Danger),
    );
  }

  botoes.addComponents(
    new ButtonBuilder().setCustomId(`repor_pedir:${s.id}`).setLabel("Repor de Fábrica").setEmoji("🏭").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("srv_voltar").setLabel("Voltar").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
  );

  return { content: "", embeds: [embed], components: [botoes] };
}

async function ecraAprovacao(guild: Guild, chave: string) {
  const escolha = escolhas.get(chave) ?? {};

  const rolesCollection = await guild.roles.fetch().catch(() => guild.roles.cache);
  const cargos = [...rolesCollection.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .slice(0, 25);

  const embed = new EmbedBuilder()
    .setColor(COR_SCORE)
    .setTitle(`✅ Aprovação Departamental · «${guild.name}»`)
    .setDescription("Atribui a corporação oficial e o cargo da chefia responsável.");

  if (!cargos.length) {
    embed.setDescription("⚠️ Esse servidor ainda não tem cargos criados. Criem primeiro o cargo da chefia máxima no servidor.");
    return { embeds: [embed], components: [] };
  }

  const menuDep = new StringSelectMenuBuilder()
    .setCustomId(`ap_dep:${guild.id}`)
    .setPlaceholder("Escolhe o departamento…")
    .addOptions(
      DEPARTAMENTOS.map((d) => ({
        label: d.sigla,
        description: d.nome,
        value: d.sigla,
        emoji: d.emoji,
        default: d.sigla === escolha.departamento,
      })),
    );

  const menuCargo = new StringSelectMenuBuilder()
    .setCustomId(`ap_cargo:${guild.id}`)
    .setPlaceholder("Escolhe o cargo de chefia máxima…")
    .addOptions(
      cargos.map((r, i) => ({
        label: r.name.slice(0, 100),
        value: r.id,
        emoji: i === 0 ? "👑" : "⭐",
        description: i === 0 ? "Cargo mais alto do servidor" : undefined,
        default: r.id === escolha.cargoId,
      })),
    );

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ap_ok:${guild.id}`).setLabel("Confirmar Aprovação").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ap_cancelar:${guild.id}`).setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menuDep),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menuCargo),
      botoes,
    ],
  };
}

async function ecraEscolhaRepor() {
  const servidores = await listarDepartamentos();

  const embed = new EmbedBuilder()
    .setColor(COR_VERMELHO)
    .setTitle("🏭 Reposição de Fábrica de Servidores")
    .setDescription(
      "Seleciona o servidor de departamento que pretendes repor às definições de fábrica.\n\n" +
      "⚠️ **Atenção:** Esta ação irá:\n" +
      "• Limpar todas as configurações e canais definidos\n" +
      "• Desativar todos os módulos do servidor\n" +
      "• Apagar frases locais da presence\n" +
      "• Colocar o servidor em estado **PENDENTE** para nova aprovação",
    );

  if (!servidores.length) {
    return {
      embeds: [embed.setDescription("Ainda não existem servidores de departamento registados.")],
      components: [],
    };
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId("repor_sel")
    .setPlaceholder("Escolhe o servidor a repor de fábrica…")
    .addOptions(
      servidores.slice(0, 25).map((s) => ({
        label: s.nome.slice(0, 100),
        value: s.id,
        description: s.departamento ?? "Sem departamento",
        emoji: "🏭",
      })),
    );

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("repor_cancelar").setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu), botoes],
  };
}

async function ecraConfirmarRepor(servidorId: string) {
  const s = await obterServidor(servidorId);
  if (!s) return { content: "Servidor não encontrado.", embeds: [], components: [] };

  const embed = new EmbedBuilder()
    .setColor(COR_VERMELHO)
    .setTitle("⚠️ Confirmar Reposição de Fábrica")
    .setDescription(
      `Tens a certeza absoluta que queres repor as definições de fábrica do servidor **${s.nome}**?\n\n` +
      `• Todas as configurações e canais serão limpos.\n` +
      `• Todos os módulos serão desativados.\n` +
      `• O servidor voltará ao estado **PENDENTE** da Direção.`,
    );

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`repor_ok:${s.id}`)
      .setLabel("Sim, Repor Tudo")
      .setEmoji("⚠️")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("repor_cancelar").setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [botoes] };
}

const ACOES = new Set([
  "centro", "aprovar", "recusar", "ap_dep", "ap_cargo", "ap_ok", "ap_cancelar",
  "srv_escolher", "srv_editar", "srv_suspender", "srv_voltar",
  "repor_sel", "repor_pedir", "repor_ok", "repor_cancelar",
]);

export async function tratarCentro(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<boolean> {
  const [acao, alvo = ""] = interaction.customId.split(":");
  if (!ACOES.has(acao)) return false;

  const { client, user } = interaction;
  const nivel = await obterNivel(client, user.id, env.mainGuildId);
  if (!pode(nivel, "servidor.aprovar")) {
    await interaction.reply({ content: "❌ Só a Direção do ScoreRP pode usar isto.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const chave = `${user.id}:${alvo}`;

  if (acao === "centro" && alvo === "servidores") {
    await interaction.reply({ ...(await ecraServidores()), flags: MessageFlags.Ephemeral });
    return true;
  }

  if (acao === "centro" && alvo === "presence") {
    await interaction.reply({ ...(await ecraPresence(env.mainGuildId)), flags: MessageFlags.Ephemeral });
    return true;
  }

  if (acao === "centro" && alvo === "logs") {
    await interaction.reply({ ...(await ecraLogs(env.mainGuildId)), flags: MessageFlags.Ephemeral });
    return true;
  }

  if (acao === "centro" && alvo === "historico") {
    await interaction.reply({ ...(await ecraHistorico(undefined)), flags: MessageFlags.Ephemeral });
    return true;
  }

  if (acao === "centro" && alvo === "repor") {
    await interaction.reply({ ...(await ecraEscolhaRepor()), flags: MessageFlags.Ephemeral });
    return true;
  }

  if (acao === "repor_pedir") {
    await interaction.update(await ecraConfirmarRepor(alvo));
    return true;
  }

  if (acao === "repor_sel" && interaction.isStringSelectMenu()) {
    const servId = interaction.values[0];
    await interaction.update(await ecraConfirmarRepor(servId));
    return true;
  }

  if (acao === "repor_cancelar") {
    await interaction.update({ content: "Operação cancelada.", embeds: [], components: [] });
    return true;
  }

  if (acao === "repor_ok") {
    await reporServidorFabrica(alvo, user.id);
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(COR_SCORE)
          .setTitle("🏭 Reposição Concluída")
          .setDescription("O servidor foi reposto com sucesso para as definições de fábrica e voltou ao estado PENDENTE."),
      ],
      components: [],
    });
    await atualizarCentro(client);
    return true;
  }

  if (acao === "srv_voltar") {
    await interaction.update(await ecraServidores());
    return true;
  }

  if (acao === "srv_escolher" && interaction.isStringSelectMenu()) {
    await interaction.update(await ecraDetalhe(client, interaction.values[0]));
    return true;
  }

  if (acao === "srv_suspender") {
    await suspenderServidor(alvo, user.id);
    await interaction.update(await ecraDetalhe(client, alvo));
    await atualizarCentro(client);
    return true;
  }

  if (acao === "aprovar" || acao === "srv_editar") {
    const guild = client.guilds.cache.get(alvo) ?? (await client.guilds.fetch(alvo).catch(() => null));
    if (!guild) {
      await interaction.reply({ content: "⚠️ O bot já não está presente nesse servidor.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const s = await obterServidor(alvo);
    escolhas.set(chave, {
      departamento: s?.departamento ?? undefined,
      cargoId: s?.cargoResponsavelId ?? undefined,
      avisoId: acao === "aprovar" ? interaction.message?.id : undefined,
    });

    const tela = await ecraAprovacao(guild, chave);
    if (acao === "aprovar") {
      await interaction.reply({ ...tela, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.update(tela);
    }
    return true;
  }

  if ((acao === "ap_dep" || acao === "ap_cargo") && interaction.isStringSelectMenu()) {
    const guild = client.guilds.cache.get(alvo) ?? (await client.guilds.fetch(alvo).catch(() => null));
    if (!guild) return true;
    const escolha = escolhas.get(chave) ?? {};
    if (acao === "ap_dep") escolha.departamento = interaction.values[0];
    else escolha.cargoId = interaction.values[0];
    escolhas.set(chave, escolha);

    const tela = await ecraAprovacao(guild, chave);
    await interaction.update(tela);
    return true;
  }

  if (acao === "ap_cancelar") {
    escolhas.delete(chave);
    await interaction.update({ content: "Aprovação cancelada.", embeds: [], components: [] });
    return true;
  }

  if (acao === "ap_ok") {
    const escolha = escolhas.get(chave);
    const dep = DEPARTAMENTOS.find((d) => d.sigla === escolha?.departamento);
    if (!escolha || !dep || !escolha.cargoId) {
      await interaction.reply({ content: "⚠️ Precisas de escolher o departamento e o cargo do responsável.", flags: MessageFlags.Ephemeral });
      return true;
    }

    await aprovarServidor({
      servidorId: alvo,
      autorId: user.id,
      departamento: dep.sigla,
      cargoResponsavelId: escolha.cargoId,
      cor: dep.cor,
    });
    escolhas.delete(chave);

    // Regista os comandos imediatamente no novo servidor
    await registarComandosServidor(alvo);

    const guildAlvo = client.guilds.cache.get(alvo) ?? (await client.guilds.fetch(alvo).catch(() => null));
    const nomeCargo = guildAlvo?.roles.cache.get(escolha.cargoId)?.name ?? "—";

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(corParaNumero(dep.cor))
          .setTitle(`${dep.emoji} Servidor homologado com sucesso como ${dep.sigla}`)
          .setDescription(`👑 Responsável: **@${nomeCargo}**\nTodos os comandos operacionais e o comando </painel:0> estão agora ativos nesse servidor.`),
      ],
      components: [],
    });

    if (escolha.avisoId) {
      const canal = await canalControlo(client);
      const aviso = await canal?.messages.fetch(escolha.avisoId).catch(() => null);
      if (aviso?.embeds[0]) {
        await aviso.edit({
          embeds: [
            EmbedBuilder.from(aviso.embeds[0])
              .setColor(corParaNumero(dep.cor))
              .setTitle(`✅ Servidor homologado como ${dep.sigla}`)
              .setFooter({ text: `Aprovado por ${user.username}` }),
          ],
          components: [],
        }).catch(() => {});
      }
    }

    await atualizarCentro(client);
    return true;
  }

  if (acao === "recusar") {
    await recusarServidor(alvo, user.id);
    const guild = client.guilds.cache.get(alvo) ?? (await client.guilds.fetch(alvo).catch(() => null));
    await guild?.leave().catch(() => {});

    await interaction.update({
      embeds: [
        EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(COR_VERMELHO)
          .setTitle("❌ Servidor recusado")
          .setFooter({ text: `Recusado por ${user.username}. O bot abandonou o servidor.` }),
      ],
      components: [],
    });
    await atualizarCentro(client);
    return true;
  }

  return false;
}
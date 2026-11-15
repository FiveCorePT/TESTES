import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { env } from "../config/env.js";
import { COR_SCORE, DEPARTAMENTOS, corParaNumero } from "../config/visual.js";
import { pode } from "../core/permissoes.js";
import {
  INTERVALO_MAXIMO,
  INTERVALO_MINIMO,
  TAMANHO_MAXIMO,
  adicionarFrase,
  alternarFrase,
  apagarFrase,
  aprovarFrase,
  definirIntervalo,
  listarFrases,
  listarFrasesPendentes,
  obterFrase,
  obterIntervalo,
  rejeitarFrase,
} from "../core/presence.js";
import { listarDepartamentos, obterServidor } from "../core/servidores.js";
import { obterNivel } from "../discord/permissoes.js";
import { reiniciarPresence } from "../discord/presence.js";
import { atualizarCentro } from "./centro.js";

type Linha = ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>;

function extrairTipoTexto(textoBruto: string): { tipo: string; texto: string; emoji: string } {
  const match = (textoBruto || "").match(/^\[(PLAYING|STREAMING|LISTENING|WATCHING|CUSTOM)\]\s*(.*)$/i);
  if (match) {
    const tipo = match[1].toUpperCase();
    const texto = match[2];
    const emojis: Record<string, string> = {
      PLAYING: "🎮",
      STREAMING: "🟣",
      LISTENING: "🎧",
      WATCHING: "📺",
      CUSTOM: "💬",
    };
    return { tipo, texto, emoji: emojis[tipo] ?? "💬" };
  }
  return { tipo: "CUSTOM", texto: textoBruto || "", emoji: "💬" };
}

export async function notificarNovaFrasePendente(
  client: Client,
  fraseId: number,
  canalOrigemId: string,
) {
  const frase = await obterFrase(fraseId);
  if (!frase) return;

  const canal = await client.channels.fetch(env.canalControloId).catch(() => null);
  if (!canal || !canal.isTextBased() || !("send" in canal)) return;

  const { tipo, texto, emoji } = extrairTipoTexto(frase.texto);
  const servidor = frase.servidor;
  const dep = DEPARTAMENTOS.find((d) => d.sigla === servidor?.departamento);

  const embed = new EmbedBuilder()
    .setColor(0xf0b232)
    .setTitle("⏳ Nova Frase de Presence a aguardar aprovação")
    .setDescription("Um chefe de departamento sugeriu uma nova frase para a rotação global do bot.")
    .addFields(
      { name: "🏢 Departamento", value: dep ? `${dep.emoji} ${dep.sigla} (${servidor.nome})` : servidor.nome, inline: true },
      { name: "👤 Autor", value: `<@${frase.criadoPor}>`, inline: true },
      { name: "🎯 Tipo", value: `${emoji} \`${tipo}\``, inline: true },
      { name: "💬 Frase", value: `>>> "${texto}"` },
    )
    .setFooter({ text: "ScoreRP · Centro de Homologação" })
    .setTimestamp();

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pr_notif_aprov:${frase.id}:${canalOrigemId}`)
      .setLabel("Aprovar Frase")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pr_notif_rej:${frase.id}:${canalOrigemId}`)
      .setLabel("Recusar Frase")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger),
  );

  await canal.send({ embeds: [embed], components: [botoes] }).catch(() => {});
}

export async function notificarDepartamentoDecisao(
  client: Client,
  canalOrigemId: string,
  textoFrase: string,
  aprovada: boolean,
  direcaoUserId: string,
) {
  if (!canalOrigemId) return;
  const canal = await client.channels.fetch(canalOrigemId).catch(() => null);
  if (!canal || !canal.isTextBased() || !("send" in canal)) return;

  const { tipo, texto, emoji } = extrairTipoTexto(textoFrase);

  const embed = new EmbedBuilder()
    .setColor(aprovada ? 0x57f287 : 0xed4245)
    .setTitle(aprovada ? "✅ Presença Aprovada pela Direção" : "❌ Presença Recusada pela Direção")
    .setDescription(
      `A Direção do **ScoreRP** avaliou o pedido de presence submetido por este departamento.\n\n` +
      `💬 **Frase:** "${texto}" (${emoji} \`${tipo}\`)\n` +
      `📋 **Decisão:** ${aprovada ? "**Aprovada!** Já está ativa na rotação pública do bot." : "**Recusada** pela Direção."}\n` +
      `👑 **Analisado por:** <@${direcaoUserId}>`,
    )
    .setFooter({ text: "ScoreRP · Sistema de Homologação" })
    .setTimestamp();

  await canal.send({ embeds: [embed] }).catch(() => {});
}

export async function ecraPresence(servidorId: string) {
  const principal = servidorId === env.mainGuildId;
  const frases = await listarFrases(principal ? undefined : servidorId);
  const pendentes = await listarFrasesPendentes();
  const intervalo = await obterIntervalo();
  const servidor = await obterServidor(servidorId);
  const dep = DEPARTAMENTOS.find((d) => d.sigla === servidor?.departamento);

  const lista = frases
    .map((f, i) => {
      const { tipo, texto, emoji } = extrairTipoTexto(f.texto);
      const origem = f.servidor.tipo === "PRINCIPAL" ? "Global" : (f.servidor.departamento ?? f.servidor.nome);
      let icone = f.ativa ? "🟢" : "⚪";
      if (f.estado === "PENDENTE") icone = "⏳";
      else if (f.estado === "REJEITADA") icone = "❌";
      return `${icone} \`${i + 1}\` ${emoji} ${texto} (\`${tipo}\`)${principal ? ` · *${origem}*` : ""}${f.estado === "PENDENTE" ? " *(Pendente)*" : ""}`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(dep ? corParaNumero(dep.cor) : COR_SCORE)
    .setTitle(principal ? "🔄 Presence · Painel Central da Direção" : `🔄 Presence · ${dep?.sigla ?? servidor?.nome}`)
    .setDescription(
      `O bot alterna estas frases à vez no estado do Discord em todos os servidores.\n${
        !principal ? "\n⚠️ *Nota: Frases criadas por Chefes ficam pendentes até homologação da Direção.*\n" : ""
      }\n${lista || "Ainda não há frases registadas."}`.slice(0, 4000),
    )
    .addFields(
      { name: "Intervalo", value: `⏱️ a cada ${intervalo} segundos`, inline: true },
      { name: "Variáveis", value: "`{membros}` `{departamentos}` `{hora}`", inline: true },
    );

  if (principal && pendentes.length > 0) {
    embed.addFields({
      name: `🔔 Aguardam Aprovação da Direção (${pendentes.length})`,
      value: pendentes
        .slice(0, 5)
        .map((p) => {
          const { tipo, texto } = extrairTipoTexto(p.texto);
          return `• **${p.servidor.departamento ?? p.servidor.nome}**: "${texto}" (\`${tipo}\`)`;
        })
        .join("\n"),
    });
  }

  embed.setFooter({
    text: "🟢 Ativa · ⚪ Desligada · ⏳ Aguarda aprovação da Direção",
  });

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pr_add:${servidorId}`)
      .setLabel(principal ? "Adicionar frase" : "Sugerir frase")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Success),
  );
  if (principal) {
    botoes.addComponents(
      new ButtonBuilder().setCustomId(`pr_int:${servidorId}`).setLabel("Intervalo").setEmoji("⏱️").setStyle(ButtonStyle.Primary),
    );
  } else {
    botoes.addComponents(
      new ButtonBuilder().setCustomId(`dp_voltar:${servidorId}`).setLabel("Painel").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
    );
  }

  const linhas: Linha[] = [botoes];
  if (frases.length) {
    linhas.unshift(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`pr_sel:${servidorId}`)
          .setPlaceholder(
            principal && pendentes.length > 0
              ? `⚠️ ${pendentes.length} pendente(s) · Escolhe uma frase para gerir ou aprovar…`
              : "Escolhe uma frase para gerir…",
          )
          .addOptions(
            frases.slice(0, 25).map((f, i) => {
              const { tipo, texto, emoji } = extrairTipoTexto(f.texto);
              let icon = f.ativa ? "🟢" : "⚪";
              if (f.estado === "PENDENTE") icon = "⏳";
              else if (f.estado === "REJEITADA") icon = "❌";
              const sufixo = f.estado === "PENDENTE" ? " [PENDENTE]" : "";
              return {
                label: `${i + 1}. [${tipo}] ${texto}${sufixo}`.slice(0, 100),
                value: String(f.id),
                emoji: icon,
              };
            }),
          ),
      ),
    );
  }

  return { content: "", embeds: [embed], components: linhas };
}

async function ecraFrase(servidorId: string, fraseId: number) {
  const frase = await obterFrase(fraseId);
  if (!frase) return ecraPresence(servidorId);

  const principal = servidorId === env.mainGuildId;
  const ehPendente = frase.estado === "PENDENTE";
  const ehRejeitada = frase.estado === "REJEITADA";
  const { tipo, texto, emoji } = extrairTipoTexto(frase.texto);

  let statusTexto = frase.ativa ? "🟢 Ligada" : "⚪ Desligada";
  if (ehPendente) statusTexto = "⏳ Pendente de aprovação da Direção";
  else if (ehRejeitada) statusTexto = "❌ Rejeitada pela Direção";

  const embed = new EmbedBuilder()
    .setColor(COR_SCORE)
    .setTitle("💬 Detalhes da Frase de Presence")
    .setDescription(`>>> "${texto}"`)
    .addFields(
      { name: "🎯 Tipo", value: `${emoji} \`${tipo}\``, inline: true },
      { name: "🏢 Origem", value: frase.servidor.departamento ?? frase.servidor.nome, inline: true },
      { name: "📊 Estado", value: statusTexto, inline: true },
      { name: "👤 Criado por", value: `<@${frase.criadoPor}>`, inline: true },
    );

  const botoes = new ActionRowBuilder<ButtonBuilder>();

  if (principal && ehPendente) {
    botoes.addComponents(
      new ButtonBuilder()
        .setCustomId(`pr_aprov:${servidorId}:${frase.id}`)
        .setLabel("Aprovar")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`pr_rej:${servidorId}:${frase.id}`)
        .setLabel("Rejeitar")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger),
    );
  } else if (!ehPendente && !ehRejeitada) {
    botoes.addComponents(
      new ButtonBuilder()
        .setCustomId(`pr_tog:${servidorId}:${frase.id}`)
        .setLabel(frase.ativa ? "Desligar" : "Ligar")
        .setEmoji(frase.ativa ? "⚪" : "🟢")
        .setStyle(ButtonStyle.Primary),
    );
  }

  botoes.addComponents(
    new ButtonBuilder().setCustomId(`pr_del:${servidorId}:${frase.id}`).setLabel("Apagar").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`pr_voltar:${servidorId}`).setLabel("Voltar").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
  );

  return { content: "", embeds: [embed], components: [botoes] };
}

export async function tratarPresence(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
): Promise<boolean> {
  const customId = interaction.customId;
  if (!customId.startsWith("pr_")) return false;

  const [acao, servidorId = "", extra = "", canalOrigemId = ""] = customId.split(":");
  const { client, user } = interaction;
  const principal = servidorId === env.mainGuildId;

  if (acao === "pr_notif_aprov" || acao === "pr_notif_rej") {
    await interaction.deferUpdate();
    const fraseId = Number(servidorId);
    const canalDestino = extra;
    const ehAprovacao = acao === "pr_notif_aprov";

    const frase = await obterFrase(fraseId);
    if (!frase) {
      await interaction.followUp({ content: "⚠️ Frase não encontrada.", flags: MessageFlags.Ephemeral });
      return true;
    }

    if (ehAprovacao) {
      await aprovarFrase(fraseId, user.id);
    } else {
      await rejeitarFrase(fraseId, user.id);
    }

    reiniciarPresence(client);
    await atualizarCentro(client).catch(() => {});

    if (interaction.isButton() && interaction.message.embeds[0]) {
      const embedOriginal = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(ehAprovacao ? 0x57f287 : 0xed4245)
        .setTitle(ehAprovacao ? "✅ Frase de Presence Aprovada" : "❌ Frase de Presence Recusada")
        .setFooter({ text: `${ehAprovacao ? "Aprovada" : "Recusada"} por ${user.username}` });

      await interaction.message.edit({ embeds: [embedOriginal], components: [] }).catch(() => {});
    }

    await notificarDepartamentoDecisao(client, canalDestino, frase.texto, ehAprovacao, user.id);
    return true;
  }

  const nivel = await obterNivel(client, user.id, servidorId);
  if (!pode(nivel, principal ? "bot.controlar" : "servidor.configurar")) {
    await interaction.reply({ content: "❌ Não tens permissão para gerir a presence.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (acao === "pr_add" && interaction.isButton()) {
    const campoTexto = new TextInputBuilder()
      .setCustomId("texto")
      .setLabel("Frase da Presence")
      .setPlaceholder(principal ? "Ex.: 🚨 Central de Despacho Ativa" : "Ex.: 🚨 PSP em patrulha pelas ruas")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(TAMANHO_MAXIMO)
      .setRequired(true);

    const campoTipo = new TextInputBuilder()
      .setCustomId("tipo")
      .setLabel("Tipo (PLAY, LISTEN, WATCH, STREAM...)")
      .setPlaceholder("Ex: CUSTOM, PLAYING, LISTENING, WATCHING, STREAMING")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(20)
      .setValue("CUSTOM")
      .setRequired(false);

    const modal = new ModalBuilder()
      .setCustomId(`pr_modal_add:${servidorId}`)
      .setTitle(principal ? "Criar Frase Oficial (Direção)" : "Sugerir Frase para Presence");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(campoTexto),
      new ActionRowBuilder<TextInputBuilder>().addComponents(campoTipo),
    );

    if (principal) {
      const campoDept = new TextInputBuilder()
        .setCustomId("departamento")
        .setLabel("Departamento (Opcional, vazio = Global)")
        .setPlaceholder("Ex.: PSP, GNR, RSB, SEM...")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(20)
        .setRequired(false);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(campoDept));
    }

    await interaction.showModal(modal);
    return true;
  }

  if (acao === "pr_int" && interaction.isButton() && principal) {
    const campo = new TextInputBuilder()
      .setCustomId("segundos")
      .setLabel(`Segundos entre frases (${INTERVALO_MINIMO} a ${INTERVALO_MAXIMO})`)
      .setStyle(TextInputStyle.Short)
      .setValue(String(await obterIntervalo()))
      .setMaxLength(4)
      .setRequired(true);

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`pr_modal_int:${servidorId}`)
        .setTitle("Intervalo da presence")
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(campo)),
    );
    return true;
  }

  if (acao === "pr_modal_add" && interaction.isModalSubmit()) {
    const texto = interaction.fields.getTextInputValue("texto").trim();
    const tipo = interaction.fields.getTextInputValue("tipo")?.trim() || "CUSTOM";
    let depNome: string | undefined;
    try {
      depNome = interaction.fields.getTextInputValue("departamento")?.trim().toUpperCase();
    } catch {
      depNome = undefined;
    }

    if (!texto) {
      await interaction.reply({ content: "⚠️ A frase não pode estar vazia.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const ehDirecao = principal || pode(nivel, "bot.controlar");
    let targetServidorId = servidorId;
    if (ehDirecao && depNome) {
      const deps = await listarDepartamentos();
      const encontrado = deps.find(
        (d) => d.departamento?.toUpperCase() === depNome || d.nome.toUpperCase().includes(depNome),
      );
      if (encontrado) targetServidorId = encontrado.id;
    }

    const frase = await adicionarFrase(targetServidorId, texto, user.id, ehDirecao, tipo);
    reiniciarPresence(client);
    await atualizarCentro(client).catch(() => {});

    if (frase.estado === "APROVADA") {
      await interaction.reply({
        content: `✅ **Presença Criada e Ativada com Sucesso pela Direção!**\n> 💬 "${texto}" (\`${tipo}\`)\n> 🟢 Já se encontra ativa na rotação do bot.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await notificarNovaFrasePendente(client, frase.id, interaction.channelId ?? "");
      await interaction.reply({
        content: `⏳ **Presença Submetida!**\n> 💬 "${texto}" (\`${tipo}\`)\n> ⚠️ Ficou **pendente** de aprovação pela **Direção** no Centro de Controlo.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  }

  if (acao === "pr_modal_int" && interaction.isModalSubmit() && principal) {
    const segundos = Number(interaction.fields.getTextInputValue("segundos"));
    if (!Number.isInteger(segundos) || segundos < INTERVALO_MINIMO || segundos > INTERVALO_MAXIMO) {
      await interaction.reply({
        content: `⚠️ Escreve um número inteiro entre ${INTERVALO_MINIMO} e ${INTERVALO_MAXIMO}.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await definirIntervalo(segundos, user.id);
    reiniciarPresence(client);
    await atualizarCentro(client).catch(() => {});
    await interaction.reply({ content: "✅ Intervalo alterado.", flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();

  if (acao === "pr_voltar") {
    await interaction.editReply(await ecraPresence(servidorId));
    return true;
  }

  const fraseId = Number(interaction.isStringSelectMenu() ? interaction.values[0] : extra);
  const frase = await obterFrase(fraseId);

  if (!frase || (!principal && frase.servidorId !== servidorId)) {
    await interaction.editReply(await ecraPresence(servidorId));
    return true;
  }

  if (acao === "pr_sel") {
    await interaction.editReply(await ecraFrase(servidorId, fraseId));
    return true;
  }

  if (acao === "pr_aprov") {
    await aprovarFrase(fraseId, user.id);
    reiniciarPresence(client);
    await atualizarCentro(client).catch(() => {});
    await interaction.editReply(await ecraFrase(servidorId, fraseId));
    return true;
  }

  if (acao === "pr_rej") {
    await rejeitarFrase(fraseId, user.id);
    reiniciarPresence(client);
    await atualizarCentro(client).catch(() => {});
    await interaction.editReply(await ecraFrase(servidorId, fraseId));
    return true;
  }

  if (acao === "pr_tog") {
    await alternarFrase(fraseId, user.id);
    reiniciarPresence(client);
    await atualizarCentro(client).catch(() => {});
    await interaction.editReply(await ecraFrase(servidorId, fraseId));
    return true;
  }

  if (acao === "pr_del") {
    await apagarFrase(fraseId, user.id);
    reiniciarPresence(client);
    await atualizarCentro(client).catch(() => {});
    await interaction.editReply(await ecraPresence(servidorId));
    return true;
  }

  return false;
}
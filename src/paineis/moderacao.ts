import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import { COR_SCORE, DEPARTAMENTOS, UI, corParaNumero } from "../config/visual.js";
import { atualizarConfigModeracao, obterConfigModeracao } from "../core/config.js";
import { estadoModulos } from "../core/modulos.js";
import { pode } from "../core/permissoes.js";
import { obterServidor } from "../core/servidores.js";
import {
  aplicarBan,
  aplicarKick,
  aplicarTimeout,
  aplicarUnban,
  aplicarWarn,
  obterHistoricoMembro,
  podeModerar,
  removerTimeout,
} from "../core/moderacao.js";
import { obterNivel } from "../discord/permissoes.js";

async function corDoServidor(servidorId: string) {
  const s = await obterServidor(servidorId);
  const dep = DEPARTAMENTOS.find((d) => d.sigla === s?.departamento);
  return { s, dep, cor: dep ? corParaNumero(dep.cor) : COR_SCORE };
}

// ───────────── Ecrã de Configuração do Chefe (no /painel) ─────────────

export async function ecraModuloModeracao(servidorId: string) {
  const { s, dep, cor } = await corDoServidor(servidorId);
  const ligado = (await estadoModulos(servidorId)).get("moderacao") === true;
  const cfg = await obterConfigModeracao(servidorId);

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`🛡️ Gestão de Moderação · ${dep?.sigla ?? s?.nome ?? "Departamento"}`)
    .setDescription(
      `Ferramentas de controlo de conduta e disciplina no servidor do Discord.\n\n${UI.divisoria}\n` +
      `👑 **Definições da Chefia:**\n` +
      `• **Canal de Logs:** ${cfg.canalLogsMod ? `<#${cfg.canalLogsMod}>` : "— Não definido"}\n` +
      `• **Cargo de Moderação:** ${cfg.cargoModerador ? `<@&${cfg.cargoModerador}>` : "👑 Apenas Chefia"}\n` +
      `• **Auto-Mute de 24h:** Acionado ao atingir **${cfg.limiteWarnsAutoMute} avisos ativos**\n` +
      `• **Estado do Módulo:** ${ligado ? "🟢 Ativo" : "⚪ Desligado"}`,
    )
    .setFooter({ text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? "ScoreRP"} · Controlo de Chefia` });

  const menuLogs = new ChannelSelectMenuBuilder()
    .setCustomId(`mod_cfg_logs:${servidorId}`)
    .setPlaceholder("📜 Escolhe o canal de logs de moderação…")
    .setChannelTypes(ChannelType.GuildText);
  if (cfg.canalLogsMod) menuLogs.setDefaultChannels(cfg.canalLogsMod);

  const menuCargo = new RoleSelectMenuBuilder()
    .setCustomId(`mod_cfg_cargo:${servidorId}`)
    .setPlaceholder("🛡️ Escolhe o cargo autorizado a moderar…")
    .setMinValues(0)
    .setMaxValues(1);
  if (cfg.cargoModerador) menuCargo.setDefaultRoles(cfg.cargoModerador);

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mod_postar_painel:${servidorId}`)
      .setLabel("Publicar Painel de Moderação")
      .setEmoji("🛡️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!ligado),
    new ButtonBuilder()
      .setCustomId(`dp_tog:${servidorId}:moderacao`)
      .setLabel(ligado ? "Desligar Módulo" : "Ligar Módulo")
      .setEmoji(ligado ? "⚪" : "🟢")
      .setStyle(ligado ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`dp_voltar:${servidorId}`)
      .setLabel("Voltar ao Painel")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    content: "",
    embeds: [embed],
    components: [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menuLogs),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menuCargo),
      botoes,
    ],
  };
}

// ───────────── Mensagem do Painel Central de Moderação ─────────────

export async function criarMensagemPainelModeracao(servidorId: string) {
  const { s, dep, cor } = await corDoServidor(servidorId);

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`🛡️ Painel de Moderação · ${dep?.nome ?? s?.nome ?? "ScoreRP"}`)
    .setDescription(
      `Central de ação rápida para a equipa de moderação do servidor.\n\n${UI.divisoria}\n` +
      `1️⃣ Seleciona o **Membro** no menu dropdown abaixo.\n` +
      `2️⃣ Escolhe a ação pretendida nos botões coloridos.\n` +
      `3️⃣ Todas as sanções ficam registadas na base de dados e nas logs oficiais.`,
    )
    .setFooter({ text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? "ScoreRP"} · Controlo de Staff` });

  const menuMembro = new UserSelectMenuBuilder()
    .setCustomId(`mod_selecionar_membro:${servidorId}`)
    .setPlaceholder("👤 Seleciona o membro para moderar…");

  const botoesAcao = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`mod_btn:WARN:${servidorId}`).setLabel("Aviso (Warn)").setEmoji("⚠️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`mod_btn:TIMEOUT:${servidorId}`).setLabel("Silenciar (Mute)").setEmoji("🔇").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_btn:UNTIMEOUT:${servidorId}`).setLabel("Remover Mute").setEmoji("🔊").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_btn:KICK:${servidorId}`).setLabel("Expulsar (Kick)").setEmoji("👢").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`mod_btn:BAN:${servidorId}`).setLabel("Banir").setEmoji("⛔").setStyle(ButtonStyle.Danger),
  );

  const botoesExtra = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`mod_btn:HISTORICO:${servidorId}`).setLabel("Ficha do Membro").setEmoji("📋").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`mod_btn:UNBAN:${servidorId}`).setLabel("Desbanir por ID").setEmoji("🔓").setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menuMembro),
      botoesAcao,
      botoesExtra,
    ],
  };
}

// ───────────── Router de Interações da Moderação ─────────────

const selecoes = new Map<string, string>();

export async function tratarModeracao(interaction: any): Promise<boolean> {
  const customId = interaction.customId;
  if (!customId?.startsWith("mod_")) return false;

  const partes = customId.split(":");
  const acao = partes[0];
  const { client, user, guild } = interaction;
  if (!guild) return false;

  // 1. Definições da Chefia no /painel
  if (acao === "mod_cfg_logs" && interaction.isChannelSelectMenu()) {
    await interaction.deferUpdate();
    const servidorId = partes[1];
    const canal = interaction.channels.first();
    await atualizarConfigModeracao(servidorId, { canalLogsMod: canal?.id ?? null }, user.id);
    const tela = await ecraModuloModeracao(servidorId);
    await interaction.editReply(tela);
    return true;
  }

  if (acao === "mod_cfg_cargo" && interaction.isRoleSelectMenu()) {
    await interaction.deferUpdate();
    const servidorId = partes[1];
    const cargo = interaction.roles.first();
    await atualizarConfigModeracao(servidorId, { cargoModerador: cargo?.id ?? null }, user.id);
    const tela = await ecraModuloModeracao(servidorId);
    await interaction.editReply(tela);
    return true;
  }

  if (acao === "mod_postar_painel") {
    const servidorId = partes[1];
    const nivel = await obterNivel(client, user.id, servidorId);
    if (!pode(nivel, "servidor.configurar")) {
      await interaction.reply({ content: UI.recusado("Apenas a Chefia pode publicar este painel."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(`mod_exec_postar:${servidorId}`)
      .setPlaceholder("Escolhe o canal para o Painel de Moderação…")
      .setChannelTypes(ChannelType.GuildText);

    await interaction.reply({
      content: "📍 Em que canal pretendes afixar o **Painel Central de Moderação**?",
      components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (acao === "mod_exec_postar" && interaction.isChannelSelectMenu()) {
    await interaction.deferUpdate();
    const servidorId = partes[1];
    const canalEscolhido = interaction.channels.first();
    const canal = canalEscolhido ? await guild.channels.fetch(canalEscolhido.id).catch(() => null) : null;
    if (!canal || !canal.isTextBased() || !("send" in canal)) {
      await interaction.editReply({ content: UI.recusado("Canal inválido."), components: [] });
      return true;
    }

    const payload = await criarMensagemPainelModeracao(servidorId);
    await canal.send(payload);

    await interaction.editReply({ content: UI.sucesso(`Painel Central de Moderação publicado com sucesso em <#${canal.id}>!`), components: [] });
    return true;
  }

  // 2. Operações de Moderação
  const autorizado = await podeModerar(guild, user.id);
  if (!autorizado) {
    if (interaction.isRepliable()) {
      await interaction.reply({ content: UI.recusado("Não tens permissão de moderação neste departamento."), flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  const chaveSelecao = `${guild.id}:${user.id}`;

  if (acao === "mod_selecionar_membro" && interaction.isUserSelectMenu()) {
    const membroId = interaction.values[0];
    selecoes.set(chaveSelecao, membroId);
    await interaction.reply({ content: UI.info(`Membro selecionado: <@${membroId}>. Clica no botão da ação que pretendes aplicar.`), flags: MessageFlags.Ephemeral });
    return true;
  }

  if (acao === "mod_btn") {
    const tipoAcao = partes[1];
    const servidorId = partes[2];
    const membroSelecionadoId = selecoes.get(chaveSelecao);

    if (tipoAcao === "UNBAN") {
      const modal = new ModalBuilder()
        .setCustomId(`mod_modal_unban:${servidorId}`)
        .setTitle("🔓 Desbanir Utilizador");

      const inputId = new TextInputBuilder()
        .setCustomId("mod_input_id")
        .setLabel("ID do Utilizador no Discord")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 123456789012345678")
        .setRequired(true);

      const inputMotivo = new TextInputBuilder()
        .setCustomId("mod_input_motivo")
        .setLabel("Motivo da Revogação")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Ex: Apelo de banimento aceite pela equipa de staff…")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputId),
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputMotivo),
      );

      await interaction.showModal(modal);
      return true;
    }

    if (!membroSelecionadoId) {
      await interaction.reply({ content: UI.atencao("Primeiro precisas de escolher um membro no menu dropdown acima!"), flags: MessageFlags.Ephemeral });
      return true;
    }

    // Ficha com Resumo Estatístico no Topo
    if (tipoAcao === "HISTORICO") {
      const historico = await obterHistoricoMembro(servidorId, membroSelecionadoId);
      if (!historico.length) {
        await interaction.reply({ content: UI.sucesso(`O membro <@${membroSelecionadoId}> tem a ficha 100% limpa (sem qualquer infração).`), flags: MessageFlags.Ephemeral });
        return true;
      }

      const totalWarns = historico.filter((h) => h.tipo === "WARN" && h.ativo).length;
      const totalMutes = historico.filter((h) => h.tipo === "TIMEOUT").length;
      const totalKicks = historico.filter((h) => h.tipo === "KICK").length;

      const linhas = historico.map((h, i) => {
        const data = `<t:${Math.floor(h.criadoEm.getTime() / 1000)}:d>`;
        return `**${i + 1}. [${h.tipo}]** aplicado por <@${h.moderadorId}> em ${data}\n↳ Motivo: *${h.motivo}*${h.duracaoMin ? ` (${h.duracaoMin}m)` : ""}`;
      });

      const embedHist = new EmbedBuilder()
        .setColor(COR_SCORE)
        .setTitle(`📋 Ficha de Moderação · <@${membroSelecionadoId}>`)
        .setDescription(
          `📊 **Resumo de Infrações:**\n` +
          `⚠️ **Avisos Ativos:** \`${totalWarns}/3\` | 🔇 **Silenciamentos:** \`${totalMutes}\` | 👢 **Expulsões:** \`${totalKicks}\`\n\n${UI.divisoria}\n` +
          linhas.join("\n\n"),
        )
        .setFooter({ text: "Histórico das últimas 10 infrações no servidor" });

      await interaction.reply({ embeds: [embedHist], flags: MessageFlags.Ephemeral });
      return true;
    }

    if (tipoAcao === "UNTIMEOUT") {
      const alvo = await guild.members.fetch(membroSelecionadoId).catch(() => null);
      if (!alvo) {
        await interaction.reply({ content: UI.atencao("Membro não encontrado no servidor."), flags: MessageFlags.Ephemeral });
        return true;
      }

      await removerTimeout({ guild, alvo, moderadorId: user.id, motivo: "Silenciamento revogado manualmente pela staff" });
      await interaction.reply({ content: UI.sucesso(`Silenciamento de <@${alvo.id}> removido com sucesso.`), flags: MessageFlags.Ephemeral });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`mod_modal_exec:${tipoAcao}:${servidorId}:${membroSelecionadoId}`)
      .setTitle(`Aplicação de ${tipoAcao}`);

    const inputMotivo = new TextInputBuilder()
      .setCustomId("mod_input_motivo")
      .setLabel("Motivo da Sanção")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Ex: Linguagem inapropriada e desrespeito às regras do Discord (Regra 3)")
      .setRequired(true);

    if (tipoAcao === "TIMEOUT") {
      const inputDuracao = new TextInputBuilder()
        .setCustomId("mod_input_duracao")
        .setLabel("Duração em Minutos (Ex: 5, 60, 1440)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 60 para 1 hora, 1440 para 1 dia")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputDuracao),
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputMotivo),
      );
    } else {
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(inputMotivo));
    }

    await interaction.showModal(modal);
    return true;
  }

  // 3. Submissões de Modais de Moderação
  if (acao === "mod_modal_unban" && interaction.isModalSubmit()) {
    const alvoId = interaction.fields.getTextInputValue("mod_input_id").trim();
    const motivo = interaction.fields.getTextInputValue("mod_input_motivo").trim();

    try {
      await aplicarUnban({ guild, alvoId, moderadorId: user.id, motivo });
      await interaction.reply({ content: UI.sucesso(`Utilizador com ID \`${alvoId}\` desbanido com sucesso.`), flags: MessageFlags.Ephemeral });
    } catch {
      await interaction.reply({ content: UI.recusado(`Não foi possível desbanir o ID \`${alvoId}\`. Confirma se o utilizador está realmente banido.`), flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  if (acao === "mod_modal_exec" && interaction.isModalSubmit()) {
    const tipoAcao = partes[1];
    const alvoId = partes[3];
    const motivo = interaction.fields.getTextInputValue("mod_input_motivo").trim();

    const alvo = await guild.members.fetch(alvoId).catch(() => null);

    if (tipoAcao !== "BAN" && !alvo) {
      await interaction.reply({ content: UI.atencao("Membro não encontrado no servidor."), flags: MessageFlags.Ephemeral });
      return true;
    }

    try {
      if (tipoAcao === "WARN" && alvo) {
        const res = await aplicarWarn({ guild, alvo, moderadorId: user.id, motivo });
        let texto = UI.sucesso(`Aviso aplicado a <@${alvo.id}> com sucesso! (Total de avisos ativos: **${res.totalWarns}/3**)`);
        if (res.autoMuteAplicado) {
          texto += `\n🚨 **Atingiu o limite de avisos!** O bot aplicou automaticamente um silenciamento de 24 horas.`;
        }
        await interaction.reply({ content: texto, flags: MessageFlags.Ephemeral });
      }

      if (tipoAcao === "TIMEOUT" && alvo) {
        const duracaoStr = interaction.fields.getTextInputValue("mod_input_duracao").trim();
        const minutos = parseInt(duracaoStr, 10) || 60;
        await aplicarTimeout({ guild, alvo, moderadorId: user.id, minutos, motivo });
        await interaction.reply({ content: UI.sucesso(`<@${alvo.id}> foi silenciado durante **${minutos} minutos**.`), flags: MessageFlags.Ephemeral });
      }

      if (tipoAcao === "KICK" && alvo) {
        await aplicarKick({ guild, alvo, moderadorId: user.id, motivo });
        await interaction.reply({ content: UI.sucesso(`<@${alvo.id}> foi expulso do servidor.`), flags: MessageFlags.Ephemeral });
      }

      if (tipoAcao === "BAN") {
        await aplicarBan({ guild, alvoId, moderadorId: user.id, motivo });
        await interaction.reply({ content: UI.sucesso(`Utilizador <@${alvoId}> foi banido permanentemente do servidor.`), flags: MessageFlags.Ephemeral });
      }
    } catch (err: any) {
      console.error("Erro na moderação:", err);
      await interaction.reply({
        content: UI.recusado("Ocorreu um erro ao aplicar a sanção. Confirma se o cargo do bot está acima do cargo do membro na lista de cargos do Discord."),
        flags: MessageFlags.Ephemeral,
      });
    }

    return true;
  }

  return false;
}
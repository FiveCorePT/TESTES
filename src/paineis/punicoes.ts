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
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import { COR_SCORE, DEPARTAMENTOS, UI, corParaNumero } from "../config/visual.js";
import { atualizarConfigPunicoes, obterConfigPunicoes } from "../core/config.js";
import { estadoModulos } from "../core/modulos.js";
import { pode } from "../core/permissoes.js";
import { obterServidor } from "../core/servidores.js";
import {
  aplicarPunicao,
  obterCadastroAgente,
  obterPunicoesAtivas,
  podePunir,
  revogarPunicao,
  type AcaoPunicao,
} from "../core/punicoes.js";
import { obterNivel } from "../discord/permissoes.js";

async function corDoServidor(servidorId: string) {
  const s = await obterServidor(servidorId);
  const dep = DEPARTAMENTOS.find((d) => d.sigla === s?.departamento);
  return { s, dep, cor: dep ? corParaNumero(dep.cor) : COR_SCORE };
}

// ───────────── Ecrã de Configuração do Chefe (no /painel) ─────────────

export async function ecraModuloPunicoes(servidorId: string) {
  const { s, dep, cor } = await corDoServidor(servidorId);
  const ligado = (await estadoModulos(servidorId)).get("punicoes") === true;
  const cfg = await obterConfigPunicoes(servidorId);

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`⚖️ Punições Internas (RP) · ${dep?.sigla ?? s?.nome ?? "Departamento"}`)
    .setDescription(
      `Regulamento e processos disciplinares aplicados ao efetivo.\n\n${UI.divisoria}\n` +
      `👑 **Definições da Chefia:**\n` +
      `• **Boletim Disciplinar:** ${cfg.canalLogsPunicoes ? `<#${cfg.canalLogsPunicoes}>` : "— Não definido"}\n` +
      `• **Cargo com Autoridade Disciplinar:** ${cfg.cargoCorregedoria ? `<@&${cfg.cargoCorregedoria}>` : "👑 Apenas Chefia"}\n` +
      `• **Estado do Módulo:** ${ligado ? "🟢 Ativo" : "⚪ Desligado"}\n\n` +
      `*Todas as advertências, suspensões e revogações são registadas permanentemente na ficha de cada membro.*`,
    )
    .setFooter({ text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? "ScoreRP"} · Controlo de Chefia` });

  const menuLogs = new ChannelSelectMenuBuilder()
    .setCustomId(`pun_cfg_logs:${servidorId}`)
    .setPlaceholder("📜 Escolhe o canal de boletim disciplinar…")
    .setChannelTypes(ChannelType.GuildText);
  if (cfg.canalLogsPunicoes) menuLogs.setDefaultChannels(cfg.canalLogsPunicoes);

  const menuCargo = new RoleSelectMenuBuilder()
    .setCustomId(`pun_cfg_cargo:${servidorId}`)
    .setPlaceholder("⚖️ Cargo com autoridade disciplinar…")
    .setMinValues(0)
    .setMaxValues(1);
  if (cfg.cargoCorregedoria) menuCargo.setDefaultRoles(cfg.cargoCorregedoria);

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pun_postar_painel:${servidorId}`)
      .setLabel("Publicar Painel de Disciplina")
      .setEmoji("⚖️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!ligado),
    new ButtonBuilder()
      .setCustomId(`dp_tog:${servidorId}:punicoes`)
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

// ───────────── Painel Operacional no canal de chefia ─────────────

export async function criarMensagemPainelPunicoes(servidorId: string) {
  const { s, dep, cor } = await corDoServidor(servidorId);
  const termoMembro = dep?.termoMembro ?? "Membro";

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`⚖️ Painel Disciplinar · ${dep?.nome ?? s?.nome ?? "ScoreRP"}`)
    .setDescription(
      `Central de aplicação de sanções disciplinares internas.\n\n${UI.divisoria}\n` +
      `1️⃣ Seleciona o **${termoMembro}** no menu abaixo.\n` +
      `2️⃣ Escolhe a ação disciplinar ou consulta a **Ficha Disciplinar**.\n` +
      `3️⃣ Caso um recurso seja aceite, usa **Revogar Punição** para anular uma sanção ativa.`,
    )
    .setFooter({ text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? "ScoreRP"} · Corregedoria Interna` });

  const menuMembro = new UserSelectMenuBuilder()
    .setCustomId(`pun_selecionar_agente:${servidorId}`)
    .setPlaceholder(`👮 Seleciona o ${termoMembro.toLowerCase()} a gerir…`);

  const botoesAcao = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`pun_btn:ADVERTENCIA_VERBAL:${servidorId}`).setLabel("Adv. Verbal").setEmoji("🗣️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`pun_btn:ADVERTENCIA_ESCRITA:${servidorId}`).setLabel("Adv. Escrita").setEmoji("📝").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pun_btn:SUSPENSAO:${servidorId}`).setLabel("Suspensão").setEmoji("⛔").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`pun_btn:DESPROMOCAO:${servidorId}`).setLabel("Despromoção").setEmoji("📉").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`pun_btn:EXPULSAO:${servidorId}`).setLabel("Expulsão").setEmoji("🚪").setStyle(ButtonStyle.Danger),
  );

  const botoesExtra = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`pun_btn:REVOGAR:${servidorId}`).setLabel("Revogar Punição").setEmoji("♻️").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pun_btn:FICHA:${servidorId}`).setLabel("Ficha Disciplinar").setEmoji("📂").setStyle(ButtonStyle.Primary),
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

// ───────────── Router de Interações das Punições ─────────────

const selecoesAgente = new Map<string, string>();

export async function tratarPunicoes(interaction: any): Promise<boolean> {
  const customId = interaction.customId;
  if (!customId?.startsWith("pun_")) return false;

  const partes = customId.split(":");
  const acao = partes[0];
  const { client, user, guild } = interaction;
  if (!guild) return false;

  const { dep } = await corDoServidor(partes[1] ?? guild.id);
  const termoMembro = dep?.termoMembro ?? "Membro";

  // 1. Configurações da Chefia no /painel
  if (acao === "pun_cfg_logs" && interaction.isChannelSelectMenu()) {
    await interaction.deferUpdate();
    const servidorId = partes[1];
    const canal = interaction.channels.first();
    await atualizarConfigPunicoes(servidorId, { canalLogsPunicoes: canal?.id ?? null }, user.id);
    const tela = await ecraModuloPunicoes(servidorId);
    await interaction.editReply(tela);
    return true;
  }

  if (acao === "pun_cfg_cargo" && interaction.isRoleSelectMenu()) {
    await interaction.deferUpdate();
    const servidorId = partes[1];
    const cargo = interaction.roles.first();
    await atualizarConfigPunicoes(servidorId, { cargoCorregedoria: cargo?.id ?? null }, user.id);
    const tela = await ecraModuloPunicoes(servidorId);
    await interaction.editReply(tela);
    return true;
  }

  if (acao === "pun_postar_painel") {
    const servidorId = partes[1];
    const nivel = await obterNivel(client, user.id, servidorId);
    if (!pode(nivel, "servidor.configurar")) {
      await interaction.reply({ content: UI.recusado("Apenas a Chefia pode publicar este painel."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(`pun_exec_postar:${servidorId}`)
      .setPlaceholder("Escolhe o canal para o Painel Disciplinar…")
      .setChannelTypes(ChannelType.GuildText);

    await interaction.reply({
      content: "📍 Em que canal pretendes afixar o **Painel Disciplinar**?",
      components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (acao === "pun_exec_postar" && interaction.isChannelSelectMenu()) {
    await interaction.deferUpdate();
    const servidorId = partes[1];
    const canalEscolhido = interaction.channels.first();
    const canal = canalEscolhido ? await guild.channels.fetch(canalEscolhido.id).catch(() => null) : null;
    if (!canal || !canal.isTextBased() || !("send" in canal)) {
      await interaction.editReply({ content: UI.recusado("Canal inválido."), components: [] });
      return true;
    }

    const payload = await criarMensagemPainelPunicoes(servidorId);
    await canal.send(payload);

    await interaction.editReply({ content: UI.sucesso(`Painel Disciplinar publicado com sucesso em <#${canal.id}>!`), components: [] });
    return true;
  }

  // 2. Operações de Punição
  const autorizado = await podePunir(guild, user.id);
  if (!autorizado) {
    if (interaction.isRepliable()) {
      await interaction.reply({ content: UI.recusado("Não tens autorização da Corregedoria/Chefia para aplicar sanções."), flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  const chave = `${guild.id}:${user.id}`;

  if (acao === "pun_selecionar_agente" && interaction.isUserSelectMenu()) {
    const agenteId = interaction.values[0];
    selecoesAgente.set(chave, agenteId);
    await interaction.reply({ content: UI.info(`${termoMembro} selecionado: <@${agenteId}>. Escolhe a ação disciplinar pretendida.`), flags: MessageFlags.Ephemeral });
    return true;
  }

  if (acao === "pun_btn") {
    const tipoAcao = partes[1] as AcaoPunicao | "FICHA" | "REVOGAR";
    const servidorId = partes[2];
    const agenteId = selecoesAgente.get(chave);

    if (!agenteId) {
      await interaction.reply({ content: UI.atencao(`Primeiro precisas de escolher um ${termoMembro.toLowerCase()} no menu acima!`), flags: MessageFlags.Ephemeral });
      return true;
    }

    // Ficha Disciplinar com Separador de Estado
    if (tipoAcao === "FICHA") {
      const cadastro = await obterCadastroAgente(servidorId, agenteId);
      if (!cadastro.length) {
        await interaction.reply({ content: UI.sucesso(`O ${termoMembro.toLowerCase()} <@${agenteId}> tem a ficha disciplinar 100% limpa.`), flags: MessageFlags.Ephemeral });
        return true;
      }

      const linhas = cadastro.map((p: any, i: number) => {
        const data = `<t:${Math.floor(p.criadoEm.getTime() / 1000)}:d>`;
        const estado = p.ativo ? "🟢 **[ATIVA]**" : "⚪ **[REVOGADA/ANULADA]**";
        return `**${i + 1}. ${estado} ${p.tipo}** (#${p.id}) em ${data}\n↳ Motivo: *${p.motivo}*${p.artigo ? ` (Norma: ${p.artigo})` : ""}${p.diasSuspensao ? ` [${p.diasSuspensao} dias]` : ""}${!p.ativo ? `\n↳ Anulado por <@${p.revogadoPor}>: *${p.motivoRevogacao}*` : ""}`;
      });

      const embed = new EmbedBuilder()
        .setColor(COR_SCORE)
        .setTitle(`📂 Ficha Disciplinar · <@${agenteId}>`)
        .setDescription(
          `Registo histórico de processos disciplinares de RP.\n\n${UI.divisoria}\n` +
          linhas.join("\n\n"),
        )
        .setFooter({ text: "Cadastro disciplinar oficial ScoreRP" });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return true;
    }

    // Revogar Sanção Ativa
    if (tipoAcao === "REVOGAR") {
      const ativas = await obterPunicoesAtivas(servidorId, agenteId);
      if (!ativas.length) {
        await interaction.reply({ content: UI.info(`O ${termoMembro.toLowerCase()} <@${agenteId}> não tem qualquer sanção ativa para revogar.`), flags: MessageFlags.Ephemeral });
        return true;
      }

      const menuRevogar = new StringSelectMenuBuilder()
        .setCustomId(`pun_sel_revogar:${servidorId}:${agenteId}`)
        .setPlaceholder("Escolhe a sanção que pretendes anular…")
        .addOptions(
          ativas.map((p: any) => ({
            label: `Processo #${p.id} · ${p.tipo}`,
            description: `${p.motivo.slice(0, 80)}`,
            value: String(p.id),
          })),
        );

      await interaction.reply({
        content: `♻️ **Revogação de Sanção para <@${agenteId}>:**\nSeleciona abaixo qual a punição a anular:`,
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menuRevogar)],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    // Modal para Aplicar Punição
    const modal = new ModalBuilder()
      .setCustomId(`pun_modal_exec:${tipoAcao}:${servidorId}:${agenteId}`)
      .setTitle(`Processo Disciplinar: ${tipoAcao}`);

    const inputMotivo = new TextInputBuilder()
      .setCustomId("pun_input_motivo")
      .setLabel("Descrição dos Factos / Motivo")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Ex: Falha em comparecer a formação obrigatória sem justificação prévia…")
      .setRequired(true);

    const inputArtigo = new TextInputBuilder()
      .setCustomId("pun_input_artigo")
      .setLabel("Artigo ou Norma Violada (Opcional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Ex: Artigo 14º - Dever de Assiduidade e Pontualidade")
      .setRequired(false);

    if (tipoAcao === "SUSPENSAO") {
      const inputDias = new TextInputBuilder()
        .setCustomId("pun_input_dias")
        .setLabel("Dias de Suspensão de Funções")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 3")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputDias),
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputArtigo),
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputMotivo),
      );
    } else {
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputArtigo),
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputMotivo),
      );
    }

    await interaction.showModal(modal);
    return true;
  }

  // Modal de Motivo da Revogação
  if (acao === "pun_sel_revogar" && interaction.isStringSelectMenu()) {
    const processoId = interaction.values[0];
    const servidorId = partes[1];
    const agenteId = partes[2];

    const modal = new ModalBuilder()
      .setCustomId(`pun_modal_revogar:${processoId}:${servidorId}:${agenteId}`)
      .setTitle(`Revogação do Processo #${processoId}`);

    const inputMotivo = new TextInputBuilder()
      .setCustomId("pun_motivo_revogacao")
      .setLabel("Motivo da Anulação / Recurso")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Ex: Recurso aceite pela Chefia máxima com provimento de justificação…")
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(inputMotivo));
    await interaction.showModal(modal);
    return true;
  }

  if (acao === "pun_modal_revogar" && interaction.isModalSubmit()) {
    const processoId = parseInt(partes[1], 10);
    const motivoRevogacao = interaction.fields.getTextInputValue("pun_motivo_revogacao").trim();

    await revogarPunicao({
      guild,
      processoId,
      superiorId: user.id,
      motivoRevogacao,
    });

    await interaction.reply({
      content: UI.sucesso(`O processo **#${processoId}** foi revogado e arquivado com sucesso no boletim!`),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  // Submissão do Modal de Aplicação de Punição
  if (acao === "pun_modal_exec" && interaction.isModalSubmit()) {
    const tipoAcao = partes[1] as AcaoPunicao;
    const agenteId = partes[3];
    const motivo = interaction.fields.getTextInputValue("pun_input_motivo").trim();
    const artigo = interaction.fields.getTextInputValue("pun_input_artigo")?.trim() || undefined;

    let diasSuspensao: number | undefined;
    if (tipoAcao === "SUSPENSAO") {
      const diasStr = interaction.fields.getTextInputValue("pun_input_dias").trim();
      diasSuspensao = parseInt(diasStr, 10) || 1;
    }

    const processo = await aplicarPunicao({
      guild,
      agenteId,
      superiorId: user.id,
      tipo: tipoAcao,
      motivo,
      artigo,
      diasSuspensao,
    });

    await interaction.reply({
      content: UI.sucesso(`Sanção **${tipoAcao}** registada com sucesso no processo **#${processo.id}** para o ${termoMembro.toLowerCase()} <@${agenteId}>!`),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return false;
}
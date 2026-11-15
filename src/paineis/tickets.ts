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
  type TextChannel,
} from "discord.js";
import { COR_SCORE, DEPARTAMENTOS, UI, corParaNumero } from "../config/visual.js";
import { atualizarConfigTickets, obterConfigTickets } from "../core/config.js";
import { estadoModulos } from "../core/modulos.js";
import { pode } from "../core/permissoes.js";
import { obterServidor } from "../core/servidores.js";
import {
  assumirTicket,
  criarTicketCanal,
  fecharEArquivarTicket,
  obterTicketPorCanal,
} from "../core/tickets.js";
import { obterNivel } from "../discord/permissoes.js";

async function corDoServidor(servidorId: string) {
  const s = await obterServidor(servidorId);
  const dep = DEPARTAMENTOS.find((d) => d.sigla === s?.departamento);
  return { s, dep, cor: dep ? corParaNumero(dep.cor) : COR_SCORE };
}

// ───────────── Ecrã de Configuração do Chefe (no /painel) ─────────────

export async function ecraModuloTickets(servidorId: string) {
  const { s, dep, cor } = await corDoServidor(servidorId);
  const ligado = (await estadoModulos(servidorId)).get("tickets") === true;
  const cfg = await obterConfigTickets(servidorId);

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`🎫 Central de Tickets · ${dep?.sigla ?? s?.nome ?? "Departamento"}`)
    .setDescription(
      `Configuração e gestão do atendimento ao público e interno.\n\n${UI.divisoria}\n` +
      `👑 **Definições da Chefia:**\n` +
      `• **Canal de Transcrições:** ${cfg.canalLogsTickets ? `<#${cfg.canalLogsTickets}>` : "— Não definido"}\n` +
      `• **Categoria de Criação:** ${cfg.categoriaTickets ? `<#${cfg.categoriaTickets}>` : "— Categoria padrão"}\n` +
      `• **Cargo de Atendimento:** ${cfg.cargoAtendimento ? `<@&${cfg.cargoAtendimento}>` : "👑 Apenas Chefia"}\n` +
      `• **Estado do Módulo:** ${ligado ? "🟢 Ativo" : "⚪ Desligado"}\n\n` +
      `*Ao fechar qualquer ticket, o histórico completo em .txt é enviado para o canal de transcrições.*`,
    )
    .addFields(
      { name: "📋 Motivos Gerais", value: `${cfg.motivosGerais.length} configurados`, inline: true },
      { name: "🔒 Motivos Internos", value: `${cfg.motivosInternos.length} configurados`, inline: true },
    )
    .setFooter({ text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? "ScoreRP"} · Controlo de Chefia` });

  const menuLogs = new ChannelSelectMenuBuilder()
    .setCustomId(`tk_cfg_logs:${servidorId}`)
    .setPlaceholder("📜 Escolhe o canal de transcrições/logs…")
    .setChannelTypes(ChannelType.GuildText);
  if (cfg.canalLogsTickets) menuLogs.setDefaultChannels(cfg.canalLogsTickets);

  const menuCategoria = new ChannelSelectMenuBuilder()
    .setCustomId(`tk_cfg_cat:${servidorId}`)
    .setPlaceholder("📁 Escolhe a categoria para os tickets…")
    .setChannelTypes(ChannelType.GuildCategory);
  if (cfg.categoriaTickets) menuCategoria.setDefaultChannels(cfg.categoriaTickets);

  const menuCargo = new RoleSelectMenuBuilder()
    .setCustomId(`tk_cfg_cargo:${servidorId}`)
    .setPlaceholder("👥 Escolhe o cargo autorizado a atender…")
    .setMinValues(0)
    .setMaxValues(1);
  if (cfg.cargoAtendimento) menuCargo.setDefaultRoles(cfg.cargoAtendimento);

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tk_postar_geral:${servidorId}`)
      .setLabel("Publicar Painel Geral")
      .setEmoji("📢")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!ligado),
    new ButtonBuilder()
      .setCustomId(`tk_postar_interno:${servidorId}`)
      .setLabel("Publicar Painel Interno")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!ligado),
    new ButtonBuilder()
      .setCustomId(`dp_tog:${servidorId}:tickets`)
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
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menuCategoria),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menuCargo),
      botoes,
    ],
  };
}

// ───────────── Painel Público: Atendimento Geral ─────────────

export async function criarMensagemPainelGeral(servidorId: string) {
  const { s, dep, cor } = await corDoServidor(servidorId);
  const cfg = await obterConfigTickets(servidorId);

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`📩 Balcão de Atendimento · ${dep?.nome ?? s?.nome ?? "ScoreRP"}`)
    .setDescription(
      `Bem-vindo à plataforma de apoio e atendimento do departamento **${dep?.nome ?? s?.nome}**.\n\n${UI.divisoria}\n` +
      `Para abrir um canal privado com a nossa equipa de serviço:\n` +
      `1️⃣ Seleciona o **motivo do teu contacto** no menu abaixo.\n` +
      `2️⃣ Preenche a tua identificação oficial de cidadão.\n` +
      `3️⃣ Um canal exclusivo será criado imediatamente para seres atendido.\n\n` +
      `*Por favor, evita abrir múltiplos tickets em simultâneo.*`,
    )
    .setFooter({ text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? "ScoreRP"} · Atendimento ao Cidadão` });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`tk_abrir_menu:GERAL:${servidorId}`)
    .setPlaceholder("Seleciona o motivo do atendimento…")
    .addOptions(
      cfg.motivosGerais.map((m) => ({
        label: m,
        value: m.slice(0, 100),
        emoji: "📋",
      })),
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  };
}

// ───────────── Painel Privado: Assuntos Internos ─────────────

export async function criarMensagemPainelInterno(servidorId: string) {
  const { s, dep, cor } = await corDoServidor(servidorId);
  const cfg = await obterConfigTickets(servidorId);
  const termoPlural = dep?.termoMembros ?? "Membros";

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`🔒 Assuntos Internos · ${dep?.sigla ?? s?.nome ?? "Departamento"}`)
    .setDescription(
      `Canal confidencial reservado exclusivamente aos **${termoPlural}** do departamento.\n\n${UI.divisoria}\n` +
      `Utiliza esta via para:\n` +
      `• Pedidos de licença / ausência prolongada\n` +
      `• Assuntos disciplinares ou queixas internas\n` +
      `• Pedidos de transferência / reuniões com a Chefia\n\n` +
      `1️⃣ Escolhe o motivo interno no menu abaixo.\n` +
      `2️⃣ Descreve detalhadamente a situação.`,
    )
    .setFooter({ text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? "ScoreRP"} · Canal Interno Reservado` });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`tk_abrir_menu:INTERNO:${servidorId}`)
    .setPlaceholder(`Seleciona o assunto interno…`)
    .addOptions(
      cfg.motivosInternos.map((m) => ({
        label: m,
        value: m.slice(0, 100),
        emoji: "📁",
      })),
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  };
}

// ───────────── Cartão de Identificação dentro do Ticket ─────────────

export async function ecraControloTicket(canalId: string) {
  const ticket = await obterTicketPorCanal(canalId);
  if (!ticket) return null;

  const { s, dep, cor } = await corDoServidor(ticket.servidorId);
  const dados = ticket.dados as Record<string, string>;

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`🎫 Ticket #${ticket.id} · ${ticket.tipo === "GERAL" ? "Atendimento Geral" : "Assuntos Internos"}`)
    .setDescription(
      `Canal de atendimento privado iniciado por <@${ticket.autorId}>.\n` +
      `Um membro da equipa irá assumir o teu caso brevemente.\n\n${UI.divisoria}`,
    )
    .addFields(
      { name: "📋 Motivo", value: `\`${ticket.motivo}\``, inline: true },
      { name: "✋ Atendido por", value: ticket.atendidoPorId ? `<@${ticket.atendidoPorId}>` : "⏳ *A aguardar resposta*", inline: true },
    )
    .setFooter({ text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? s?.nome ?? "ScoreRP"} · Protocolo de Atendimento` })
    .setTimestamp(ticket.criadoEm);

  if (dados.nome) embed.addFields({ name: "👤 Cidadão (RP)", value: dados.nome, inline: true });
  if (dados.cartaoCidadao) embed.addFields({ name: "🪪 Cartão de Cidadão", value: `\`${dados.cartaoCidadao}\``, inline: true });
  if (dados.resumo) embed.addFields({ name: "📝 Resumo do Assunto", value: `>>> ${dados.resumo}` });

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tk_assumir:${canalId}`)
      .setLabel(ticket.atendidoPorId ? "Assumido" : "Assumir Atendimento")
      .setEmoji("✋")
      .setStyle(ticket.atendidoPorId ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(Boolean(ticket.atendidoPorId)),
    new ButtonBuilder()
      .setCustomId(`tk_gerir_acessos:${canalId}`)
      .setLabel("Gerir Acessos")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tk_fechar:${canalId}`)
      .setLabel("Encerrar Ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [botoes] };
}

// ───────────── Router de Interações dos Tickets ─────────────

export async function tratarTickets(interaction: any): Promise<boolean> {
  const customId = interaction.customId;
  if (!customId?.startsWith("tk_")) return false;

  const partes = customId.split(":");
  const acao = partes[0];
  const { client, user, guild } = interaction;
  if (!guild) return false;

  // 1. Definições da Chefia no /painel
  if (acao === "tk_cfg_logs" && interaction.isChannelSelectMenu()) {
    await interaction.deferUpdate();
    const servidorId = partes[1];
    const canal = interaction.channels.first();
    await atualizarConfigTickets(servidorId, { canalLogsTickets: canal?.id ?? null }, user.id);
    const tela = await ecraModuloTickets(servidorId);
    await interaction.editReply(tela);
    return true;
  }

  if (acao === "tk_cfg_cat" && interaction.isChannelSelectMenu()) {
    await interaction.deferUpdate();
    const servidorId = partes[1];
    const cat = interaction.channels.first();
    await atualizarConfigTickets(servidorId, { categoriaTickets: cat?.id ?? null }, user.id);
    const tela = await ecraModuloTickets(servidorId);
    await interaction.editReply(tela);
    return true;
  }

  if (acao === "tk_cfg_cargo" && interaction.isRoleSelectMenu()) {
    await interaction.deferUpdate();
    const servidorId = partes[1];
    const cargo = interaction.roles.first();
    await atualizarConfigTickets(servidorId, { cargoAtendimento: cargo?.id ?? null }, user.id);
    const tela = await ecraModuloTickets(servidorId);
    await interaction.editReply(tela);
    return true;
  }

  // 2. Publicar os Painéis de Atendimento
  if (acao === "tk_postar_geral" || acao === "tk_postar_interno") {
    const servidorId = partes[1];
    const nivel = await obterNivel(client, user.id, servidorId);
    if (!pode(nivel, "servidor.configurar")) {
      await interaction.reply({ content: UI.recusado("Apenas a Chefia pode publicar painéis."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const tipo = acao === "tk_postar_geral" ? "GERAL" : "INTERNO";
    const menuEnvio = new ChannelSelectMenuBuilder()
      .setCustomId(`tk_exec_postar:${tipo}:${servidorId}`)
      .setPlaceholder(`Escolhe o canal onde publicar o painel ${tipo === "GERAL" ? "Geral" : "Interno"}…`)
      .setChannelTypes(ChannelType.GuildText);

    await interaction.reply({
      content: `📍 Onde pretendes afixar o painel de **${tipo === "GERAL" ? "Atendimento Geral" : "Assuntos Internos"}**?`,
      components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menuEnvio)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (acao === "tk_exec_postar" && interaction.isChannelSelectMenu()) {
    await interaction.deferUpdate();
    const tipo = partes[1];
    const servidorId = partes[2];
    const canalEscolhido = interaction.channels.first();
    const canal = canalEscolhido ? await guild.channels.fetch(canalEscolhido.id).catch(() => null) : null;
    if (!canal || !canal.isTextBased() || !("send" in canal)) {
      await interaction.editReply({ content: UI.recusado("Canal inválido."), components: [] });
      return true;
    }

    const payload = tipo === "GERAL" ? await criarMensagemPainelGeral(servidorId) : await criarMensagemPainelInterno(servidorId);
    await canal.send(payload);

    await interaction.editReply({
      content: UI.sucesso(`Painel de **${tipo === "GERAL" ? "Atendimento Geral" : "Assuntos Internos"}** publicado com sucesso em <#${canal.id}>!`),
      components: [],
    });
    return true;
  }

  // 3. Seleção do motivo -> Abre Modal com Placeholders Ricos
  if (acao === "tk_abrir_menu" && interaction.isStringSelectMenu()) {
    const tipo = partes[1] as "GERAL" | "INTERNO";
    const servidorId = partes[2];
    const motivo = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`tk_modal_criar:${tipo}:${servidorId}:${motivo}`)
      .setTitle(tipo === "GERAL" ? "Abertura de Atendimento" : "Assuntos Internos");

    if (tipo === "GERAL") {
      const inputNome = new TextInputBuilder()
        .setCustomId("tk_input_nome")
        .setLabel("Nome Completo no RP")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: Carlos Silva")
        .setRequired(true);

      const inputCC = new TextInputBuilder()
        .setCustomId("tk_input_cc")
        .setLabel("Nº de Cartão de Cidadão ou Passaporte")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 48921 ou Passaporte 1254")
        .setRequired(true);

      const inputResumo = new TextInputBuilder()
        .setCustomId("tk_input_resumo")
        .setLabel("Resumo do Assunto")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Ex: Pretendo apresentar uma denúncia sobre um furto em Legion Square…")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputNome),
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputCC),
        new ActionRowBuilder<TextInputBuilder>().addComponents(inputResumo),
      );
    } else {
      const inputResumo = new TextInputBuilder()
        .setCustomId("tk_input_resumo")
        .setLabel("Descrição do Pedido / Assunto")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Ex: Solicito licença de ausência de 3 dias por motivos pessoais…")
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(inputResumo));
    }

    await interaction.showModal(modal);
    return true;
  }

  // 4. Submissão do Modal -> Cria Canal Privado
  if (acao === "tk_modal_criar" && interaction.isModalSubmit()) {
    const tipo = partes[1] as "GERAL" | "INTERNO";
    const motivo = partes[3];

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const resumo = interaction.fields.getTextInputValue("tk_input_resumo").trim();
    let nome: string | undefined;
    let cartaoCidadao: string | undefined;

    if (tipo === "GERAL") {
      nome = interaction.fields.getTextInputValue("tk_input_nome").trim();
      cartaoCidadao = interaction.fields.getTextInputValue("tk_input_cc").trim();
    }

    const { ticket, canal } = await criarTicketCanal({
      guild,
      autorId: user.id,
      tipo,
      motivo,
      dados: { nome, cartaoCidadao, resumo },
    });

    const painelControlo = await ecraControloTicket(canal.id);
    if (painelControlo) {
      await canal.send({
        content: `👋 Bem-vindo <@${user.id}>! O teu pedido foi recebido pelo sistema.`,
        ...painelControlo,
      });
    }

    await interaction.editReply({
      content: UI.sucesso(`O teu ticket foi criado com sucesso! Clica aqui para aceder: <#${canal.id}>`),
    });
    return true;
  }

  // 5. Botão: Assumir Ticket
  if (acao === "tk_assumir" && interaction.isButton()) {
    const canalId = partes[1];
    await interaction.deferUpdate();

    await assumirTicket(canalId, user.id);
    const atualizado = await ecraControloTicket(canalId);
    if (atualizado) {
      await interaction.message.edit(atualizado);
      await interaction.channel.send({ content: UI.sucesso(`O atendimento foi assumido por <@${user.id}>.`) });
    }
    return true;
  }

  // 6. Botão: Gerir Acessos
  if (acao === "tk_gerir_acessos" && interaction.isButton()) {
    const canalId = partes[1];

    const menuUser = new UserSelectMenuBuilder()
      .setCustomId(`tk_add_user:${canalId}`)
      .setPlaceholder("👤 Adicionar membro a este ticket…");

    const menuRole = new RoleSelectMenuBuilder()
      .setCustomId(`tk_add_role:${canalId}`)
      .setPlaceholder("👥 Adicionar cargo a este ticket…");

    await interaction.reply({
      content: "👥 **Gestão de Acessos ao Canal:**\nEscolhe quem pretendes adicionar à conversa:",
      components: [
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menuUser),
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menuRole),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (acao === "tk_add_user" && interaction.isUserSelectMenu()) {
    const canalId = partes[1];
    const targetId = interaction.values[0];
    const canal = (await guild.channels.fetch(canalId)) as TextChannel;

    if (canal && "permissionOverwrites" in canal) {
      await canal.permissionOverwrites.create(targetId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      await interaction.reply({ content: UI.sucesso(`Membro <@${targetId}> adicionado ao canal.`), flags: MessageFlags.Ephemeral });
      await canal.send({ content: `👥 <@${user.id}> adicionou <@${targetId}> a este atendimento.` });
    }
    return true;
  }

  if (acao === "tk_add_role" && interaction.isRoleSelectMenu()) {
    const canalId = partes[1];
    const roleId = interaction.values[0];
    const canal = (await guild.channels.fetch(canalId)) as TextChannel;

    if (canal && "permissionOverwrites" in canal) {
      await canal.permissionOverwrites.create(roleId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      await interaction.reply({ content: UI.sucesso(`Cargo <@&${roleId}> adicionado ao canal.`), flags: MessageFlags.Ephemeral });
      await canal.send({ content: `👥 <@${user.id}> concedeu acesso ao cargo <@&${roleId}> neste ticket.` });
    }
    return true;
  }

  // 7. Botão: Encerrar Ticket (com barra de contagem decrescente)
  if (acao === "tk_fechar" && interaction.isButton()) {
    const canalId = partes[1];

    const botoesConfirma = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tk_confirma_fecho:${canalId}`)
        .setLabel("Sim, Encerrar e Arquivar")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`tk_cancela_fecho:${canalId}`)
        .setLabel("Cancelar")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
      content: UI.atencao("Tens a certeza que queres encerrar este ticket? Todas as mensagens serão guardadas em ficheiro .txt e o canal será apagado."),
      components: [botoesConfirma],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (acao === "tk_cancela_fecho" && interaction.isButton()) {
    await interaction.update({ content: UI.info("Encerramento do ticket cancelado."), components: [] });
    return true;
  }

  if (acao === "tk_confirma_fecho" && interaction.isButton()) {
    const canalId = partes[1];
    const canal = (await guild.channels.fetch(canalId)) as TextChannel;
    if (!canal) return true;

    await interaction.update({ content: "🔒 A arquivar histórico e a gerar transcrição…", components: [] });

    await fecharEArquivarTicket({ canal, fechadoPorId: user.id });

    // Mensagem de fecho com barra de progresso visual
    await canal.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("🔒 Atendimento Encerrado")
          .setDescription(
            `A transcrição do ticket foi guardada com sucesso no arquivo de logs.\n\n` +
            `**A eliminar este canal…**\n` +
            `\`[██████████] 100%\`\n\n` +
            `*O canal será removido em 5 segundos.*`,
          ),
      ],
    });

    setTimeout(async () => {
      await canal.delete().catch(() => {});
    }, 5000);

    return true;
  }

  return false;
}
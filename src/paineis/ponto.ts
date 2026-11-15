import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
} from "discord.js";
import { COR_SCORE, DEPARTAMENTOS, UI, corParaNumero } from "../config/visual.js";
import { definirMetaSemanalHoras, obterMetaSemanalHoras } from "../core/config.js";
import { estadoModulos } from "../core/modulos.js";
import { pode } from "../core/permissoes.js";
import {
  alternarPausa,
  entrarServico,
  forcarFechoTurno,
  listarAtivos,
  listarTurnosPendentes,
  obterEstatisticasMembro,
  obterTurnoAtivo,
  sairServico,
} from "../core/ponto.js";
import { obterServidor } from "../core/servidores.js";
import { obterNivel } from "../discord/permissoes.js";

async function corDoServidor(servidorId: string) {
  const s = await obterServidor(servidorId);
  const dep = DEPARTAMENTOS.find((d) => d.sigla === s?.departamento);
  return { s, dep, cor: dep ? corParaNumero(dep.cor) : COR_SCORE };
}

// ───────────── Ecrã do Módulo no /painel (Chefia) ─────────────

export async function ecraModuloPonto(servidorId: string) {
  const { s, dep, cor } = await corDoServidor(servidorId);
  const ligado = (await estadoModulos(servidorId)).get("ponto") === true;
  const metaHoras = await obterMetaSemanalHoras(servidorId);
  const ativos = await listarAtivos(servidorId);

  const termoPlural = dep?.termoMembros ?? "Membros";
  const emServico = ativos.filter((t) => t.estado === "EM_SERVICO").length;
  const emPausa = ativos.filter((t) => t.estado === "EM_PAUSA").length;

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`⏱️ Gestão de Ponto · ${dep?.sigla ?? s?.nome ?? "Departamento"}`)
    .setDescription(
      `Configuração operacional e auditoria de serviço.\n\n${UI.divisoria}\n` +
      `📊 **Estado Operacional:**\n` +
      `• Módulo: ${ligado ? "🟢 Ligado" : "⚪ Desligado"}\n` +
      `• Meta Semanal: **${metaHoras}h** de serviço\n` +
      `• ${termoPlural} em Serviço Agora: **${emServico}**\n` +
      `• ${termoPlural} em Pausa Agora: **${emPausa}**\n${UI.divisoria}`,
    )
    .setFooter({ text: "Só o Chefe do Departamento e a Direção podem configurar este painel" });

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pt_postar:${servidorId}`)
      .setLabel("Publicar Estação de Ponto")
      .setEmoji("📍")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!ligado),
    new ButtonBuilder()
      .setCustomId(`pt_cfg_meta:${servidorId}`)
      .setLabel(`Definir Meta (${metaHoras}h)`)
      .setEmoji("🎯")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!ligado),
    new ButtonBuilder()
      .setCustomId(`pt_auditoria:${servidorId}`)
      .setLabel("Auditoria Semanal")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!ligado),
    new ButtonBuilder()
      .setCustomId(`dp_tog:${servidorId}:ponto`)
      .setLabel(ligado ? "Desligar Módulo" : "Ligar Módulo")
      .setEmoji(ligado ? "⚪" : "🟢")
      .setStyle(ligado ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`dp_voltar:${servidorId}`)
      .setLabel("Painel")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary),
  );

  return { content: "", embeds: [embed], components: [botoes] };
}

// ───────────── Estação de Ponto (Canal Público/Operacional) ─────────────

export async function criarMensagemEstacaoPonto(servidorId: string) {
  const { s, dep, cor } = await corDoServidor(servidorId);
  const metaHoras = await obterMetaSemanalHoras(servidorId);
  const termoPlural = dep?.termoMembros ?? "Operacionais";

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`⏱️ Picagem de Ponto · ${dep?.nome ?? s?.nome ?? "ScoreRP"}`)
    .setDescription(
      `Registo oficial de turnos de patrulha e serviço do departamento **${dep?.sigla ?? s?.nome}**.\n\n${UI.divisoria}\n` +
      `🟢 **Entrar de Serviço:** Inicia o teu turno no servidor.\n` +
      `🟡 **Entrar em Pausa:** Regista pausa para refeição ou assunto fora de serviço.\n` +
      `🔴 **Sair de Serviço:** Encerra o turno e submete as horas para validação.\n` +
      `📊 **Minhas Horas:** Consulta o teu tempo semanal e progresso da meta (${metaHoras}h).\n\n` +
      `*Nota: Lembra-te de bater o ponto sempre que entrares e saíres da cidade.*`,
    )
    .setFooter({ text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? "ScoreRP"} · Controlo de Efetivo` });

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`pt_entrar:${servidorId}`).setLabel("Entrar de Serviço").setEmoji("🟢").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pt_pausa:${servidorId}`).setLabel("Pausa / Retomar").setEmoji("🟡").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`pt_sair:${servidorId}`).setLabel("Sair de Serviço").setEmoji("🔴").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`pt_horas:${servidorId}`).setLabel("Minhas Horas").setEmoji("📊").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pt_roster:${servidorId}`).setLabel(`${termoPlural} Ativos`).setEmoji("👥").setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [botoes] };
}

// ───────────── Router de Interações do Ponto ─────────────

export async function tratarPonto(interaction: any): Promise<boolean> {
  const customId = interaction.customId;
  if (!customId?.startsWith("pt_")) return false;

  const partes = customId.split(":");
  const acao = partes[0];
  const servidorId = partes[1];
  const extra = partes[2];
  const { client, user, guild } = interaction;
  if (!guild) return false;

  const { dep } = await corDoServidor(servidorId);
  const termoPlural = dep?.termoMembros ?? "Membros";

  // 1. Configurar Meta Semanal (Apenas Chefia)
  if (acao === "pt_cfg_meta" && interaction.isButton()) {
    const nivel = await obterNivel(client, user.id, servidorId);
    if (!pode(nivel, "servidor.configurar")) {
      await interaction.reply({ content: UI.recusado("Apenas a Chefia pode alterar a meta semanal."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const metaAtual = await obterMetaSemanalHoras(servidorId);
    const modal = new ModalBuilder()
      .setCustomId(`pt_modal_meta:${servidorId}`)
      .setTitle("🎯 Definir Meta Semanal de Horas");

    const inputMeta = new TextInputBuilder()
      .setCustomId("pt_input_meta")
      .setLabel("Meta Semanal (Número de Horas)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Ex: 15")
      .setValue(String(metaAtual))
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(inputMeta));
    await interaction.showModal(modal);
    return true;
  }

  if (acao === "pt_modal_meta" && interaction.isModalSubmit()) {
    await interaction.deferUpdate();
    const valorStr = interaction.fields.getTextInputValue("pt_input_meta").trim();
    const horas = Math.max(1, parseInt(valorStr, 10) || 10);

    await definirMetaSemanalHoras(servidorId, horas, user.id);
    const tela = await ecraModuloPonto(servidorId);
    await interaction.editReply(tela);
    return true;
  }

  // 2. Publicar Estação de Ponto
  if (acao === "pt_postar" && interaction.isButton()) {
    const nivel = await obterNivel(client, user.id, servidorId);
    if (!pode(nivel, "servidor.configurar")) {
      await interaction.reply({ content: UI.recusado("Apenas a Chefia pode publicar a estação de ponto."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(`pt_exec_postar:${servidorId}`)
      .setPlaceholder("Escolhe o canal onde colocar a Estação de Ponto…")
      .setChannelTypes(ChannelType.GuildText);

    await interaction.reply({
      content: "📍 Em que canal queres afixar a **Estação de Ponto**?",
      components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (acao === "pt_exec_postar" && interaction.isChannelSelectMenu()) {
    await interaction.deferUpdate();
    const canalEscolhido = interaction.channels.first();
    const canal = canalEscolhido ? await guild.channels.fetch(canalEscolhido.id).catch(() => null) : null;
    if (!canal || !canal.isTextBased() || !("send" in canal)) {
      await interaction.editReply({ content: UI.recusado("Canal inválido."), components: [] });
      return true;
    }

    const payload = await criarMensagemEstacaoPonto(servidorId);
    await canal.send(payload);

    await interaction.editReply({ content: UI.sucesso(`Estação de Ponto publicada em <#${canal.id}>!`), components: [] });
    return true;
  }

  // 3. Ações Operacionais de Ponto (Entrar / Pausa / Sair)
  if (acao === "pt_entrar" && interaction.isButton()) {
    const ativo = await obterTurnoAtivo(servidorId, user.id);
    if (ativo) {
      await interaction.reply({
        content: UI.atencao(`Já tens um turno em curso desde <t:${Math.floor(ativo.entradaEm.getTime() / 1000)}:t> (${ativo.estado === "EM_PAUSA" ? "atualmente em pausa" : "em serviço"}).`),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const resultado = await entrarServico(servidorId, user.id);
    if (!resultado.sucesso) {
      await interaction.reply({ content: UI.atencao("Não foi possível iniciar o teu turno."), flags: MessageFlags.Ephemeral });
      return true;
    }

    await interaction.reply({ content: UI.sucesso(`Entraste em serviço às <t:${Math.floor(Date.now() / 1000)}:t>. Bom turno!`), flags: MessageFlags.Ephemeral });
    return true;
  }

  if (acao === "pt_pausa" && interaction.isButton()) {
    const ativo = await obterTurnoAtivo(servidorId, user.id);
    if (!ativo) {
      await interaction.reply({ content: UI.atencao("Não tens nenhum turno em aberto. Clica em **Entrar de Serviço** primeiro."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const resultado = await alternarPausa(servidorId, user.id);
    if (!resultado.sucesso) {
      await interaction.reply({ content: UI.atencao("Não foi possível alternar o estado da pausa."), flags: MessageFlags.Ephemeral });
      return true;
    }

    if (resultado.estado === "EM_PAUSA") {
      await interaction.reply({ content: UI.info("Entraste em **PAUSA**. O tempo de serviço está pausado."), flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: UI.sucesso("Retomaste o serviço. O teu tempo volta a ser contabilizado!"), flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  if (acao === "pt_sair" && interaction.isButton()) {
    const ativo = await obterTurnoAtivo(servidorId, user.id);
    if (!ativo) {
      await interaction.reply({ content: UI.atencao("Não estás de serviço no momento."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const resultado = await sairServico(servidorId, user.id);
    if (!resultado.sucesso) {
      await interaction.reply({ content: UI.atencao("Não foi possível encerrar o turno."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const totalMinutos = resultado.turno.totalMinutos ?? 0;
    const totalMinutosPausa = resultado.turno.totalMinutosPausa ?? 0;

    await interaction.reply({
      content: UI.sucesso(`Turno encerrado!\n⏱️ Cumpriste **${UI.formatarTempo(totalMinutos)}** de serviço líquido (Pausa: ${UI.formatarTempo(totalMinutosPausa)}).`),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  // 4. Ver "Minhas Horas" com Barra de Progresso
  if (acao === "pt_horas" && interaction.isButton()) {
    const dados = await obterEstatisticasMembro(servidorId, user.id);
    const metaHoras = await obterMetaSemanalHoras(servidorId);
    const metaMinutos = metaHoras * 60;
    const totalMinutos = (dados.semanaValidadas ?? 0) + (dados.semanaPendentes ?? 0);
    const barra = UI.barraProgresso(totalMinutos, metaMinutos, 12);

    const embed = new EmbedBuilder()
      .setColor(COR_SCORE)
      .setTitle(`📊 Relatório Semanal · ${user.username}`)
      .setDescription(
        `Estatísticas de serviço acumuladas esta semana.\n\n${UI.divisoria}\n` +
        `⏱️ **Tempo Cumprido:** \`${UI.formatarTempo(totalMinutos)}\`\n` +
        `🎯 **Meta Semanal:** \`${metaHoras}h\`\n` +
        `📈 **Progresso da Meta:**\n\`${barra}\`\n\n` +
        `🔢 **Total de Turnos:** \`${dados.totalTurnosSemana}\`\n` +
        `⏳ **Horas Pendentes de Validação:** \`${UI.formatarTempo(dados.semanaPendentes ?? 0)}\`\n${UI.divisoria}`,
      )
      .setFooter({ text: "Pontuação semanal ScoreRP" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return true;
  }

  // 5. Ver Roster Ativo
  if (acao === "pt_roster" && interaction.isButton()) {
    const ativosAgora = await listarAtivos(servidorId);
    const emServico = ativosAgora.filter((t) => t.estado === "EM_SERVICO");
    const emPausa = ativosAgora.filter((t) => t.estado === "EM_PAUSA");

    const valorEmServico = emServico.length
      ? emServico.map((t) => `• <@${t.utilizadorId}> desde <t:${Math.floor(t.entradaEm.getTime() / 1000)}:R>`).join("\n")
      : "— Nenhum no momento";

    const valorEmPausa = emPausa.length
      ? emPausa.map((t) => `• <@${t.utilizadorId}> desde <t:${Math.floor((t.pausaIniciadaEm?.getTime() ?? 0) / 1000)}:R>`).join("\n")
      : "— Nenhum no momento";

    const embed = new EmbedBuilder()
      .setColor(COR_SCORE)
      .setTitle(`👥 ${termoPlural} em Atividade`)
      .addFields(
        { name: `🟢 Em Serviço (${emServico.length})`, value: valorEmServico },
        { name: `🟡 Em Pausa (${emPausa.length})`, value: valorEmPausa },
      )
      .setFooter({ text: "Roster em tempo real" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return true;
  }

  // 6. Auditoria Semanal da Chefia
  if (acao === "pt_auditoria" && interaction.isButton()) {
    const nivel = await obterNivel(client, user.id, servidorId);
    if (!pode(nivel, "servidor.configurar")) {
      await interaction.reply({ content: UI.recusado("Apenas a Chefia pode auditar turnos."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const pagina = await listarTurnosPendentes(servidorId);
    const turnos = pagina.turnos;
    const pendentes = turnos.filter((t) => t.validacao === "PENDENTE");

    const embed = new EmbedBuilder()
      .setColor(COR_SCORE)
      .setTitle(`📋 Auditoria Semanal · ${dep?.sigla ?? "Ponto"}`)
      .setDescription(
        `Gestão de validação de horas cumpridas esta semana.\n\n` +
        `• **Turnos Pendentes:** \`${pendentes.length}\`\n` +
        `• **Total de Registos:** \`${turnos.length}\`\n\n` +
        `Usa os botões abaixo para validar turnos ou forçar o fecho de turnos esquecidos.`,
      );

    const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`pt_fecho_lista:${servidorId}`).setLabel("Forçar Fecho").setEmoji("🔒").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`dp_voltar:${servidorId}`).setLabel("Voltar ao Painel").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [botoes], flags: MessageFlags.Ephemeral });
    return true;
  }

  // 7. Forçar Fecho
  if (acao === "pt_fecho_lista" && interaction.isButton()) {
    const todosAtivos = await listarAtivos(servidorId);

    if (!todosAtivos.length) {
      await interaction.reply({ content: UI.info(`Não há ${termoPlural.toLowerCase()} de serviço neste momento para fechar.`), flags: MessageFlags.Ephemeral });
      return true;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`pt_fecho_exec:${servidorId}`)
      .setPlaceholder("Escolhe quem pretendes retirar de serviço…")
      .addOptions(
        todosAtivos.map((t) => ({
          label: `Turno #${t.id} - Membro: ${t.utilizadorId}`,
          description: `Entrou em: ${t.entradaEm.toLocaleTimeString("pt-PT")}`,
          value: `${t.id}:${t.utilizadorId}`,
        })),
      );

    await interaction.reply({
      content: "🔒 **Forçar Fecho de Turno:** Escolhe o turno a encerrar:",
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (acao === "pt_fecho_exec" && interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
    const valor = interaction.values[0];
    const [turnoIdStr, utilizadorId] = valor.split(":");
    const turnoId = Number.parseInt(turnoIdStr, 10);
    const alvoUtilizadorId = utilizadorId ?? user.id;

    if (!Number.isFinite(turnoId) || !alvoUtilizadorId) {
      await interaction.editReply({ content: UI.recusado("Seleção inválida para fecho forçado."), components: [] });
      return true;
    }

    const resultado = await forcarFechoTurno(servidorId, alvoUtilizadorId, user.id);
    if (!resultado.sucesso) {
      await interaction.editReply({ content: UI.recusado("Não foi possível encerrar este turno."), components: [] });
      return true;
    }

    const turnoFechado = resultado.turno;
    await interaction.editReply({
      content: UI.sucesso(`Turno #${turnoId} de <@${alvoUtilizadorId}> encerrado forçadamente com sucesso. Total contabilizado: **${UI.formatarTempo(turnoFechado.totalMinutos ?? 0)}**.`),
      components: [],
    });
    return true;
  }

  return false;
}
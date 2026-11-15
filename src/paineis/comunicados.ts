import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type Client,
  type ModalSubmitInteraction,
  type RoleSelectMenuInteraction,
} from "discord.js";
import { COR_SCORE, DEPARTAMENTOS, UI, corParaNumero } from "../config/visual.js";
import {
  definirCanalComunicados,
  definirCargoComunicados,
  obterCanalComunicados,
  obterCargoComunicados,
} from "../core/config.js";
import { estadoModulos } from "../core/modulos.js";
import { pode } from "../core/permissoes.js";
import { obterServidor } from "../core/servidores.js";
import { obterNivel } from "../discord/permissoes.js";
import { registarAuditoria } from "../core/auditoria.js";

// Interface para o rascunho temporário do comunicado
interface RascunhoComunicado {
  servidorId: string;
  autorId: string;
  titulo: string;
  conteudo: string;
  imagemUrl: string | null;
  canalId: string | null;
  cargoId: string | null;
}

const rascunhos = new Map<string, RascunhoComunicado>();

async function corDoServidor(servidorId: string) {
  const s = await obterServidor(servidorId);
  const dep = DEPARTAMENTOS.find((d) => d.sigla === s?.departamento);
  return { s, dep, cor: dep ? corParaNumero(dep.cor) : COR_SCORE };
}

// ───────────── Verificação de Permissões ─────────────

export async function podeConfigurarModulo(client: Client, utilizadorId: string, servidorId: string): Promise<boolean> {
  const nivel = await obterNivel(client, utilizadorId, servidorId);
  return pode(nivel, "servidor.configurar");
}

export async function podeEmitirComunicados(client: Client, utilizadorId: string, servidorId: string): Promise<boolean> {
  const nivel = await obterNivel(client, utilizadorId, servidorId);
  if (pode(nivel, "servidor.configurar")) return true;

  const cargoAutorizadoId = await obterCargoComunicados(servidorId);
  if (!cargoAutorizadoId) return false;

  const guild = client.guilds.cache.get(servidorId);
  const membro = guild?.members.cache.get(utilizadorId) ?? (await guild?.members.fetch(utilizadorId).catch(() => null));
  return membro ? membro.roles.cache.has(cargoAutorizadoId) : false;
}

// ───────────── Ecrã Principal do Módulo (Configuração pelo Chefe) ─────────────

export async function ecraModuloComunicados(servidorId: string) {
  const { s, dep, cor } = await corDoServidor(servidorId);
  const ligado = (await estadoModulos(servidorId)).get("comunicados") === true;
  const canalPadrao = await obterCanalComunicados(servidorId);
  const cargoAutorizado = await obterCargoComunicados(servidorId);

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`📢 Comunicados Oficiais · ${dep?.sigla ?? s?.nome ?? "Departamento"}`)
    .setDescription(
      `Central de emissão de ordens de serviço e despachos do departamento.\n\n${UI.divisoria}\n` +
      `👑 **Permissões de Emissão:**\n` +
      `• Quem Pode Emitir: ${cargoAutorizado ? `<@&${cargoAutorizado}>` : "👑 Apenas Chefe do Departamento"}\n` +
      `• Canal Predefinido: ${canalPadrao ? `<#${canalPadrao}>` : "— Escolhido no momento do envio"}\n` +
      `• Estado do Módulo: ${ligado ? "🟢 Ativo" : "⚪ Desligado"}\n\n` +
      `*A configuração deste painel é exclusiva do Chefe do Departamento e da Direção.*`,
    )
    .setFooter({ text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? "ScoreRP"} · Controlo de Chefia` });

  const menuCargo = new RoleSelectMenuBuilder()
    .setCustomId(`cm_cfg_cargo:${servidorId}`)
    .setPlaceholder("👑 Definir cargo autorizado a emitir comunicados…")
    .setMinValues(0)
    .setMaxValues(1);
  if (cargoAutorizado) menuCargo.setDefaultRoles(cargoAutorizado);

  const menuCanal = new ChannelSelectMenuBuilder()
    .setCustomId(`cm_canal_padrao:${servidorId}`)
    .setPlaceholder("📍 Definir canal predefinido (opcional)…")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  if (canalPadrao) menuCanal.setDefaultChannels(canalPadrao);

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cm_novo:${servidorId}`)
      .setLabel("Novo Comunicado")
      .setEmoji("📢")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!ligado),
    new ButtonBuilder()
      .setCustomId(`dp_tog:${servidorId}:comunicados`)
      .setLabel(ligado ? "Desligar Módulo" : "Ligar Módulo")
      .setEmoji(ligado ? "⚪" : "🟢")
      .setStyle(ligado ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`cm_repor_cargo:${servidorId}`)
      .setLabel("Apenas Chefe")
      .setEmoji("👑")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!cargoAutorizado),
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
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menuCargo),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menuCanal),
      botoes,
    ],
  };
}

// ───────────── Modal de Redação do Comunicado ─────────────

export function criarModalComunicado(servidorId: string, rascunho?: RascunhoComunicado) {
  const modal = new ModalBuilder()
    .setCustomId(`cm_modal_novo:${servidorId}`)
    .setTitle("📢 Redigir Comunicado Oficial");

  const inputTitulo = new TextInputBuilder()
    .setCustomId("cm_titulo")
    .setLabel("Título / Assunto da Ordem de Serviço")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: Ordem de Serviço #04/2026 - Normas de Patrulhamento")
    .setRequired(true)
    .setMaxLength(256);
  if (rascunho?.titulo) inputTitulo.setValue(rascunho.titulo);

  const inputConteudo = new TextInputBuilder()
    .setCustomId("cm_conteudo")
    .setLabel("Conteúdo do Comunicado")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Redige o corpo oficial do comunicado. Podes usar formatação Discord (negrito, listas, tópicos).")
    .setRequired(true)
    .setMaxLength(4000);
  if (rascunho?.conteudo) inputConteudo.setValue(rascunho.conteudo);

  const inputImagem = new TextInputBuilder()
    .setCustomId("cm_imagem")
    .setLabel("Banner ou Imagem de Cabeçalho (Opcional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://exemplo.com/banner.png (URL direta da imagem)")
    .setRequired(false)
    .setMaxLength(500);
  if (rascunho?.imagemUrl) inputImagem.setValue(rascunho.imagemUrl);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(inputTitulo),
    new ActionRowBuilder<TextInputBuilder>().addComponents(inputConteudo),
    new ActionRowBuilder<TextInputBuilder>().addComponents(inputImagem),
  );

  return modal;
}

// ───────────── Pré-Visualização e Configuração de Envio ─────────────

export async function ecraPreVisualizacao(client: Client, rascunho: RascunhoComunicado) {
  const { s, dep, cor } = await corDoServidor(rascunho.servidorId);
  const autor = await client.users.fetch(rascunho.autorId).catch(() => null);

  // 1. Embed do Comunicado Oficial formatado
  const embedComunicado = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`📢 ORDEM DE SERVIÇO · ${dep?.sigla ?? "COMUNICADO"}\n${rascunho.titulo}`)
    .setDescription(`${UI.divisoria}\n\n${rascunho.conteudo}\n\n${UI.divisoria}`)
    .setFooter({
      text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? s?.nome ?? "ScoreRP"} · Emissão Oficial`,
      iconURL: client.user?.displayAvatarURL(),
    })
    .setTimestamp();

  if (autor) {
    embedComunicado.setAuthor({
      name: `Emitido por: ${autor.displayName ?? autor.username}`,
      iconURL: autor.displayAvatarURL(),
    });
  }

  if (rascunho.imagemUrl && rascunho.imagemUrl.startsWith("http")) {
    embedComunicado.setImage(rascunho.imagemUrl);
  }

  // 2. Embed informativo dos parâmetros de publicação
  const infoEmbed = new EmbedBuilder()
    .setColor(cor)
    .setTitle("👁️ Pré-Visualização da Publicação")
    .setDescription("Revê abaixo como a mensagem oficial será exibida antes de transmitires para o servidor.")
    .addFields(
      {
        name: "📍 Canal de Transmissão",
        value: rascunho.canalId ? `<#${rascunho.canalId}>` : "⚠️ **Nenhum selecionado** (escolhe no menu abaixo)",
        inline: true,
      },
      {
        name: "👥 Menção de Cargo",
        value: rascunho.cargoId ? `<@&${rascunho.cargoId}>` : "🔕 Nenhuma menção",
        inline: true,
      },
    );

  const menuCanal = new ChannelSelectMenuBuilder()
    .setCustomId(`cm_sel_canal:${rascunho.servidorId}`)
    .setPlaceholder("📍 Escolhe o canal onde queres transmitir…")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  if (rascunho.canalId) menuCanal.setDefaultChannels(rascunho.canalId);

  const menuCargo = new RoleSelectMenuBuilder()
    .setCustomId(`cm_sel_cargo:${rascunho.servidorId}`)
    .setPlaceholder("👥 Escolhe o cargo a mencionar (nunca @everyone)…")
    .setMinValues(0)
    .setMaxValues(1);
  if (rascunho.cargoId) menuCargo.setDefaultRoles(rascunho.cargoId);

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cm_publicar:${rascunho.servidorId}`)
      .setLabel("Transmitir Comunicado")
      .setEmoji("🚀")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!rascunho.canalId),
    new ButtonBuilder()
      .setCustomId(`cm_editar:${rascunho.servidorId}`)
      .setLabel("Editar Texto")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cm_sem_mencao:${rascunho.servidorId}`)
      .setLabel("Sem Menção")
      .setEmoji("🔕")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!rascunho.cargoId),
    new ButtonBuilder()
      .setCustomId(`cm_cancelar:${rascunho.servidorId}`)
      .setLabel("Descartar Rascunho")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger),
  );

  return {
    content: "",
    embeds: [infoEmbed, embedComunicado],
    components: [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menuCanal),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menuCargo),
      botoes,
    ],
  };
}

// ───────────── Router de Interações dos Comunicados ─────────────

export async function tratarComunicados(
  interaction:
    | ButtonInteraction
    | ChannelSelectMenuInteraction
    | RoleSelectMenuInteraction
    | ModalSubmitInteraction,
): Promise<boolean> {
  const customId = interaction.customId;
  if (!customId.startsWith("cm_")) return false;

  const [acao, servidorId = ""] = customId.split(":");
  const { client, user } = interaction;

  // Ações exclusivas de configuração da Chefia
  const acoesConfiguracao = ["cm_cfg_cargo", "cm_canal_padrao", "cm_repor_cargo"];
  if (acoesConfiguracao.includes(acao)) {
    if (!(await podeConfigurarModulo(client, user.id, servidorId))) {
      await interaction.reply({
        content: UI.recusado("Apenas o Chefe do Departamento e a Direção podem alterar as configurações deste módulo."),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (acao === "cm_cfg_cargo" && interaction.isRoleSelectMenu()) {
      await interaction.deferUpdate();
      const cargoId = interaction.roles.first()?.id;
      if (cargoId && (cargoId === interaction.guildId || cargoId === interaction.guild?.roles.everyone.id)) {
        await interaction.followUp({ content: UI.recusado("O cargo @everyone não pode ser definido como cargo autorizado."), flags: MessageFlags.Ephemeral });
        return true;
      }
      await definirCargoComunicados(servidorId, cargoId ?? null, user.id);
      const tela = await ecraModuloComunicados(servidorId);
      await interaction.editReply(tela);
      return true;
    }

    if (acao === "cm_canal_padrao" && interaction.isChannelSelectMenu()) {
      await interaction.deferUpdate();
      const canalEscolhido = interaction.channels.first();
      await definirCanalComunicados(servidorId, canalEscolhido?.id ?? null, user.id);
      const tela = await ecraModuloComunicados(servidorId);
      await interaction.editReply(tela);
      return true;
    }

    if (acao === "cm_repor_cargo" && interaction.isButton()) {
      await interaction.deferUpdate();
      await definirCargoComunicados(servidorId, null, user.id);
      const tela = await ecraModuloComunicados(servidorId);
      await interaction.editReply(tela);
      return true;
    }
  }

  // Ações operacionais de emissão
  if (!(await podeEmitirComunicados(client, user.id, servidorId))) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: UI.recusado("Não tens permissão para emitir comunicados neste departamento. Contacta o Chefe do Departamento."),
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  }

  const chaveRascunho = `${servidorId}:${user.id}`;

  if (acao === "cm_novo" && interaction.isButton()) {
    const canalPadrao = await obterCanalComunicados(servidorId);
    let rascunho = rascunhos.get(chaveRascunho);
    if (!rascunho) {
      rascunho = {
        servidorId,
        autorId: user.id,
        titulo: "",
        conteudo: "",
        imagemUrl: null,
        canalId: canalPadrao,
        cargoId: null,
      };
      rascunhos.set(chaveRascunho, rascunho);
    }
    await interaction.showModal(criarModalComunicado(servidorId, rascunho));
    return true;
  }

  if (acao === "cm_editar" && interaction.isButton()) {
    const rascunho = rascunhos.get(chaveRascunho);
    await interaction.showModal(criarModalComunicado(servidorId, rascunho));
    return true;
  }

  if (acao === "cm_modal_novo" && interaction.isModalSubmit()) {
    const titulo = interaction.fields.getTextInputValue("cm_titulo").trim();
    const conteudo = interaction.fields.getTextInputValue("cm_conteudo").trim();
    const imagemUrl = interaction.fields.getTextInputValue("cm_imagem")?.trim() || null;

    let rascunho = rascunhos.get(chaveRascunho);
    if (!rascunho) {
      const canalPadrao = await obterCanalComunicados(servidorId);
      rascunho = {
        servidorId,
        autorId: user.id,
        titulo,
        conteudo,
        imagemUrl,
        canalId: canalPadrao,
        cargoId: null,
      };
    } else {
      rascunho.titulo = titulo;
      rascunho.conteudo = conteudo;
      rascunho.imagemUrl = imagemUrl;
    }
    rascunhos.set(chaveRascunho, rascunho);

    const painel = await ecraPreVisualizacao(client, rascunho);
    await interaction.reply({ ...painel, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (acao === "cm_sel_canal" && interaction.isChannelSelectMenu()) {
    const rascunho = rascunhos.get(chaveRascunho);
    if (!rascunho) {
      await interaction.reply({ content: UI.atencao("O rascunho expirou. Clica em **Novo Comunicado** para recomeçar."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const escolhido = interaction.channels.first();
    rascunho.canalId = escolhido ? escolhido.id : null;
    rascunhos.set(chaveRascunho, rascunho);

    await interaction.update(await ecraPreVisualizacao(client, rascunho));
    return true;
  }

  if (acao === "cm_sel_cargo" && interaction.isRoleSelectMenu()) {
    const rascunho = rascunhos.get(chaveRascunho);
    if (!rascunho) {
      await interaction.reply({ content: UI.atencao("O rascunho expirou. Clica em **Novo Comunicado** para recomeçar."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const cargoId = interaction.roles.first()?.id;

    if (cargoId && (cargoId === interaction.guildId || cargoId === interaction.guild?.roles.everyone.id)) {
      await interaction.reply({
        content: UI.recusado("Não é permitido mencionar o cargo @everyone! Escolhe um cargo específico ou clica em **Sem Menção**."),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    rascunho.cargoId = cargoId ?? null;
    rascunhos.set(chaveRascunho, rascunho);

    await interaction.update(await ecraPreVisualizacao(client, rascunho));
    return true;
  }

  if (acao === "cm_sem_mencao" && interaction.isButton()) {
    const rascunho = rascunhos.get(chaveRascunho);
    if (rascunho) {
      rascunho.cargoId = null;
      rascunhos.set(chaveRascunho, rascunho);
      await interaction.update(await ecraPreVisualizacao(client, rascunho));
    }
    return true;
  }

  if (acao === "cm_cancelar" && interaction.isButton()) {
    rascunhos.delete(chaveRascunho);
    await interaction.update({ content: UI.info("Rascunho descartado."), embeds: [], components: [] });
    return true;
  }

  if (acao === "cm_publicar" && interaction.isButton()) {
    const rascunho = rascunhos.get(chaveRascunho);
    if (!rascunho || !rascunho.canalId) {
      await interaction.reply({ content: UI.atencao("Precisas de escolher um canal de destino antes de transmitir."), flags: MessageFlags.Ephemeral });
      return true;
    }

    await interaction.deferUpdate();

    const canal = await client.channels.fetch(rascunho.canalId).catch(() => null);
    if (!canal || !canal.isTextBased() || !("send" in canal)) {
      await interaction.editReply({ content: UI.recusado("Não foi possível aceder ao canal de transmissão."), embeds: [], components: [] });
      return true;
    }

    const botNoServidor = interaction.guild?.members.me;
    if (botNoServidor && "permissionsFor" in canal) {
      const perms = canal.permissionsFor(botNoServidor);
      if (!perms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        await interaction.editReply({
          content: UI.recusado(`O bot não tem permissões suficientes no canal <#${rascunho.canalId}> (precisa de: Ver Canal, Enviar Mensagens, Inserir Links).`),
          embeds: [],
          components: [],
        });
        return true;
      }
    }

    const { s, dep, cor } = await corDoServidor(rascunho.servidorId);
    const autor = await client.users.fetch(rascunho.autorId).catch(() => null);

    const embedFinal = new EmbedBuilder()
      .setColor(cor)
      .setTitle(`📢 ORDEM DE SERVIÇO · ${dep?.sigla ?? "COMUNICADO"}\n${rascunho.titulo}`)
      .setDescription(`${UI.divisoria}\n\n${rascunho.conteudo}\n\n${UI.divisoria}`)
      .setFooter({
        text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? s?.nome ?? "ScoreRP"} · Emissão Oficial`,
        iconURL: client.user?.displayAvatarURL(),
      })
      .setTimestamp();

    if (autor) {
      embedFinal.setAuthor({
        name: `Emitido por: ${autor.displayName ?? autor.username}`,
        iconURL: autor.displayAvatarURL(),
      });
    }

    if (rascunho.imagemUrl && rascunho.imagemUrl.startsWith("http")) {
      embedFinal.setImage(rascunho.imagemUrl);
    }

    const conteudoMensagem = rascunho.cargoId ? `<@&${rascunho.cargoId}>` : undefined;

    const mensagemEnviada = await canal.send({
      content: conteudoMensagem,
      embeds: [embedFinal],
      allowedMentions: {
        roles: rascunho.cargoId ? [rascunho.cargoId] : [],
        parse: [],
      },
    });

    await registarAuditoria({
      servidorId,
      autorId: user.id,
      modulo: "comunicados",
      acao: "comunicados.enviado",
      antes: {},
      depois: {
        titulo: rascunho.titulo,
        canalId: rascunho.canalId,
        cargoId: rascunho.cargoId ?? null,
        mensagemId: mensagemEnviada.id,
      },
      reversivel: false,
    });

    rascunhos.delete(chaveRascunho);

    const embedSucesso = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Comunicado Transmitido com Sucesso!")
      .setDescription(
        `A mensagem oficial foi transmitida para o canal <#${rascunho.canalId}>.\n` +
        (rascunho.cargoId ? `👥 **Notificação:** <@&${rascunho.cargoId}>` : "🔕 **Sem menção**"),
      );

    const botoesFinais = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel("Ver no Canal").setEmoji("🔗").setStyle(ButtonStyle.Link).setURL(mensagemEnviada.url),
      new ButtonBuilder().setCustomId(`cm_novo:${servidorId}`).setLabel("Novo Comunicado").setEmoji("📢").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`dp_voltar:${servidorId}`).setLabel("Voltar ao Painel").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ content: "", embeds: [embedSucesso], components: [botoesFinais] });
    return true;
  }

  return false;
}
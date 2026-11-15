import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { COR_SCORE, DEPARTAMENTOS, UI, corParaNumero } from "../config/visual.js";
import { MODULOS, alternarModulo, estadoModulos } from "../core/modulos.js";
import { pode } from "../core/permissoes.js";
import { listarFrases } from "../core/presence.js";
import { obterServidor } from "../core/servidores.js";
import { obterNivel } from "../discord/permissoes.js";
import { prisma } from "../database/client.js";
import { ecraHistorico } from "./historico.js";
import { ecraLogs } from "./logs.js";   
import { ecraModuloTickets } from "./tickets.js";
import { ecraModuloPonto } from "./ponto.js";
import { ecraModuloComunicados } from "./comunicados.js";
import { ecraPresence } from "./presence.js";
import { ecraModuloModeracao } from "./moderacao.js";
import { ecraModuloPunicoes } from "./punicoes.js";

async function corDoServidor(servidorId: string) {
  const s = await obterServidor(servidorId);
  const dep = DEPARTAMENTOS.find((d) => d.sigla === s?.departamento);
  return { s, dep, cor: dep ? corParaNumero(dep.cor) : COR_SCORE };
}

export async function ecraPainel(client: any, servidorId: string) {
  const { s, dep, cor } = await corDoServidor(servidorId);
  const estados = await estadoModulos(servidorId);
  const frases = await listarFrases(servidorId);
  const frasesAtivas = frases.filter((f) => f.ativa).length;
  const cargo = s?.cargoResponsavelId
    ? client.guilds.cache.get(servidorId)?.roles.cache.get(s.cargoResponsavelId)
    : undefined;

  const membrosEmServico = await prisma.registoPonto.count({
    where: { servidorId, estado: { in: ["EM_SERVICO", "EM_PAUSA"] } },
  }).catch(() => 0);

  const ticketsAbertos = await prisma.ticket.count({
    where: { servidorId, estado: { in: ["ABERTO", "ASSUMIDO"] } },
  }).catch(() => 0);

  const termoPlural = dep?.termoMembros ?? "Membros";

  const operacional = [
    `• Ponto: ${estados.get("ponto") ? "🟢 Ativo" : "⚪ Desligado"}`,
    `• Comunicados: ${estados.get("comunicados") ? "🟢 Ativo" : "⚪ Desligado"}`,
  ].join("\n");

  const atendimento = [
    `• Tickets: ${estados.get("tickets") ? "🟢 Ativo" : "⚪ Desligado"}`,
  ].join("\n");

  const disciplina = [
    `• Moderação: ${estados.get("moderacao") ? "🟢 Ativo" : "⚪ Desligado"}`,
    `• Punições RP: ${estados.get("punicoes") ? "🟢 Ativo" : "⚪ Desligado"}`,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`${dep?.emoji ?? "🏢"} Painel de Comando · ${dep?.sigla ?? s?.nome ?? "Departamento"}`)
    .setDescription(
      `Central de supervisão e parametrização do departamento **${dep?.nome ?? s?.nome}**.\n\n${UI.divisoria}\n` +
      `📊 **Estado Operacional ao Vivo:**\n` +
      `⏱️ **${termoPlural} de Serviço:** \`${membrosEmServico}\` ativo(s)\n` +
      `🎫 **Atendimentos em Curso:** \`${ticketsAbertos}\` ticket(s)\n` +
      `👑 **Chefia Máxima:** ${cargo ? `${cargo}` : "— Não definida"}\n` +
      `🔄 **Presence ScoreRP:** \`${frasesAtivas}\` frase(s) ativa(s)\n${UI.divisoria}`,
    )
    .addFields(
      { name: "⏱️ Operacional", value: operacional, inline: true },
      { name: "📩 Atendimento", value: atendimento, inline: true },
      { name: "⚖️ Disciplina & RP", value: disciplina, inline: true },
    )
    .setFooter({ text: `${dep?.emoji ?? "🏢"} ${dep?.nome ?? "ScoreRP"} · Controlo de Chefia` })
    .setTimestamp();

  const guild = client.guilds.cache.get(servidorId);
  const foto = s?.logotipo ?? guild?.iconURL({ size: 256 }) ?? client.user?.displayAvatarURL();
  if (foto) {
    embed.setThumbnail(foto);
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`dp_mod:${servidorId}`)
    .setPlaceholder("Escolhe um módulo para configurar…")
    .addOptions(
      MODULOS.map((m) => ({
        label: `${m.emoji} ${m.nome}`,
        value: m.id,
        description: m.descricao.slice(0, 100),
      })),
    );

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`dp_atualizar:${servidorId}`).setLabel("Atualizar").setEmoji("🔄").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`dp_presence:${servidorId}`).setLabel("Presence").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`dp_historico:${servidorId}`).setLabel("Histórico").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`dp_fechar:${servidorId}`).setLabel("Fechar").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
  );

  return {
    content: "",
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu), botoes],
  };
}

async function ecraModulo(servidorId: string, moduloId: string) {
  const modulo = MODULOS.find((m) => m.id === moduloId);
  const { cor } = await corDoServidor(servidorId);
  const ligado = (await estadoModulos(servidorId)).get(moduloId) ?? false;
  if (!modulo) return { content: UI.recusado("Módulo desconhecido."), embeds: [], components: [] };

  if (moduloId === "logs") return ecraLogs(servidorId);
  if (moduloId === "comunicados") return ecraModuloComunicados(servidorId);
  if (moduloId === "tickets") return ecraModuloTickets(servidorId);
  if (moduloId === "ponto") return ecraModuloPonto(servidorId);
  if (moduloId === "moderacao") return ecraModuloModeracao(servidorId);
  if (moduloId === "punicoes") return ecraModuloPunicoes(servidorId);

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`${modulo.emoji} ${modulo.nome}`)
    .setDescription(`${modulo.descricao}.\n\n🔜 As opções deste módulo chegam nos próximos passos.`)
    .addFields({ name: "Estado", value: ligado ? "🟢 Ligado" : "⚪ Desligado", inline: true });

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`dp_tog:${servidorId}:${modulo.id}`)
      .setLabel(ligado ? "Desligar Módulo" : "Ligar Módulo")
      .setEmoji(ligado ? "⚪" : "🟢")
      .setStyle(ligado ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`dp_voltar:${servidorId}`).setLabel("Voltar ao Painel").setEmoji("⬅️").setStyle(ButtonStyle.Secondary),
  );

  return { content: "", embeds: [embed], components: [botoes] };
}

export async function tratarDepartamento(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<boolean> {
  const [acao, servidorId = "", extra = ""] = interaction.customId.split(":");
  if (!acao.startsWith("dp_")) return false;

  const { client, user } = interaction;

  try {
    if (acao === "dp_fechar") {
      await interaction.update({ content: "Painel dispensado.", embeds: [], components: [] });
      return true;
    }

    await interaction.deferUpdate();

    const nivel = await obterNivel(client, user.id, servidorId);
    if (!pode(nivel, "servidor.configurar")) {
      await interaction.followUp({ content: UI.recusado("Apenas a Chefia do departamento e a Direção podem aceder ao painel."), flags: MessageFlags.Ephemeral });
      return true;
    }

    const servidor = await obterServidor(servidorId);
    if (servidor?.estado !== "APROVADO") {
      await interaction.followUp({ content: UI.atencao("Este servidor ainda aguarda homologação da Direção."), flags: MessageFlags.Ephemeral });
      return true;
    }

    if (acao === "dp_voltar" || acao === "dp_atualizar") {
      const painel = await ecraPainel(client, servidorId);
      await interaction.editReply(painel);
      return true;
    }

    if (acao === "dp_presence") {
      const pres = await ecraPresence(servidorId);
      await interaction.editReply(pres);
      return true;
    }

    if (acao === "dp_historico") {
      const hist = await ecraHistorico(servidorId);
      await interaction.editReply(hist);
      return true;
    }

    if (acao === "dp_mod" && interaction.isStringSelectMenu()) {
      const moduloTela = await ecraModulo(servidorId, interaction.values[0]);
      await interaction.editReply(moduloTela);
      return true;
    }

    if (acao === "dp_tog" && MODULOS.some((m) => m.id === extra)) {
      await alternarModulo(servidorId, extra, user.id);
      const moduloTela = await ecraModulo(servidorId, extra);
      await interaction.editReply(moduloTela);
      return true;
    }
  } catch (erro) {
    console.error("❌ Erro no painel do departamento:", erro);
    await interaction.followUp({
      content: UI.recusado(`Ocorreu um erro no painel: \`${String(erro)}\``),
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }

  return false;
}
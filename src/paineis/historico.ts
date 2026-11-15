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
import { env } from "../config/env.js";
import { COR_SCORE, DEPARTAMENTOS, corParaNumero } from "../config/visual.js";
import { pode } from "../core/permissoes.js";
import { desfazerAcao, listarHistorico, obterRegisto } from "../core/historico.js";
import { obterServidor } from "../core/servidores.js";
import { obterNivel } from "../discord/permissoes.js";
import { atualizarCentro } from "./centro.js";
import { ecraPainel } from "./departamento.js";

const NOMES_ACOES: Record<string, string> = {
  "servidor.aprovado": "✅ Servidor aprovado",
  "servidor.suspenso": "⛔ Servidor suspenso",
  "servidor.recusado": "❌ Servidor recusado",
  "presence.frase_adicionada": "➕ Frase de presence adicionada",
  "presence.frase_ligada": "🟢 Frase de presence ligada",
  "presence.frase_desligada": "⚪ Frase de presence desligada",
  "presence.frase_apagada": "🗑️ Frase de presence apagada",
  "presence.intervalo_alterado": "⏱️ Intervalo de presence alterado",
  "modulo.ligado": "🟢 Módulo ligado",
  "modulo.desligado": "⚪ Módulo desligado",
  "logs.canal_definido": "📜 Canal de logs alterado",
  "auditoria.desfeita": "↩️ Ação desfeita",
};

function formatarValores(valor: unknown) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const linhas = Object.entries(valor as Record<string, unknown>).map(([k, v]) => {
    if (v === null || v === undefined) return `${k}: —`;
    if (k.startsWith("canal")) return `${k}: <#${v}>`;
    return `${k}: ${String(v)}`;
  });
  return linhas.join("\n").slice(0, 1000) || null;
}

// ───────────── Ecrã da Lista do Histórico ─────────────

export async function ecraHistorico(servidorId: string | undefined, pagina: number = 0) {
  const principal = !servidorId || servidorId === env.mainGuildId;
  const servidor = servidorId ? await obterServidor(servidorId).catch(() => null) : null;
  const dep = DEPARTAMENTOS.find((d) => d.sigla === servidor?.departamento);
  const cor = dep ? corParaNumero(dep.cor) : COR_SCORE;

  const { registos, total, totalPaginas, pagina: pagAtual } = await listarHistorico(
    principal ? undefined : servidorId,
    pagina,
  );

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(principal ? "↩️ Histórico e Desfazer · Global" : `↩️ Histórico · ${dep?.sigla ?? servidor?.nome ?? "Departamento"}`)
    .setDescription(
      principal
        ? "Registo de todas as ações realizadas no bot."
        : "Ações dos últimos 30 dias realizadas neste departamento.",
    )
    .setFooter({ text: `Página ${pagAtual + 1} de ${totalPaginas} · Total de ${total} registos` });

  if (registos.length === 0) {
    embed.addFields({ name: "Sem registos", value: "Ainda não existem ações gravadas no histórico." });
  } else {
    for (const r of registos) {
      const nomeAcao = NOMES_ACOES[r.acao] ?? r.acao;
      const dataRelativa = `<t:${Math.floor(r.criadoEm.getTime() / 1000)}:R>`;
      let estado = " · ⚪ Não reversível";
      if (r.desfeitaEm) estado = ` · ↩️ Desfeita por <@${r.desfeitaPor}>`;
      else if (r.reversivel) estado = " · 🔄 Reversível";

      embed.addFields({
        name: `#${r.id} · ${nomeAcao}`,
        value: `Feito por <@${r.autorId}> ${dataRelativa}${estado}`,
      });
    }
  }

  const linhas: (ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>)[] = [];

  if (registos.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`hist_sel:${servidorId ?? "global"}:${pagAtual}`)
      .setPlaceholder("Escolhe uma ação para ver detalhes ou desfazer…")
      .addOptions(
        registos.map((r) => ({
          label: `#${r.id} · ${(NOMES_ACOES[r.acao] ?? r.acao).slice(0, 80)}`,
          description: (r.desfeitaEm ? "Ação já desfeita" : r.reversivel ? "Pode ser desfeita" : "Não reversível").slice(0, 100),
          value: String(r.id),
          emoji: r.desfeitaEm ? "↩️" : r.reversivel ? "🔄" : "📜",
        })),
      );
    linhas.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }

  const botoes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`hist_pag:${servidorId ?? "global"}:${pagAtual - 1}`)
      .setLabel("Anterior")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pagAtual <= 0),
    new ButtonBuilder()
      .setCustomId(`hist_pag:${servidorId ?? "global"}:${pagAtual + 1}`)
      .setLabel("Seguinte")
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pagAtual >= totalPaginas - 1),
    new ButtonBuilder()
      .setCustomId(`hist_sair:${servidorId ?? "global"}`)
      .setLabel(principal ? "Fechar" : "Voltar")
      .setStyle(ButtonStyle.Secondary),
  );
  linhas.push(botoes);

  return { content: "", embeds: [embed], components: linhas };
}

// ───────────── Ecrã de Detalhe de um Registo ─────────────

export async function ecraDetalheHistorico(
  registoId: number,
  origem: string,
  paginaOrigem: number = 0,
) {
  const registo = await obterRegisto(registoId);
  if (!registo) {
    return { content: "⚠️ Registo não encontrado.", embeds: [], components: [] };
  }

  const dep = DEPARTAMENTOS.find((d) => d.sigla === registo.servidor?.departamento);
  const cor = dep ? corParaNumero(dep.cor) : COR_SCORE;
  const nomeAcao = NOMES_ACOES[registo.acao] ?? registo.acao;

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`📜 Detalhe da Ação #${registo.id}`)
    .addFields(
      { name: "Ação", value: nomeAcao, inline: true },
      { name: "Módulo", value: registo.modulo, inline: true },
      { name: "Servidor", value: registo.servidor?.nome ?? registo.servidorId, inline: true },
      { name: "Feito por", value: `<@${registo.autorId}>`, inline: true },
      {
        name: "Data",
        value: `<t:${Math.floor(registo.criadoEm.getTime() / 1000)}:f> (<t:${Math.floor(registo.criadoEm.getTime() / 1000)}:R>)`,
        inline: true,
      },
      {
        name: "Estado",
        value: registo.desfeitaEm
          ? `↩️ Desfeita por <@${registo.desfeitaPor}>`
          : registo.reversivel
            ? "🟢 Reversível"
            : "⚪ Não reversível",
        inline: true,
      },
    )
    .setFooter({ text: `ID: ${registo.id} · Origem: ${registo.origem}` });

  const antes = formatarValores(registo.antes);
  const depois = formatarValores(registo.depois);
  if (antes) embed.addFields({ name: "Antes", value: antes, inline: true });
  if (depois) embed.addFields({ name: "Depois", value: depois, inline: true });

  const botoes = new ActionRowBuilder<ButtonBuilder>();

  if (registo.reversivel && !registo.desfeitaEm) {
    botoes.addComponents(
      new ButtonBuilder()
        .setCustomId(`hist_undo:${origem}:${registo.id}:${paginaOrigem}`)
        .setLabel("Desfazer")
        .setEmoji("↩️")
        .setStyle(ButtonStyle.Danger),
    );
  }

  botoes.addComponents(
    new ButtonBuilder()
      .setCustomId(`hist_voltar:${origem}:${paginaOrigem}`)
      .setLabel("Voltar")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary),
  );

  return { content: "", embeds: [embed], components: [botoes] };
}

// ───────────── Tratamento de Interações do Histórico ─────────────

const ACOES_HISTORICO = new Set(["hist_sel", "hist_pag", "hist_sair", "hist_voltar", "hist_undo"]);

export async function tratarHistorico(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<boolean> {
  const [acao, alvo1 = "", alvo2 = "", alvo3 = ""] = interaction.customId.split(":");
  if (!ACOES_HISTORICO.has(acao)) return false;

  const { client, user } = interaction;
  const servidorId = alvo1 === "global" ? env.mainGuildId : alvo1;
  const nivel = await obterNivel(client, user.id, servidorId);

  if (!pode(nivel, alvo1 === "global" ? "bot.controlar" : "servidor.configurar")) {
    await interaction.deferUpdate().catch(() => {});
    await interaction.followUp({ content: "❌ Sem permissão.", flags: MessageFlags.Ephemeral });
    return true;
  }

  // Responde imediatamente ao Discord (< 50ms) para evitar time-out
  await interaction.deferUpdate();

  if (acao === "hist_pag") {
    const pagina = Number(alvo2) || 0;
    const servId = alvo1 === "global" ? undefined : alvo1;
    const tela = await ecraHistorico(servId, pagina);
    await interaction.editReply(tela);
    return true;
  }

  if (acao === "hist_sel" && interaction.isStringSelectMenu()) {
    const registoId = Number(interaction.values[0]);
    const pagina = Number(alvo2) || 0;
    const tela = await ecraDetalheHistorico(registoId, alvo1, pagina);
    await interaction.editReply(tela);
    return true;
  }

  if (acao === "hist_voltar") {
    const pagina = Number(alvo2) || 0;
    const servId = alvo1 === "global" ? undefined : alvo1;
    const tela = await ecraHistorico(servId, pagina);
    await interaction.editReply(tela);
    return true;
  }

  if (acao === "hist_sair") {
    if (alvo1 === "global") {
      await interaction.editReply({ content: "↩️ Histórico fechado.", embeds: [], components: [] });
    } else {
      const painel = await ecraPainel(client, alvo1);
      await interaction.editReply(painel);
    }
    return true;
  }

  if (acao === "hist_undo") {
    // Suporta ambos os formatos de botão para compatibilidade total
    let registoId: number;
    let origem: string;
    let pagina: number = 0;

    if (!isNaN(Number(alvo1)) && isNaN(Number(alvo2))) {
      registoId = Number(alvo1);
      origem = alvo2;
      pagina = Number(alvo3) || 0;
    } else {
      origem = alvo1;
      registoId = Number(alvo2);
      pagina = Number(alvo3) || 0;
    }

    const resultado = await desfazerAcao(client, registoId, user.id, nivel);

    if (!resultado.sucesso) {
      let msg = "⚠️ Esta ação não pode ser desfeita.";
      if (resultado.erro === "SO_DIRECAO") {
        msg = "❌ Só a Direção pode desfazer ações da Direção.";
      } else if (resultado.erro === "EXPIRADA") {
        msg = "⚠️ Esta ação já tem mais de 30 dias e expirou.";
      } else if (resultado.erro === "JA_DESFEITA") {
        msg = "⚠️ Esta ação já foi desfeita anteriormente.";
      } else if (resultado.erro === "NAO_ENCONTRADO") {
        msg = `⚠️ Registo #${registoId} não foi encontrado na base de dados.`;
      } else if (resultado.erro === "NAO_REVERSIVEL") {
        msg = "⚠️ Esta ação não é reversível.";
      } else if (resultado.erro === "FALHA") {
        msg = `❌ Falha técnica ao reverter a ação #${registoId}. Verifica o terminal do bot para mais detalhes.`;
      }
      await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
      return true;
    }

    await atualizarCentro(client).catch(() => {});
    const tela = await ecraDetalheHistorico(registoId, origem, pagina);
    await interaction.editReply(tela);
    await interaction.followUp({ content: "✅ Ação desfeita com sucesso!", flags: MessageFlags.Ephemeral });
    return true;
  }

  return false;
}
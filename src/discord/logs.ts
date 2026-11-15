import { EmbedBuilder, type Client } from "discord.js";
import { env } from "../config/env.js";
import { COR_SCORE, DEPARTAMENTOS, corParaNumero } from "../config/visual.js";
import { aoRegistarAuditoria } from "../core/auditoria.js";
import { obterCanalLogs } from "../core/config.js";
import { MODULOS, estadoModulos } from "../core/modulos.js";
import { obterServidor, listarDepartamentos } from "../core/servidores.js";
import type { Auditoria } from "../generated/prisma/client.js";

// Módulos que nunca vão para o Discord (ex.: o /ping de teste)
const NAO_ENVIAR = new Set(["teste"]);

// Alterações privadas da Direção: só aparecem nas logs do servidor principal
const PRIVADOS = new Set(["staff"]);

const NOMES: Record<string, string> = {
  "servidor.aprovado": "✅ Servidor aprovado",
  "servidor.suspenso": "⛔ Servidor suspenso",
  "servidor.recusado": "❌ Servidor recusado",
  "presence.frase_adicionada": "➕ Frase de presence adicionada",
  "presence.frase_ligada": "🟢 Frase de presence ligada",
  "presence.frase_desligada": "⚪ Frase de presence desligada",
  "presence.frase_apagada": "🗑️ Frase de presence apagada",
  "presence.intervalo_alterado": "⏱️ Intervalo da presence alterado",
  "modulo.ligado": "🟢 Módulo ligado",
  "modulo.desligado": "⚪ Módulo desligado",
  "logs.canal_definido": "📜 Canal de logs alterado",
  "comunicados.enviado": "📢 Comunicado oficial enviado",
  "comunicados.canal_definido": "📢 Canal de comunicados alterado",
  "auditoria.desfeita": "↩️ Ação desfeita",
};

// Transforma o "antes"/"depois" em linhas legíveis
function formatar(valor: unknown) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "object") return String(valor);
  const linhas = Object.entries(valor as Record<string, unknown>).map(([chave, v]) => {
    if (v === null || v === undefined) return `${chave}: —`;
    if (chave.startsWith("canal")) return `${chave}: <#${v}>`;
    return `${chave}: ${String(v)}`;
  });
  return linhas.join("\n").slice(0, 1000) || null;
}

async function enviarLog(client: Client, registo: Auditoria) {
  if (NAO_ENVIAR.has(registo.modulo)) return;

  const servidor = await obterServidor(registo.servidorId);
  const dep = DEPARTAMENTOS.find((d) => d.sigla === servidor?.departamento);
  const modulo = MODULOS.find((m) => m.id === registo.modulo);

  const embed = new EmbedBuilder()
    .setColor(dep ? corParaNumero(dep.cor) : COR_SCORE)
    .setTitle(NOMES[registo.acao] ?? registo.acao)
    .addFields(
      { name: "Servidor", value: servidor ? `${dep?.emoji ?? "🏢"} ${servidor.nome}` : registo.servidorId, inline: true },
      { name: "Feito por", value: `<@${registo.autorId}>`, inline: true },
      { name: "Módulo", value: modulo ? `${modulo.emoji} ${modulo.nome}` : registo.modulo, inline: true },
    )
    .setFooter({ text: `Registo #${registo.id} · ${registo.origem}` })
    .setTimestamp(registo.criadoEm);

  const antes = formatar(registo.antes);
  const depois = formatar(registo.depois);
  if (antes) embed.addFields({ name: "Antes", value: antes, inline: true });
  if (depois) embed.addFields({ name: "Depois", value: depois, inline: true });

  const destinos = new Set<string>();

  const canalPrincipal = await obterCanalLogs(env.mainGuildId);
  if (canalPrincipal) destinos.add(canalPrincipal);

  if (servidor?.tipo === "DEPARTAMENTO" && !PRIVADOS.has(registo.modulo)) {
    const ligado = (await estadoModulos(registo.servidorId)).get("logs") === true;
    const canalDep = await obterCanalLogs(registo.servidorId);
    if (ligado && canalDep) destinos.add(canalDep);
  }

  for (const id of destinos) {
    const canal = await client.channels.fetch(id).catch(() => null);
    if (canal?.isSendable()) {
      await canal.send({ embeds: [embed] }).catch((erro) => console.error(`❌ Falhou o envio de log para ${id}:`, erro));
    }
  }
}

// Retenção de 30 dias (1 mês) para os canais de logs dos departamentos
const RETENCAO_DEPARTAMENTO_MS = 30 * 24 * 60 * 60 * 1000;

export async function limparLogsDepartamentos(client: Client) {
  try {
    const departamentos = (await listarDepartamentos()).filter((s) => s.estado === "APROVADO");

    for (const dep of departamentos) {
      const canalId = await obterCanalLogs(dep.id);
      if (!canalId) continue;

      const canal = await client.channels.fetch(canalId).catch(() => null);
      if (!canal || !canal.isTextBased() || !("messages" in canal)) continue;

      const agora = Date.now();
      let antesDe: string | undefined;

      // Percorre as mensagens para encontrar logs antigas do bot
      while (true) {
        const mensagens = await canal.messages.fetch({ limit: 100, before: antesDe }).catch(() => null);
        if (!mensagens || mensagens.size === 0) break;

        for (const msg of mensagens.values()) {
          const idade = agora - msg.createdTimestamp;
          // Se tiver mais de 30 dias e for do próprio bot, apaga
          if (idade > RETENCAO_DEPARTAMENTO_MS && msg.author.id === client.user?.id) {
            await msg.delete().catch(() => {});
            await new Promise((r) => setTimeout(r, 400)); // Pequena pausa para respeitar o rate-limit do Discord
          }
        }

        antesDe = mensagens.last()?.id;
        if (mensagens.size < 100) break;
      }
    }
  } catch (erro) {
    console.error("❌ Falha na rotina de limpeza de logs dos departamentos:", erro);
  }
}

export function iniciarLogs(client: Client) {
  aoRegistarAuditoria((registo) => {
    enviarLog(client, registo).catch((erro) => console.error("❌ Falhou o envio de log:", erro));
  });

  // Executa a limpeza a cada 12 horas
  setInterval(() => {
    void limparLogsDepartamentos(client);
  }, 12 * 60 * 60 * 1000);
}
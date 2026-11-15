import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { env } from "../config/env.js";
import { COR_SCORE, DEPARTAMENTOS, corParaNumero } from "../config/visual.js";
import { pode } from "../core/permissoes.js";
import { obterServidor } from "../core/servidores.js";
import { obterNivel } from "../discord/permissoes.js";
import type { Comando } from "./tipos.js";

export const ajuda: Comando = {
  semAprovacao: true,
  dados: new SlashCommandBuilder()
    .setName("ajuda")
    .setDescription("Manual detalhado dos comandos e funcionalidades do bot ScoreRP"),

  async executar(interaction) {
    const { client, guildId, user } = interaction;
    const privado = MessageFlags.Ephemeral;

    const principal = guildId === env.mainGuildId;
    const nivel = await obterNivel(client, user.id, guildId);
    const servidor = await obterServidor(guildId);
    const dep = DEPARTAMENTOS.find((d) => d.sigla === servidor?.departamento);
    const cor = dep ? corParaNumero(dep.cor) : COR_SCORE;

    // ─────────────────────────────────────────────────────────────
    // CASO 1: SERVIDOR PRINCIPAL (DIREÇÃO E FUNDAÇÃO)
    // ─────────────────────────────────────────────────────────────
    if (principal) {
      const ehDirecao = pode(nivel, "bot.controlar");

      const embed = new EmbedBuilder()
        .setColor(COR_SCORE)
        .setTitle("🛡️ Manual Completo de Comandos · Direção & Fundação")
        .setDescription(
          `Bem-vindo ao manual oficial do **ScoreRP Core** no Servidor Principal.\n` +
          `Abaixo encontras a explicação detalhada de **cada comando** e do **Centro de Controlo** permanente.`,
        )
        .addFields(
          {
            name: "📌 </ping:0>",
            value:
              "• **O que faz:** Avalia a saúde e o estado de ligação do bot.\n" +
              "• **Como funciona:** Mede a latência da websocket em tempo real (em milissegundos) e faz uma contagem direta à base de dados PostgreSQL para informar quantos registos de auditoria existem gravados.\n" +
              "• **Quem pode usar:** Todos os membros.",
          },
          {
            name: "📌 </presence painel:0>",
            value:
              "• **O que faz:** Abre o painel central de rotação de estados do bot.\n" +
              "• **Como funciona:** Lista todas as frases registadas (globais e de departamentos), permite aprovar ou rejeitar frases sugeridas por chefes de corporações, ligar/desligar frases individuais e definir o intervalo em segundos entre cada rotação.\n" +
              "• **Quem pode usar:** Direção e Fundação.",
          },
          {
            name: "📌 </presence criar:0>",
            value:
              "• **O que faz:** Regista imediatamente uma nova frase na presence do bot com aprovação automática.\n" +
              "• **Parâmetros:**\n" +
              "  ↳ `texto`: A mensagem a exibir (suporta variáveis dinâmicas: `{membros}`, `{departamentos}`, `{hora}`, `{dia}`).\n" +
              "  ↳ `departamento` *(opcional)*: Sigla da corporação (ex.: `PSP`, `GNR`). Se omitido, a frase fica atribuída como Global.\n" +
              "• **Quem pode usar:** Direção e Fundação.",
          },
          {
            name: "📌 </ajuda:0>",
            value:
              "• **O que faz:** Exibe este guia detalhado de suporte e explicação de todos os recursos.\n" +
              "• **Quem pode usar:** Todos os membros.",
          },
          {
            name: "👑 Centro de Controlo (<#" + env.canalControloId + ">)",
            value:
              "No servidor principal, a administração de fundo faz-se na mensagem fixa do canal de controlo:\n" +
              "• **🏢 Servidores:** Inspeciona corporações aprovadas, aprova novos servidores pendentes, define o cargo de chefia e atribui a cor temática.\n" +
              "• **🔄 Presence:** Notifica com alerta se existirem frases pendentes submetidas por chefes de departamento e permite aprová-las com 1 clique.\n" +
              "• **📜 Logs:** Visualiza o canal central de auditoria onde todas as ações de todos os servidores ficam gravadas de forma permanente.\n" +
              "• **↩️ Histórico e Desfazer:** Lista as ações recentes e permite reverter alterações.",
          },
        )
        .setFooter({ text: "ScoreRP · Centro de Gestão Central" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: privado });
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // CASO 2: SERVIDOR DE DEPARTAMENTO (CHEFIA OU OPERACIONAIS)
    // ─────────────────────────────────────────────────────────────
    const ehChefe = pode(nivel, "servidor.configurar");
    const tituloDep = dep ? `${dep.emoji} ${dep.sigla} · ${dep.nome}` : servidor?.nome ?? "Departamento";

    const embed = new EmbedBuilder()
      .setColor(cor)
      .setTitle(`📋 Manual Oficial de Comandos · ${tituloDep}`)
      .setDescription(
        `Guia explicativo das ferramentas operacionais disponíveis no servidor de **${dep?.nome ?? "RP"}**.`,
      );

    if (ehChefe) {
      embed.addFields(
        {
          name: "👑 </painel:0> — Painel do Responsável",
          value:
            "• **O que faz:** Abre a interface central de configuração deste departamento (em mensagem privada efémera).\n" +
            "• **O que podes configurar:**\n" +
            "  ↳ **Módulos:** Ativa ou desativa ferramentas (Logs, Comunicados, Presence, Ponto, Tickets, etc.).\n" +
            "  ↳ **📜 Canal de Logs:** Escolhe o canal de texto privado onde o bot regista todas as ações deste departamento (guardadas em base de dados com retenção mensal).\n" +
            "  ↳ **🔄 Presence:** Acede à lista de frases exclusivas deste departamento e ao botão para sugerir novas frases.\n" +
            "• **Quem pode usar:** Apenas o Responsável/Chefe da corporação e a Direção.",
        },
        {
          name: "📢 </comunicado:0> — Emissão de Comunicados Oficiais",
          value:
            "• **O que faz:** Abre uma janela de redação para criar anúncios, avisos e despachos operacionais formatados com embed oficial da corporação.\n" +
            "• **Como funciona:**\n" +
            "  1. Escreves o **Título** e o **Conteúdo** da mensagem.\n" +
            "  2. O bot gera um rascunho privado com pré-visualização exata.\n" +
            "  3. Escolhes o canal de destino e podes selecionar um **cargo para mencionar** (ex.: Agentes, Oficiais) sem nunca usar @everyone.\n" +
            "  4. Clicas em Publicar para emitir a mensagem com logótipo e assinatura do autor.\n" +
            "• **Quem pode usar:** Chefia e membros autorizados pelo responsável.",
        },
        {
          name: "🔄 </presence criar:0> e </presence painel:0>",
          value:
            "• **O que faz:** Permite sugerir e gerir frases dinâmicas para aparecerem na presence do bot no Discord (ex.: *🚨 PSP em patrulha · {membros} agentes*).\n" +
            "• **Fluxo de Aprovação:** As frases criadas pela chefia ficam com estado **⏳ Pendente** e são enviadas ao Centro de Controlo da Direção para aprovação antes de entrarem na rotação pública.\n" +
            "• **Comando </presence painel:0>:** Mostra quais frases estão ativas (🟢), desligadas (⚪) ou pendentes (⏳).",
        },
        {
          name: "🏓 </ping:0>",
          value:
            "• **O que faz:** Testa a conectividade e latência de resposta do bot, informando o número de auditorias registadas neste departamento.\n" +
            "• **Quem pode usar:** Todos os membros.",
        },
        {
          name: "ℹ️ </ajuda:0>",
          value:
            "• **O que faz:** Mostra este manual detalhado sempre que precisares de consultar o funcionamento de cada ferramenta.",
        },
      );
    } else {
      embed.addFields(
        {
          name: "👮 O que faz este bot no teu servidor?",
          value:
            `Este bot é a ferramenta oficial de automação e apoio operacional do **${dep?.sigla ?? "ScoreRP"}**.\n` +
            "Ele é responsável pelo envio de comunicados oficiais, registos de auditoria e integração com os serviços centrais da cidade.",
        },
        {
          name: "⌨️ Comandos Disponíveis para Membros",
          value:
            "• **</ajuda:0>** — Mostra esta explicação detalhada sobre o funcionamento e comandos do bot.\n" +
            "• **</ping:0>** — Verifica se o bot está operacional e o tempo de resposta (latência) da ligação.",
        },
        {
          name: "🔒 Comandos Restritos à Chefia",
          value:
            "Comandos como **</painel:0>**, **</comunicado:0>** e **</presence:0>** são de acesso exclusivo aos responsáveis e à Direção para manter a ordem e segurança das configurações.",
        },
      );
    }

    embed.setFooter({
      text: `${dep?.nome ?? "ScoreRP"} · Em caso de dúvidas, contacta a chefia da corporação`,
    }).setTimestamp();

    await interaction.reply({ embeds: [embed], flags: privado });
  },
};
import { ActivityType, type Client } from "discord.js";
import { frasesEmRotacao, obterIntervalo } from "../core/presence.js";
import { listarDepartamentos } from "../core/servidores.js";

const FUSO = "Europe/Lisbon";
const ligadoDesde = Date.now();

let indice = 0;
let temporizador: NodeJS.Timeout | undefined;

function extrairTipoTexto(textoBruto: string): { tipo: string; texto: string } {
  const match = (textoBruto || "").match(/^\[(PLAYING|STREAMING|LISTENING|WATCHING|CUSTOM)\]\s*(.*)$/i);
  if (match) {
    return { tipo: match[1].toUpperCase(), texto: match[2] };
  }
  return { tipo: "CUSTOM", texto: textoBruto || "" };
}

function duracao(ms: number) {
  const minutos = Math.floor(ms / 60000);
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  if (dias) return `${dias}d ${horas}h`;
  if (horas) return `${horas}h ${minutos % 60}min`;
  return `${minutos}min`;
}

export async function preencher(texto: string, client: Client) {
  if (!texto.includes("{")) return texto;

  const departamentos = (await listarDepartamentos()).filter((s) => s.estado === "APROVADO");
  const agora = new Date();

  const valores: Record<string, string> = {
    membros: String(client.guilds.cache.reduce((soma, g) => soma + g.memberCount, 0)),
    servidores: String(client.guilds.cache.size),
    departamentos: String(new Set(departamentos.map((s) => s.departamento)).size),
    hora: agora.toLocaleTimeString("pt-PT", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }),
    data: agora.toLocaleDateString("pt-PT", { timeZone: FUSO }),
    dia: agora.toLocaleDateString("pt-PT", { timeZone: FUSO, weekday: "long" }),
    ping: client.ws.ping >= 0 ? `${client.ws.ping}ms` : "—",
    online_ha: duracao(Date.now() - ligadoDesde),
  };

  return texto.replace(/\{(\w+)(?::(\w+))?\}/g, (original, nome: string, sigla?: string) => {
    if (nome === "membros" && sigla) {
      return String(
        departamentos
          .filter((s) => s.departamento?.toUpperCase() === sigla.toUpperCase())
          .reduce((soma, s) => soma + (client.guilds.cache.get(s.id)?.memberCount ?? 0), 0),
      );
    }
    return valores[nome] ?? original;
  });
}

async function mostrarSeguinte(client: Client) {
  const frases = await frasesEmRotacao();
  const fraseObj = frases.length ? frases[indice % frases.length] : null;
  indice++;

  const textoCru = fraseObj ? fraseObj.texto : "[CUSTOM] ScoreRP";
  const { tipo, texto: textoLimpo } = extrairTipoTexto(textoCru);
  const textoProcessado = await preencher(textoLimpo, client);

  const mapaTipos: Record<string, ActivityType> = {
    PLAYING: ActivityType.Playing,
    STREAMING: ActivityType.Streaming,
    LISTENING: ActivityType.Listening,
    WATCHING: ActivityType.Watching,
    CUSTOM: ActivityType.Custom,
  };

  const activityType = mapaTipos[tipo] ?? ActivityType.Custom;

  if (activityType === ActivityType.Custom) {
    client.user?.setPresence({
      status: "online",
      activities: [
        {
          name: "ScoreRP",
          type: ActivityType.Custom,
          state: textoProcessado,
        },
      ],
    });
  } else {
    client.user?.setPresence({
      status: "online",
      activities: [
        {
          name: textoProcessado,
          type: activityType,
        },
      ],
    });
  }
}

export function iniciarPresence(client: Client) {
  const ciclo = async () => {
    try {
      await mostrarSeguinte(client);
    } catch (erro) {
      console.error("❌ Falhou a atualização da presence:", erro);
    }
    const segundos = await obterIntervalo().catch(() => 30);
    temporizador = setTimeout(ciclo, segundos * 1000);
  };
  void ciclo();
}

export function reiniciarPresence(client: Client) {
  clearTimeout(temporizador);
  iniciarPresence(client);
}
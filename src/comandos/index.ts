import { ajuda } from "./ajuda.js";
import { comunicado } from "./comunicado.js";
import { painel } from "./painel.js";
import { ping } from "./ping.js";
import { presenceComando } from "./presence.js";
import type { Comando } from "./tipos.js";

// Normalizador seguro: garante que nem exports default nem módulos circulares geram undefined
function normalizarComando(cmd: any): Comando | null {
  if (!cmd) return null;
  if (cmd.dados && typeof cmd.dados.toJSON === "function") return cmd as Comando;
  if (cmd.default?.dados && typeof cmd.default.dados.toJSON === "function") return cmd.default as Comando;
  if (cmd.presenceComando?.dados) return cmd.presenceComando as Comando;
  if (cmd.ajuda?.dados) return cmd.ajuda as Comando;
  if (cmd.painel?.dados) return cmd.painel as Comando;
  if (cmd.ping?.dados) return cmd.ping as Comando;
  if (cmd.comunicado?.dados) return cmd.comunicado as Comando;
  return null;
}

const listaBruta = [ping, painel, comunicado, presenceComando, ajuda];

export const comandos: Comando[] = listaBruta
  .map(normalizarComando)
  .filter((c): c is Comando => c !== null && Boolean(c.dados));
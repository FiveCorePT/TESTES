import type { ChatInputCommandInteraction } from "discord.js";

export interface Comando {
  dados: { name: string; toJSON(): unknown };
  // true = funciona mesmo num servidor que ainda não foi aprovado
  semAprovacao?: boolean;
  executar(interaction: ChatInputCommandInteraction<"cached">): Promise<void>;
}
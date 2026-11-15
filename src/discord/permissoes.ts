import { PermissionFlagsBits, type Client } from "discord.js";
import { env } from "../config/env.js";
import { calcularNivel, type Nivel } from "../core/permissoes.js";
import { obterServidor } from "../core/servidores.js";

// Vai buscar os cargos e permissões do membro em ambos os servidores
export async function obterNivel(
  client: Client,
  utilizadorId: string,
  servidorId: string,
): Promise<Nivel> {
  const principal =
    client.guilds.cache.get(env.mainGuildId) ??
    (await client.guilds.fetch(env.mainGuildId).catch(() => null));

  const membroPrincipal =
    principal?.members.cache.get(utilizadorId) ??
    (await principal?.members.fetch(utilizadorId).catch(() => null));

  const guild =
    client.guilds.cache.get(servidorId) ??
    (await client.guilds.fetch(servidorId).catch(() => null));

  const membro =
    guild?.id === principal?.id
      ? membroPrincipal
      : (guild?.members.cache.get(utilizadorId) ??
        (await guild?.members.fetch(utilizadorId).catch(() => null)));

  const servidor = await obterServidor(servidorId);

  const isAdmin = membro?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
  const isOwner = guild?.ownerId === utilizadorId;

  return calcularNivel({
    cargosNoPrincipal: membroPrincipal ? [...membroPrincipal.roles.cache.keys()] : [],
    cargosNoServidor: membro ? [...membro.roles.cache.keys()] : [],
    cargosGlobais: env.cargosGlobais,
    cargoResponsavelId: servidor?.cargoResponsavelId ?? null,
    isOwnerPrincipal: principal?.ownerId === utilizadorId,
    isOwnerServidor: isOwner,
    isAdminServidor: isAdmin,
  });
}
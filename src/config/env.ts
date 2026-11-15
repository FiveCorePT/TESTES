import "dotenv/config";

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`❌ Falta a variável ${nome} no ficheiro .env`);
    process.exit(1);
  }
  return valor;
}

export const env = {
  token: obrigatoria("DISCORD_TOKEN"),
  clientId: obrigatoria("CLIENT_ID"),
  mainGuildId: obrigatoria("MAIN_GUILD_ID"),
  devGuildId: obrigatoria("DEV_GUILD_ID"),
  databaseUrl: obrigatoria("DATABASE_URL"),

  // Cargos do servidor principal com controlo total do bot
  cargosGlobais: [obrigatoria("FUNDACAO_ROLE_ID"), obrigatoria("DIRECAO_ROLE_ID")],

  // Canal privado do servidor principal onde fica o Centro de Controlo
  canalControloId: obrigatoria("CANAL_CONTROLO_ID"),
};
-- CreateEnum
CREATE TYPE "TipoServidor" AS ENUM ('PRINCIPAL', 'DEPARTAMENTO');

-- CreateTable
CREATE TABLE "Servidor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoServidor" NOT NULL DEFAULT 'DEPARTAMENTO',
    "departamento" TEXT,
    "cor" TEXT NOT NULL DEFAULT '#5865F2',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Servidor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "servidorId" TEXT NOT NULL,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("servidorId")
);

-- CreateTable
CREATE TABLE "Modulo" (
    "id" SERIAL NOT NULL,
    "servidorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Modulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" SERIAL NOT NULL,
    "servidorId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "alvoId" TEXT,
    "antes" JSONB,
    "depois" JSONB,
    "reversivel" BOOLEAN NOT NULL DEFAULT false,
    "desfeitaEm" TIMESTAMP(3),
    "desfeitaPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Modulo_servidorId_nome_key" ON "Modulo"("servidorId", "nome");

-- CreateIndex
CREATE INDEX "Auditoria_servidorId_criadoEm_idx" ON "Auditoria"("servidorId", "criadoEm");

-- CreateIndex
CREATE INDEX "Auditoria_autorId_idx" ON "Auditoria"("autorId");

-- AddForeignKey
ALTER TABLE "Configuracao" ADD CONSTRAINT "Configuracao_servidorId_fkey" FOREIGN KEY ("servidorId") REFERENCES "Servidor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modulo" ADD CONSTRAINT "Modulo_servidorId_fkey" FOREIGN KEY ("servidorId") REFERENCES "Servidor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_servidorId_fkey" FOREIGN KEY ("servidorId") REFERENCES "Servidor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

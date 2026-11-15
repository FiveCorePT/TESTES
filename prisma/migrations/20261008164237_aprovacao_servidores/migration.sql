-- CreateEnum
CREATE TYPE "EstadoServidor" AS ENUM ('PENDENTE', 'APROVADO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "OrigemAcao" AS ENUM ('DISCORD', 'SITE', 'API', 'JOGO');

-- AlterTable
ALTER TABLE "Auditoria" ADD COLUMN     "origem" "OrigemAcao" NOT NULL DEFAULT 'DISCORD';

-- AlterTable
ALTER TABLE "Servidor" ADD COLUMN     "aprovadoEm" TIMESTAMP(3),
ADD COLUMN     "aprovadoPor" TEXT,
ADD COLUMN     "cargoResponsavelId" TEXT,
ADD COLUMN     "estado" "EstadoServidor" NOT NULL DEFAULT 'PENDENTE',
ADD COLUMN     "logotipo" TEXT;

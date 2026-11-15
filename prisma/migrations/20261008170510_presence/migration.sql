-- CreateTable
CREATE TABLE "FrasePresence" (
    "id" SERIAL NOT NULL,
    "servidorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrasePresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Definicoes" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "intervaloPresence" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "Definicoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FrasePresence_servidorId_idx" ON "FrasePresence"("servidorId");

-- AddForeignKey
ALTER TABLE "FrasePresence" ADD CONSTRAINT "FrasePresence_servidorId_fkey" FOREIGN KEY ("servidorId") REFERENCES "Servidor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

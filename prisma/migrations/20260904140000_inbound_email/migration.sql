-- ===========================================================================
-- Finort - Ingestao de extratos por e-mail (Fase 12)
-- ===========================================================================
--
-- Cada empresa pode ter um endereco dedicado (<token>@dominio). O token e a
-- unica credencial do endereco, por isso e aleatorio, unico e trocavel; a
-- lista de remetentes autorizados e a segunda barreira: extrato de quem nao
-- esta nela e recusado.
--
-- ImportBatch registra a origem (UPLOAD | EMAIL) e o remetente, para a tela
-- da empresa avisar "chegaram N lancamentos por e-mail".

CREATE TYPE "import_source" AS ENUM ('UPLOAD', 'EMAIL');

ALTER TABLE "companies"
  ADD COLUMN "inbound_token" TEXT,
  ADD COLUMN "inbound_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "inbound_senders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "companies_inbound_token_key" ON "companies"("inbound_token");

ALTER TABLE "import_batches"
  ADD COLUMN "source" "import_source" NOT NULL DEFAULT 'UPLOAD',
  ADD COLUMN "sender_email" TEXT;

-- ===========================================================================
-- Finort - Memoria de categorizacao em dois niveis (Fase 11)
-- ===========================================================================
--
-- Nivel workspace (categorization_memory): descricao normalizada -> categoria,
-- alimentada por confirmacao humana. Fica DENTRO do workspace, com policy de
-- RLS igual as demais tabelas financeiras: descricao pode conter dado pessoal.
--
-- Nivel plataforma (cnpj_profiles): cache do CNAE por CNPJ, que e dado
-- publico. Global, sem workspace_id e sem policy: so a aplicacao (dona das
-- tabelas) le e grava. anon/authenticated ficam sem privilegio algum.
--
-- categories.default_id liga a categoria clonada a categoria do sistema de
-- origem, para uma sugestao global apontar para "Fornecedores / CMV" em
-- qualquer workspace, mesmo renomeada. O backfill casa por nome e grupo, que
-- e o que o clone copiou.

-- Novas origens de categorizacao
ALTER TYPE "categorized_by" ADD VALUE 'MEMORY';
ALTER TYPE "categorized_by" ADD VALUE 'CNPJ';

-- Vinculo da categoria clonada com a categoria padrao
ALTER TABLE "categories" ADD COLUMN "default_id" UUID;

UPDATE "categories" c
SET "default_id" = d."id"
FROM "categories" d
WHERE d."workspace_id" IS NULL
  AND c."workspace_id" IS NOT NULL
  AND c."name" = d."name"
  AND c."group" = d."group";

CREATE INDEX "categories_workspace_id_default_id_idx" ON "categories"("workspace_id", "default_id");

-- Nivel workspace
CREATE TABLE "categorization_memory" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "normalized_description" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categorization_memory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categorization_memory_workspace_id_normalized_description_key"
  ON "categorization_memory"("workspace_id", "normalized_description");

ALTER TABLE "categorization_memory"
  ADD CONSTRAINT "categorization_memory_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "categorization_memory"
  ADD CONSTRAINT "categorization_memory_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "categorization_memory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "categorization_memory" FROM anon, authenticated;

CREATE POLICY "categorization_memory_tenant" ON "categorization_memory"
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT public.grenor_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.grenor_workspace_ids()));

-- Nivel plataforma
CREATE TABLE "cnpj_profiles" (
    "cnpj" TEXT NOT NULL,
    "razao_social" TEXT,
    "cnae_principal" TEXT,
    "cnae_descricao" TEXT,
    "suggested_default_id" UUID,
    "source" TEXT NOT NULL,
    "not_found" BOOLEAN NOT NULL DEFAULT false,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cnpj_profiles_pkey" PRIMARY KEY ("cnpj")
);

ALTER TABLE "cnpj_profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "cnpj_profiles" FROM anon, authenticated;

-- Sugestao da IA abaixo do limiar de confianca (Secao 5.3).
--
-- Fica em coluna propria, e nao em category_id, de proposito: sugestao nao e
-- categoria. Se o palpite de confianca 0,6 ocupasse category_id, o periodo
-- fecharia como "100% categorizado" carregando um chute para dentro da DRE.

ALTER TABLE "transactions"
  ADD COLUMN "ai_suggested_category_id" UUID;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_ai_suggested_category_id_fkey"
  FOREIGN KEY ("ai_suggested_category_id")
  REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "transactions_ai_suggested_category_id_idx"
  ON "transactions"("ai_suggested_category_id");

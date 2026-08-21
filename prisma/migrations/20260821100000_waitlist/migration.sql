-- ===========================================================================
-- Grenor - Lista de espera da pagina publica (Fase 8)
-- ===========================================================================
--
-- Tabela fora do modelo multi-tenant: quem se inscreve ainda nao e cliente e
-- nao pertence a workspace nenhum. Por isso o tratamento de RLS difere do
-- resto (ver 20260820120100_rls):
--
--   * RLS habilitado e privilegios revogados de `anon` e `authenticated`,
--     como em todas as outras tabelas - a API PostgREST nao alcanca a lista.
--   * SEM policy. Nas tabelas financeiras a policy por workspace e a segunda
--     barreira; aqui nao existe "workspace do usuario" para comparar, e uma
--     policy permissiva so abriria a lista de e-mails para leitura publica.
--     Nenhuma policy significa nenhuma linha visivel, que e o correto: so o
--     dono das tabelas (a aplicacao) grava e le.
--
-- A insercao publica chega pela Server Action, que usa a conexao da
-- aplicacao - dono das tabelas, portanto fora do RLS.

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "office" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_email_key" ON "waitlist_entries"("email");

-- Row Level Security
ALTER TABLE "waitlist_entries" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "waitlist_entries" FROM anon, authenticated;

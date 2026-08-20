-- ===========================================================================
-- Grenor - Row Level Security (camada 2 da Secao 3 do CLAUDE.md)
-- ===========================================================================
--
-- Modelo de acesso:
--
--  * A aplicacao acessa o banco via Prisma com a conexao do role `postgres`,
--    que e o dono das tabelas. Donos de tabela NAO passam por RLS (nao usamos
--    FORCE ROW LEVEL SECURITY justamente por isso). O isolamento por tenant no
--    caminho da aplicacao e garantido pelos helpers de autorizacao
--    (camada 1: getWorkspaceOrThrow / assertCompanyInWorkspace).
--
--  * A superficie realmente exposta na internet e a API PostgREST do Supabase,
--    acessada com a anon key / access token do usuario. Contra ela aplicamos
--    duas defesas:
--      1. REVOKE de todos os privilegios de `anon` e `authenticated` nas
--         tabelas de dados financeiros: a anon key nao enxerga nada.
--      2. RLS habilitado com policies por workspace: mesmo que um GRANT seja
--         concedido por engano no futuro, o usuario so alcanca as linhas do
--         proprio workspace.
--
-- ---------------------------------------------------------------------------
-- Funcoes auxiliares (SECURITY DEFINER para nao recursionar nas policies)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grenor_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT wm.workspace_id
  FROM public.workspace_members wm
  WHERE wm.user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.grenor_workspace_ids() IS
  'Workspaces do usuario autenticado. SECURITY DEFINER para evitar recursao de RLS em workspace_members.';

CREATE OR REPLACE FUNCTION public.grenor_company_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id
  FROM public.companies c
  WHERE c.workspace_id IN (SELECT public.grenor_workspace_ids());
$$;

CREATE OR REPLACE FUNCTION public.grenor_account_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id
  FROM public.bank_accounts a
  WHERE a.company_id IN (SELECT public.grenor_company_ids());
$$;

REVOKE ALL ON FUNCTION public.grenor_workspace_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grenor_company_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grenor_account_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grenor_workspace_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grenor_company_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grenor_account_ids() TO authenticated;

-- ---------------------------------------------------------------------------
-- Habilitar RLS em TODAS as tabelas de dados
-- ---------------------------------------------------------------------------

ALTER TABLE "workspaces"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_accounts"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_batches"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "category_rules"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "periods"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reports"           ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Nenhum acesso direto pela API publica do Supabase
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE "workspaces"        FROM anon, authenticated;
REVOKE ALL ON TABLE "workspace_members" FROM anon, authenticated;
REVOKE ALL ON TABLE "companies"         FROM anon, authenticated;
REVOKE ALL ON TABLE "bank_accounts"     FROM anon, authenticated;
REVOKE ALL ON TABLE "import_batches"    FROM anon, authenticated;
REVOKE ALL ON TABLE "transactions"      FROM anon, authenticated;
REVOKE ALL ON TABLE "categories"        FROM anon, authenticated;
REVOKE ALL ON TABLE "category_rules"    FROM anon, authenticated;
REVOKE ALL ON TABLE "periods"           FROM anon, authenticated;
REVOKE ALL ON TABLE "reports"           FROM anon, authenticated;

-- Tabelas futuras tambem nascem sem privilegios para anon/authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies por workspace (defesa em profundidade)
-- ---------------------------------------------------------------------------

CREATE POLICY "workspaces_tenant" ON "workspaces"
  FOR ALL TO authenticated
  USING (id IN (SELECT public.grenor_workspace_ids()))
  WITH CHECK (id IN (SELECT public.grenor_workspace_ids()));

CREATE POLICY "workspace_members_tenant" ON "workspace_members"
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT public.grenor_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.grenor_workspace_ids()));

CREATE POLICY "companies_tenant" ON "companies"
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT public.grenor_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.grenor_workspace_ids()));

CREATE POLICY "bank_accounts_tenant" ON "bank_accounts"
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.grenor_company_ids()))
  WITH CHECK (company_id IN (SELECT public.grenor_company_ids()));

CREATE POLICY "import_batches_tenant" ON "import_batches"
  FOR ALL TO authenticated
  USING (account_id IN (SELECT public.grenor_account_ids()))
  WITH CHECK (account_id IN (SELECT public.grenor_account_ids()));

CREATE POLICY "transactions_tenant" ON "transactions"
  FOR ALL TO authenticated
  USING (account_id IN (SELECT public.grenor_account_ids()))
  WITH CHECK (account_id IN (SELECT public.grenor_account_ids()));

-- Categorias padrao do sistema (workspace_id NULL) sao legiveis por qualquer
-- usuario autenticado, mas so o workspace dono escreve nas suas.
CREATE POLICY "categories_read" ON "categories"
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR workspace_id IN (SELECT public.grenor_workspace_ids()));

CREATE POLICY "categories_write" ON "categories"
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT public.grenor_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.grenor_workspace_ids()));

CREATE POLICY "category_rules_tenant" ON "category_rules"
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT public.grenor_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.grenor_workspace_ids()));

CREATE POLICY "periods_tenant" ON "periods"
  FOR ALL TO authenticated
  USING (company_id IN (SELECT public.grenor_company_ids()))
  WITH CHECK (company_id IN (SELECT public.grenor_company_ids()));

CREATE POLICY "reports_tenant" ON "reports"
  FOR ALL TO authenticated
  USING (period_id IN (SELECT p.id FROM public.periods p WHERE p.company_id IN (SELECT public.grenor_company_ids())))
  WITH CHECK (period_id IN (SELECT p.id FROM public.periods p WHERE p.company_id IN (SELECT public.grenor_company_ids())));

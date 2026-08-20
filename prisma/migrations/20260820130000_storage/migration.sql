-- ===========================================================================
-- Grenor - buckets do Supabase Storage
-- ===========================================================================
--
-- `extratos` guarda o arquivo original de cada importacao. E privado: a
-- aplicacao le e escreve pela service role, no servidor. `anon` e
-- `authenticated` nao recebem nenhuma policy, entao a API publica de Storage
-- nao alcanca esses arquivos - mesmo criterio das tabelas financeiras.
--
-- Caminho: {workspaceId}/{companyId}/{accountId}/{importBatchId}.{ext}
-- O workspace na frente deixa qualquer policy futura por tenant trivial.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('extratos', 'extratos', false, 10485760)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 10485760;

-- `logos` e publico de proposito: as marcas do escritorio e das empresas
-- aparecem no relatorio compartilhado por link, que roda sem sessao.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 2097152,
      allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

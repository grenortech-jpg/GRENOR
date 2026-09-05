-- ===========================================================================
-- Finort - Consentimento LGPD na lista de espera (Fase 10)
-- ===========================================================================
--
-- Guarda QUANDO o visitante marcou a caixa de consentimento. E o registro que
-- a LGPD pede para tratamento baseado em consentimento (art. 7, I; art. 8,
-- par. 1): ha que provar que houve manifestacao livre e informada.
--
-- Nulo so em inscricoes anteriores a esta coluna; o formulario passa a exigir
-- a caixa marcada e a action grava o instante.

ALTER TABLE "waitlist_entries" ADD COLUMN "consent_at" TIMESTAMPTZ(6);

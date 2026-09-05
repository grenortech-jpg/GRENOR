import { normalizeDescription } from "@/lib/import/normalize";

/**
 * Chave da memoria de categorizacao (Fase 11).
 *
 * Parte da normalizacao do dedupe (maiusculas, sem acento, espacos colapsados)
 * e remove o que muda de um lancamento para outro sem mudar o significado:
 * datas, numeros de documento, ids de PIX, competencias. "PIX RECEBIDO 0106"
 * e "PIX RECEBIDO 0206" viram a mesma chave; "SISPAG FOLHA PAGAMENTO 07/2026"
 * vira "SISPAG FOLHA PAGAMENTO".
 *
 * Separada de proposito da normalizacao do dedupeHash, que precisa continuar
 * estavel para nao duplicar lancamento em reimportacao.
 */
export function memoryKey(description: string): string {
  const normalized = normalizeDescription(description);

  const tokens = normalized
    .split(" ")
    .map((token) => token.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, ""))
    .filter((token) => token.length > 0)
    .filter((token) => !isVolatile(token));

  const key = tokens.join(" ").trim();

  // Descricao so de numeros ("12345678") nao pode virar chave vazia, senao
  // toda descricao numerica cairia na mesma memoria.
  return key || normalized;
}

/** Datas, competencias e qualquer token com tres ou mais digitos. */
function isVolatile(token: string): boolean {
  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(token)) return true;
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(token)) return true;
  const digits = token.replace(/\D/g, "").length;
  return digits >= 3;
}

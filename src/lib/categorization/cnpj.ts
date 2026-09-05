/**
 * Extracao de CNPJ da descricao do lancamento (Fase 11).
 *
 * PIX, TED e boleto costumam trazer o CNPJ da contraparte na descricao, com
 * ou sem pontuacao. Todo candidato passa pelos digitos verificadores: um
 * numero de documento de 14 digitos nao e CNPJ, e um falso positivo aqui
 * viraria consulta a API e categoria errada.
 */

const CANDIDATE = /\b(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})\b/g;

/** Primeiro CNPJ valido da descricao, com 14 digitos, ou null. */
export function extractCnpj(description: string): string | null {
  for (const match of description.matchAll(CANDIDATE)) {
    const digits = match.slice(1).join("");
    if (isValidCnpj(digits)) return digits;
  }
  return null;
}

/** Digitos verificadores (modulo 11) e rejeicao de sequencias repetidas. */
export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const check = (length: number) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce(
      (total, weight, index) => total + Number(digits[index]) * weight,
      0,
    );
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return check(12) === Number(digits[12]) && check(13) === Number(digits[13]);
}

/** "12345678000190" -> "12.345.678/0001-90", para exibicao. */
export function formatCnpj(digits: string): string {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

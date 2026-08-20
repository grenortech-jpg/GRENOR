/**
 * Slug do workspace: usado na URL publica e como identificador legivel.
 */

const RESERVED = new Set([
  "app",
  "api",
  "auth",
  "login",
  "cadastro",
  "onboarding",
  "configuracoes",
  "empresas",
  "r",
  "admin",
  "grenor",
]);

/** "Contabilidade Água & Cia" -> "contabilidade-agua-cia". */
export function slugify(value: string): string {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");

  return base || "workspace";
}

/**
 * Slug unico dentro do conjunto ja usado. Reservados e colisoes ganham
 * sufixo numerico.
 */
export function uniqueSlug(value: string, taken: Set<string>): string {
  const base = slugify(value);
  const isFree = (candidate: string) =>
    !taken.has(candidate) && !RESERVED.has(candidate);

  if (isFree(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (isFree(candidate)) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

export function isReservedSlug(value: string): boolean {
  return RESERVED.has(value);
}

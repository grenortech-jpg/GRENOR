import { z } from "zod";

import { isValidCnpj, normalizeCnpj, parseCivilDate, parseMoneyToCents } from "@/lib/format";

/**
 * Schemas dos formularios de workspace, empresa e conta bancaria.
 *
 * Ficam fora das Server Actions para serem testados sem subir o Next, e
 * porque a mesma validacao e reaproveitada pelo wizard de onboarding.
 *
 * FormData.get() devolve null para campo ausente: leia sempre por field().
 */

export function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function requiredField(formData: FormData, name: string): string {
  return field(formData, name) ?? "";
}

/** Campo opcional: "" vira undefined para nao gravar string vazia no banco. */
function optionalField(formData: FormData, name: string): string | undefined {
  const value = field(formData, name)?.trim();
  return value ? value : undefined;
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export const workspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do escritório.")
    .max(80, "Nome muito longo (máximo 80 caracteres)."),
});

export function parseWorkspace(formData: FormData) {
  return workspaceSchema.safeParse({ name: requiredField(formData, "name") });
}

// ---------------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------------

const cnpjSchema = z
  .string()
  .optional()
  .refine((value) => !value || isValidCnpj(value), "CNPJ inválido.")
  .transform((value) => (value ? normalizeCnpj(value) : undefined));

export const companySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da empresa.")
    .max(120, "Nome muito longo (máximo 120 caracteres)."),
  cnpj: cnpjSchema,
  segment: z
    .string()
    .trim()
    .max(80, "Segmento muito longo (máximo 80 caracteres).")
    .optional(),
});

export function parseCompany(formData: FormData) {
  return companySchema.safeParse({
    name: requiredField(formData, "name"),
    cnpj: optionalField(formData, "cnpj"),
    segment: optionalField(formData, "segment"),
  });
}

// ---------------------------------------------------------------------------
// Conta bancaria
// ---------------------------------------------------------------------------

/**
 * Saldo inicial e data sao obrigatorios (Secao 4): sem eles nao existe saldo
 * consolidado nem evolucao do saldo no relatorio. O saldo pode ser negativo
 * (conta no cheque especial), mas nao pode estar em branco.
 */
const openingBalanceSchema = z
  .string()
  .trim()
  .min(1, "Informe o saldo inicial.")
  .transform((value, ctx) => {
    const cents = parseMoneyToCents(value);
    if (cents === null) {
      ctx.addIssue({
        code: "custom",
        message: "Saldo inicial inválido. Use o formato 1.234,56.",
      });
      return z.NEVER;
    }
    return cents;
  });

const civilDateSchema = z
  .string()
  .trim()
  .min(1, "Informe a data do saldo inicial.")
  .transform((value, ctx) => {
    const date = parseCivilDate(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "Data inválida." });
      return z.NEVER;
    }
    return date;
  });

export const bankAccountSchema = z.object({
  bankName: z
    .string()
    .trim()
    .min(2, "Informe o banco.")
    .max(60, "Nome do banco muito longo."),
  nickname: z
    .string()
    .trim()
    .min(2, "Informe um apelido para a conta.")
    .max(60, "Apelido muito longo."),
  openingBalanceCents: openingBalanceSchema,
  openingBalanceDate: civilDateSchema,
});

export function parseBankAccount(formData: FormData) {
  return bankAccountSchema.safeParse({
    bankName: requiredField(formData, "bankName"),
    nickname: requiredField(formData, "nickname"),
    openingBalanceCents: requiredField(formData, "openingBalanceCents"),
    openingBalanceDate: requiredField(formData, "openingBalanceDate"),
  });
}

// ---------------------------------------------------------------------------
// Identificadores
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid("Identificador inválido.");

export function parseId(formData: FormData, name = "id") {
  return uuidSchema.safeParse(requiredField(formData, name));
}

// ---------------------------------------------------------------------------
// Lista de espera (Fase 8)
// ---------------------------------------------------------------------------

/**
 * Formulario publico da landing.
 *
 * So o e-mail e obrigatorio: cada campo a mais numa lista de espera derruba a
 * conversao, e nome e escritorio sao perguntas que a conversa comercial faz
 * melhor do que um formulario.
 */
export const waitlistSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Informe o e-mail.")
    .email("E-mail inválido.")
    .max(160, "E-mail muito longo."),
  name: z
    .string()
    .trim()
    .max(120, "Nome muito longo (máximo 120 caracteres).")
    .optional(),
  office: z
    .string()
    .trim()
    .max(120, "Nome do escritório muito longo (máximo 120 caracteres).")
    .optional(),
  // Caixa marcada = "on". Consentimento e a base legal do tratamento (LGPD,
  // art. 7, I): sem ele nada e gravado.
  consent: z.literal("on", {
    error: "É preciso aceitar o aviso de privacidade para entrar na lista.",
  }),
});

export function parseWaitlist(formData: FormData) {
  return waitlistSchema.safeParse({
    email: requiredField(formData, "email"),
    name: optionalField(formData, "name"),
    office: optionalField(formData, "office"),
    consent: field(formData, "consent"),
  });
}

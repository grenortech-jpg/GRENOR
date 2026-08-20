import { z } from "zod";

/**
 * Schemas dos formularios de autenticacao.
 *
 * Vivem fora das Server Actions para poderem ser testados sem subir o Next.
 *
 * Cuidado com FormData: `get()` devolve `null` para campo ausente, e `null`
 * NAO satisfaz `z.string().optional()` (que aceita apenas `undefined`). Ler
 * sempre por `field()` evita que um campo opcional ausente derrube a validacao
 * do formulario inteiro.
 */

/** Le um campo de texto do FormData. Ausente ou arquivo -> undefined. */
export function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

/** Idem, mas com "" no lugar de undefined: deixa o `.min(1)` dar a mensagem. */
function requiredField(formData: FormData, name: string): string {
  return field(formData, name) ?? "";
}

const emailSchema = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .email("E-mail inválido.");

const passwordSchema = z
  .string()
  .min(8, "A senha precisa ter ao menos 8 caracteres.");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha."),
  redirect: z.string().optional(),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome."),
  email: emailSchema,
  password: passwordSchema,
});

export const resetRequestSchema = z.object({ email: emailSchema });

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "As senhas não conferem.",
    path: ["passwordConfirmation"],
  });

export function parseSignIn(formData: FormData) {
  return signInSchema.safeParse({
    email: requiredField(formData, "email"),
    password: requiredField(formData, "password"),
    redirect: field(formData, "redirect"),
  });
}

export function parseSignUp(formData: FormData) {
  return signUpSchema.safeParse({
    name: requiredField(formData, "name"),
    email: requiredField(formData, "email"),
    password: requiredField(formData, "password"),
  });
}

export function parseResetRequest(formData: FormData) {
  return resetRequestSchema.safeParse({
    email: requiredField(formData, "email"),
  });
}

export function parseNewPassword(formData: FormData) {
  return newPasswordSchema.safeParse({
    password: requiredField(formData, "password"),
    passwordConfirmation: requiredField(formData, "passwordConfirmation"),
  });
}

/** Primeira mensagem de erro do Zod, para exibir no formulario. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

/** Aceita apenas caminhos internos: barra a volta para um destino externo. */
export function safeRedirect(target: string | undefined, fallback: string) {
  if (!target) return fallback;
  if (!target.startsWith("/")) return fallback;
  // "//host" e "/\host" viram URL absoluta no navegador.
  if (target.startsWith("//") || target.startsWith("/\\")) return fallback;
  return target;
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isSupabaseConfigured } from "@/lib/env";
import { getSiteUrl } from "@/lib/site-url";
import { isOAuthProviderEnabled } from "@/lib/supabase/auth-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  success?: string;
};

const emailSchema = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .email("E-mail inválido.");

const passwordSchema = z
  .string()
  .min(8, "A senha precisa ter ao menos 8 caracteres.");

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha."),
  redirect: z.string().optional(),
});

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome."),
  email: emailSchema,
  password: passwordSchema,
});

const resetRequestSchema = z.object({ email: emailSchema });

const newPasswordSchema = z
  .object({
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "As senhas não conferem.",
    path: ["passwordConfirmation"],
  });

/** Primeira mensagem de erro do Zod, para exibir no formulario. */
function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

/**
 * Traduz os erros do Supabase Auth para o usuario, sempre registrando o erro
 * original no log do servidor: sem isso uma falha vira uma mensagem generica
 * impossivel de diagnosticar.
 */
function translateAuthError(context: string, message: string): string {
  console.error(`[auth:${context}] ${message}`);

  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  }
  if (normalized.includes("user already registered")) {
    return "Já existe uma conta com este e-mail.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }
  if (
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("getaddrinfo") ||
    normalized.includes("enotfound") ||
    normalized.includes("econnrefused") ||
    normalized.includes("network")
  ) {
    return "Não foi possível falar com o Supabase. Verifique NEXT_PUBLIC_SUPABASE_URL e a sua conexão.";
  }

  return "Não foi possível concluir. Tente novamente em instantes.";
}

/** Barra a operacao quando o .env ainda esta com os valores de exemplo. */
function configurationError(): AuthFormState | null {
  if (isSupabaseConfigured()) return null;
  return {
    error:
      "Supabase não configurado. Preencha o .env com as chaves do seu projeto (veja o README) e reinicie o servidor.",
  };
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const misconfigured = configurationError();
  if (misconfigured) return misconfigured;

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirect: formData.get("redirect"),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { error: translateAuthError("signIn", error.message) };

  const target = parsed.data.redirect;
  redirect(target && target.startsWith("/") ? target : "/app");
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const misconfigured = configurationError();
  if (misconfigured) return misconfigured;

  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const siteUrl = await getSiteUrl();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name },
      emailRedirectTo: `${siteUrl}/auth/confirmar?next=/onboarding`,
    },
  });

  if (error) return { error: translateAuthError("signUp", error.message) };

  // Com confirmacao de e-mail ligada no Supabase nao ha sessao ainda.
  if (!data.session) {
    return {
      success:
        "Conta criada. Enviamos um link de confirmação para o seu e-mail.",
    };
  }

  redirect("/onboarding");
}

export async function requestPasswordResetAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const misconfigured = configurationError();
  if (misconfigured) return misconfigured;

  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const siteUrl = await getSiteUrl();

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/confirmar?next=/nova-senha`,
  });

  // Resposta identica exista ou nao a conta: nao revelamos cadastro.
  return {
    success:
      "Se houver uma conta com este e-mail, o link de recuperação chegará em instantes.",
  };
}

export async function updatePasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const misconfigured = configurationError();
  if (misconfigured) return misconfigured;

  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Link expirado. Peça uma nova recuperação de senha.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) return { error: translateAuthError("updatePassword", error.message) };

  redirect("/app");
}

export async function signInWithGoogleAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/login?erro=config");
  }

  // signInWithOAuth apenas monta a URL de autorizacao; com o provider
  // desligado o erro so apareceria no Supabase, como JSON cru.
  if (!(await isOAuthProviderEnabled("google"))) {
    redirect("/login?erro=google");
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl = await getSiteUrl();

  const target = formData.get("redirect");
  const next =
    typeof target === "string" && target.startsWith("/") ? target : "/app";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect("/login?erro=google");
  }

  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

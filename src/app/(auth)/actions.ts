"use server";

import { redirect } from "next/navigation";
import {
  field,
  firstIssue,
  parseNewPassword,
  parseResetRequest,
  parseSignIn,
  parseSignUp,
  safeRedirect,
} from "@/lib/auth/forms";
import { isSupabaseConfigured } from "@/lib/env";
import { getSiteUrl } from "@/lib/site-url";
import { isOAuthProviderEnabled } from "@/lib/supabase/auth-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  success?: string;
};

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

  const parsed = parseSignIn(formData);

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { error: translateAuthError("signIn", error.message) };

  redirect(safeRedirect(parsed.data.redirect, "/app"));
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const misconfigured = configurationError();
  if (misconfigured) return misconfigured;

  const parsed = parseSignUp(formData);

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

  const parsed = parseResetRequest(formData);
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

  const parsed = parseNewPassword(formData);

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

  const next = safeRedirect(field(formData, "redirect"), "/app");

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

import type { Metadata } from "next";
import Link from "next/link";

import { FormFeedback } from "@/components/forms/form-feedback";
import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Entrar" };

const ERROR_MESSAGES: Record<string, string> = {
  auth: "Não foi possível concluir a autenticação. Tente novamente.",
  google:
    "Entrada com Google indisponível: o provider não está habilitado no Supabase.",
  link: "Este link expirou ou já foi usado. Peça um novo.",
  config:
    "Supabase não configurado. Preencha o .env com as chaves do seu projeto (veja o README) e reinicie o servidor.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const redirectTo = typeof params.redirect === "string" ? params.redirect : undefined;
  const errorCode = typeof params.erro === "string" ? params.erro : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>
          Acesse o painel do seu escritório.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {errorCode && (
          <FormFeedback
            state={{ error: ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.auth }}
          />
        )}

        <LoginForm redirectTo={redirectTo} />

        <GoogleButton redirectTo={redirectTo} />

        <p className="text-center text-sm text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link
            href="/cadastro"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Criar conta
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

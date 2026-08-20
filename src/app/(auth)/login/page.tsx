import type { Metadata } from "next";
import Link from "next/link";

import { FormFeedback } from "@/components/auth/form-feedback";
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
  google: "Falha ao conectar com o Google. Tente novamente.",
  link: "Este link expirou ou já foi usado. Peça um novo.",
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

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          ou
          <span className="h-px flex-1 bg-border" />
        </div>

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

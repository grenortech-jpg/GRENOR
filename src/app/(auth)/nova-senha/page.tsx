import type { Metadata } from "next";

import { NewPasswordForm } from "@/components/auth/new-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nova senha" };

/**
 * Alcancada pelo link de recuperacao, que ja abriu a sessao em
 * /auth/confirmar. Sem sessao, requireUser manda de volta para o login.
 */
export default async function NewPasswordPage() {
  await requireUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Definir nova senha</CardTitle>
        <CardDescription>
          Escolha uma senha que você não use em outros serviços.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <NewPasswordForm />
      </CardContent>
    </Card>
  );
}

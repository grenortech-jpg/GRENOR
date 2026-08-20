import type { Metadata } from "next";
import Link from "next/link";

import { ResetRequestForm } from "@/components/auth/reset-request-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>
          Enviaremos um link para você definir uma nova senha.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <ResetRequestForm />

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Voltar para o login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

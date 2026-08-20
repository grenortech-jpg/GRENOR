import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Primeiros passos" };

/** Placeholder. O wizard completo e entregue na Fase 1. */
export default async function OnboardingPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Bem-vindo ao Grenor</CardTitle>
          <CardDescription>
            Sua conta está pronta. O assistente de configuração (workspace,
            primeira empresa, primeira conta e primeiro extrato) chega na Fase 1.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/app" className={buttonVariants()}>
            Ir para o painel
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

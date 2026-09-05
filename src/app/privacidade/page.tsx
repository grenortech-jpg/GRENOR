import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Aviso de privacidade",
  robots: { index: false },
};

/**
 * Aviso de privacidade da lista de espera (Fase 10).
 *
 * Existe para dar base ao consentimento pedido no formulario publico: a LGPD
 * exige que o titular saiba o que e coletado, para que, por quanto tempo e
 * como pedir exclusao. Texto curto de proposito - quem le e um visitante, nao
 * um advogado.
 */
export default function PrivacyPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-6">
        <Link href="/" className="inline-flex" aria-label="Início">
          <Logo />
        </Link>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Voltar
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16">
        <h1 className="text-3xl font-semibold tracking-tight text-brand">
          Aviso de privacidade
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Lista de espera do Finort · atualizado em setembro de 2026
        </p>

        <div className="mt-8 space-y-6 text-sm leading-6 text-foreground/90">
          <Section title="Quem trata os dados">
            A Grenor, responsável pelo produto Finort, é a controladora dos
            dados informados na lista de espera.
          </Section>

          <Section title="O que coletamos">
            Somente o que você digita no formulário: e-mail (obrigatório), nome
            e nome do escritório (opcionais), além da data e hora em que marcou
            a caixa de consentimento.
          </Section>

          <Section title="Para que usamos">
            Para avisar sobre a abertura de vagas e o lançamento do Finort, e
            para conversar com você sobre a implantação, se houver interesse.
            Não vendemos nem compartilhamos esses dados com terceiros para
            outros fins.
          </Section>

          <Section title="Base legal">
            Consentimento (Lei 13.709/2018, art. 7º, I), dado ao marcar a caixa
            do formulário. Você pode revogá-lo a qualquer momento.
          </Section>

          <Section title="Onde ficam">
            Em banco de dados hospedado na Supabase e aplicação hospedada na
            Vercel, que atuam como operadoras, com acesso restrito à equipe da
            Grenor.
          </Section>

          <Section title="Por quanto tempo">
            Até o lançamento do produto ou até você pedir a exclusão, o que
            vier primeiro.
          </Section>

          <Section title="Seus direitos">
            Acesso, correção, exclusão e revogação do consentimento, a qualquer
            momento. Escreva para{" "}
            <a
              href="mailto:grenor.tech@gmail.com"
              className="underline underline-offset-4"
            >
              grenor.tech@gmail.com
            </a>{" "}
            informando o e-mail cadastrado.
          </Section>

          <Section title="Cookies">
            A página pública não usa cookies de rastreamento. A área logada usa
            apenas o cookie de sessão necessário ao login.
          </Section>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-6 pb-8 text-sm text-muted-foreground">
        Finort · by Grenor
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-medium text-foreground">{title}</h2>
      <p className="mt-1">{children}</p>
    </section>
  );
}

import Link from "next/link";

import { SetupNotice } from "@/components/auth/setup-notice";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="px-6 py-6">
        <Link href="/" className="inline-flex" aria-label="Início">
          <Logo />
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <SetupNotice />
          {children}
        </div>
      </main>

      <footer className="px-6 pb-8 text-center text-xs text-muted-foreground">
        Grenor · relatórios financeiros executivos
      </footer>
    </div>
  );
}

import Link from "next/link";

import { MainNav } from "@/components/app/main-nav";
import { UserMenu } from "@/components/app/user-menu";
import { Logo } from "@/components/brand/logo";
import { displayName, requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-6">
          <Link href="/app" className="shrink-0" aria-label="Início">
            <Logo />
          </Link>

          <div className="hidden flex-1 md:block">
            <MainNav />
          </div>

          <div className="ml-auto md:ml-0">
            <UserMenu
              name={displayName(user)}
              email={user.email ?? ""}
            />
          </div>
        </div>

        <div className="border-t px-6 py-2 md:hidden">
          <MainNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}

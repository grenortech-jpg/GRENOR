"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AccountFilterOption = { id: string; label: string };

/**
 * Filtros da conciliacao (Secao 9): sem categoria, conta e texto.
 *
 * Tudo na URL: a lista e renderizada no servidor, o estado sobrevive ao
 * recarregar e o link pode ser passado adiante.
 */
export function ReconciliationFilters({
  accounts,
  pendingCount,
  totalCount,
}: {
  accounts: AccountFilterOption[];
  pendingCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const onlyPending = searchParams.get("filtro") === "sem-categoria";
  const account = searchParams.get("conta") ?? "";
  const [search, setSearch] = useState(searchParams.get("busca") ?? "");
  const firstRender = useRef(true);

  const update = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => {
      router.replace(`${pathname}?${params}`, { scroll: false });
    });
  };

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      update({ busca: search.trim() || null });
    }, 250);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-md border p-0.5">
        <button
          type="button"
          onClick={() => update({ filtro: null })}
          className={cn(
            "rounded px-3 py-1.5 text-sm font-medium transition-colors",
            !onlyPending
              ? "bg-brand text-brand-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Todos ({totalCount})
        </button>
        <button
          type="button"
          onClick={() => update({ filtro: "sem-categoria" })}
          className={cn(
            "rounded px-3 py-1.5 text-sm font-medium transition-colors",
            onlyPending
              ? "bg-brand text-brand-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Sem categoria ({pendingCount})
        </button>
      </div>

      {accounts.length > 1 && (
        <select
          value={account}
          onChange={(event) => update({ conta: event.target.value || null })}
          aria-label="Filtrar por conta"
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Todas as contas</option>
          {accounts.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      <div className="relative w-full sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar na descrição"
          aria-label="Buscar lançamento"
          className="pl-9 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

import { TriangleAlert } from "lucide-react";

import { isSupabaseConfigured } from "@/lib/env";

/**
 * Aviso de instalacao incompleta. Aparece apenas fora de producao e some
 * sozinho assim que o .env recebe as chaves reais do Supabase.
 */
export function SetupNotice() {
  if (process.env.NODE_ENV === "production" || isSupabaseConfigured()) {
    return null;
  }

  return (
    <div className="mb-4 rounded-md border border-gold/40 bg-gold/10 p-3 text-sm">
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlert
          className="mt-0.5 size-4 shrink-0 text-gold"
          aria-hidden="true"
        />
        Supabase ainda não configurado
      </p>
      <p className="mt-1.5 pl-6 text-muted-foreground">
        O <code className="font-mono text-xs">.env</code> está com os valores de
        exemplo, então login e cadastro não funcionam. Preencha as chaves do seu
        projeto (passo a passo no README) e reinicie o servidor.
      </p>
    </div>
  );
}

import { z } from "zod";

/**
 * Validacao das variaveis de ambiente do servidor.
 *
 * Nao importe este modulo em Client Components: ele le segredos.
 * Para o browser use `publicEnv`.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL e obrigatoria"),
  DIRECT_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL invalida"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Le e valida o ambiente sob demanda. Falhar aqui e proposital: e melhor a
 * aplicacao nao subir do que subir sem conseguir falar com o banco.
 */
export function env(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_ENABLED: process.env.AI_ENABLED,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Variaveis de ambiente invalidas. Confira o .env.example:\n${details}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * Variaveis seguras para o browser. Sao inlined pelo Next no build, por isso
 * precisam ser lidas como literais `process.env.NEXT_PUBLIC_*`.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

/** Feature-flag da Secao 8.3: a aplicacao funciona 100% sem IA. */
export function isAiEnabled(): boolean {
  return process.env.AI_ENABLED === "true" && Boolean(process.env.ANTHROPIC_API_KEY);
}

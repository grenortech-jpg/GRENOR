# Grenor

Extratos bancários viram relatórios financeiros executivos em minutos.

A especificação completa do produto está em [CLAUDE.md](CLAUDE.md). Este arquivo
cobre apenas como colocar o projeto para rodar.

## Requisitos

- Node.js 20.9+ (testado com 24)
- Uma conta no [Supabase](https://supabase.com)

## Configuração

### 1. Dependências

```bash
npm install
```

### 2. Projeto no Supabase

Crie um projeto e anote, em **Project Settings**:

- **API** → `Project URL` e `anon public` e `service_role`
- **Database → Connection string** → as strings do *Transaction pooler* (porta 6543)
  e da *conexão direta* / *Session pooler* (porta 5432)

### 3. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha:

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave privilegiada (só no servidor) |
| `DATABASE_URL` | Pooler, porta 6543 — runtime da aplicação |
| `DIRECT_URL` | Conexão direta, porta 5432 — CLI do Prisma |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` em desenvolvimento |
| `AI_ENABLED` / `ANTHROPIC_API_KEY` | Opcionais: a aplicação funciona sem IA |

Confira a qualquer momento se está tudo no lugar:

```bash
npm run doctor
```

### 4. Banco de dados

```bash
npm run db:setup   # migrações + client + seed do plano de contas
```

Isso aplica duas migrações: o schema completo e o Row Level Security
(policies por workspace e revogação de acesso da anon key às tabelas
financeiras).

### 5. Autenticação

No painel do Supabase, em **Authentication**:

- **URL Configuration** → *Site URL*: `http://localhost:3000`.
  Em *Redirect URLs*, adicione `http://localhost:3000/auth/callback` e
  `http://localhost:3000/auth/confirmar`.
- **Providers → Google** (opcional): habilite e informe Client ID e Secret do
  Google Cloud Console. A URL de callback é a que o próprio Supabase exibe.
- **Providers → Email**: em desenvolvimento, desligar *Confirm email* evita ter
  que abrir o e-mail a cada cadastro de teste.

### 6. Rodar

```bash
npm run dev
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run typecheck` | Checagem de tipos |
| `npm run lint` | ESLint |
| `npm test` | Testes (Vitest) |
| `npm run db:migrate` | Cria uma nova migração a partir do schema |
| `npm run db:deploy` | Aplica migrações pendentes |
| `npm run db:seed` | Semeia o plano de contas padrão |
| `npm run db:studio` | Prisma Studio |
| `npm run doctor` | Diagnostica `.env`, Supabase, banco, seed e RLS |

## Deploy

Vercel (aplicação) + Supabase (dados). Configure as mesmas variáveis de
ambiente no projeto da Vercel e aponte `NEXT_PUBLIC_SITE_URL` para o domínio de
produção — os redirects de autenticação dependem dele.

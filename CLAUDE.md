@AGENTS.md

# GRENOR - Especificacao Tecnica do MVP (v2)

> Documento mestre para desenvolvimento assistido por IA (Claude Code).
> Construa o sistema fase por fase, na ordem definida na Secao 10. Nao pule fases.
> O estado atual da construcao esta na Secao 13.

---

## 1. Visao do Produto

**Grenor** e uma plataforma SaaS que transforma extratos bancarios em relatorios financeiros executivos automaticamente.

**Fluxo central:** o usuario sobe o extrato (OFX, CSV ou XLSX) -> o sistema categoriza as transacoes -> monta a DRE de caixa do periodo -> gera um relatorio executivo em PDF com identidade visual, graficos, comparativos e um parecer escrito por IA.

**Promessa:** o fechamento mensal que levava 5 horas passa a levar 5 minutos.

**Cliente-alvo primario:** escritorios de contabilidade e BPOs financeiros que atendem multiplas empresas (multiplos CNPJs). Cliente secundario: pequenas empresas fazendo a propria gestao.

**Moeda e idioma:** BRL somente. Interface 100% em portugues do Brasil.

**Modelo de negocio:** assinatura mensal por escritorio, com limite de empresas por plano. Billing automatizado fica fora do MVP (contratos manuais com os primeiros clientes).

---

## 2. Stack Tecnologica (obrigatoria)

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Framework | Next.js 15+ (App Router) + TypeScript | Full-stack unificado, deploy simples |
| UI | Tailwind CSS + shadcn/ui | Velocidade e consistencia visual |
| Banco | PostgreSQL (Supabase) | Relacional, maduro, plano gratuito |
| ORM | Prisma | Type-safety, migracoes versionadas |
| Auth | Supabase Auth (email/senha + Google) | Pronto, seguro, integrado ao banco |
| Storage | Supabase Storage | Arquivos de extrato e PDFs gerados |
| PDF | playwright-core + @sparticuz/chromium | Chromium serverless-ready (Playwright completo NAO roda na Vercel) |
| Graficos | Recharts (telas) + SVG estatico no PDF | Consistencia entre tela e relatorio |
| IA | API Anthropic (claude-sonnet) | Categorizacao assistida e parecer executivo |
| Parsing | ofx-js (OFX), papaparse (CSV), SheetJS (XLSX) | Formatos de extrato dominantes |
| Validacao | Zod | Validacao de entrada em todas as rotas |
| Deploy | Vercel (app) + Supabase (dados) | Zero infra propria no MVP |

**Regras transversais:**
- Valores monetarios SEMPRE em centavos (integer). Nunca float para dinheiro.
- Timezone padrao: America/Sao_Paulo. Datas de transacao sao datas civis (sem hora).
- Todo texto de interface em portugues do Brasil. Codigo, variaveis e comentarios em ingles.
- LGPD basica: dados financeiros isolados por tenant, sem uso cruzado, exclusao completa ao apagar empresa.

**Operacoes longas (PDF e IA em lote):** executar em Route Handlers com `runtime = "nodejs"` e `maxDuration = 60`. Se uma operacao estourar 60s, dividir em chamadas menores acionadas em sequencia pelo cliente (sem fila externa no MVP).

---

## 3. Seguranca Multi-Tenant (duas camadas obrigatorias)

Vazamento de dados entre clientes e o pior defeito possivel neste produto. Defesa em profundidade:

1. **Camada de aplicacao:** toda query passa por helpers centralizados (`getWorkspaceOrThrow`, `assertCompanyInWorkspace`) que validam o pertencimento do recurso ao workspace do usuario autenticado ANTES de qualquer operacao. Nenhuma rota acessa Prisma diretamente sem passar pelo helper.
2. **Camada de banco:** Row Level Security (RLS) ativado em TODAS as tabelas do Supabase com policies por workspace. O acesso da aplicacao usa service role apenas em codigo server-side; a anon key nunca acessa tabelas de dados financeiros diretamente.

Teste obrigatorio: suite que tenta acessar recursos de outro workspace e espera 404/403 em todas as rotas.

> Implementacao: ver `prisma/migrations/20260820120100_rls/migration.sql`. A aplicacao
> conecta como dono das tabelas (nao passa por RLS, e por isso a camada 1 e
> obrigatoria); `anon` e `authenticated` tem todos os privilegios revogados, de modo
> que a API PostgREST do Supabase nao alcanca nenhuma tabela financeira.

---

## 4. Modelo de Dados (Prisma)

```
Workspace (escritorio/BPO)
- id, name, slug, logoUrl, createdAt
- members: WorkspaceMember[]
- companies: Company[]

WorkspaceMember
- userId (Supabase auth), workspaceId
- role: OWNER | ADMIN | MEMBER

Company (empresa cliente do escritorio)
- id, workspaceId, name, cnpj (opcional), segment
- logoUrl (para o relatorio white-label)
- accounts: BankAccount[]

BankAccount (conta bancaria da empresa)
- id, companyId, bankName, nickname
- openingBalanceCents (int), openingBalanceDate (date)
  - obrigatorios na criacao: sem saldo inicial nao existe "saldo consolidado"
    nem "evolucao do saldo"
- transactions: Transaction[]

ImportBatch (cada upload de arquivo)
- id, accountId, fileName, fileType (OFX|CSV|XLSX)
- status: PENDING | PARSED | CONFIRMED | FAILED
- rowsTotal, rowsImported, rowsDuplicated
- createdAt, confirmedAt

Transaction
- id, accountId, importBatchId
- date (date), description (raw), amountCents (int, negativo = saida)
- fitId (id do OFX quando existir)
- dedupeHash (sha256 de accountId+date+amountCents+descricaoNormalizada)
- categoryId (nullable), categorizedBy: RULE | AI | MANUAL | NONE
- aiConfidence (float, nullable)

Category (plano de contas gerencial)
- id, workspaceId (null = categoria padrao do sistema)
- name, group (ver Secao 6), sortOrder
- isTransferNeutral (boolean)

CategoryRule (motor de regras do workspace)
- id, workspaceId, categoryId
- matchType: CONTAINS | STARTS_WITH | REGEX
- pattern, priority
- active

Period (mes fechado de uma empresa)
- id, companyId, year, month
- status: OPEN | CLOSED
- closedAt
- report: Report?

Report
- id, periodId, pdfUrl, shareToken (uuid), shareEnabled
- aiSummary (text), generatedAt
- snapshotJson (dados congelados do periodo no momento da geracao)
```

Indices obrigatorios: `Transaction(accountId, date)`, `Transaction(dedupeHash)` unique por conta, `Period(companyId, year, month)` unique.

---

## 5. Regras de Negocio Criticas

### 5.1 Normalizacao de extratos brasileiros (nucleo do produto)
Extratos de bancos brasileiros NAO seguem padrao unico. O pipeline de parsing DEVE tratar:

- **Encoding:** detectar e converter latin-1/windows-1252 para UTF-8 (biblioteca chardet ou similar). OFX de banco brasileiro frequentemente vem em latin-1 com header mentindo.
- **Valores:** aceitar `1.234,56`, `1234,56`, `1234.56`, `-1.234,56`, `1.234,56-`, `R$ 1.234,56` e parenteses para negativo `(1.234,56)`. Converter tudo para centavos integer.
- **Datas:** aceitar `dd/mm/aaaa`, `dd/mm/aa`, `aaaa-mm-dd`, `ddmmaaaa`. Ambiguidade resolve como dd/mm (padrao brasileiro).
- **CSV:** separador pode ser `;` ou `,`. Detectar automaticamente. Linhas de cabecalho e rodape com saldo/totais devem ser ignoradas (heuristica: linha sem data valida nao e transacao).
- **XLSX:** primeira aba por padrao, com seletor de aba no preview. Mesmas regras de valores e datas.
- **OFX:** aceitar OFX 1.x (SGML) e 2.x (XML). Extrair FITID, DTPOSTED, TRNAMT, MEMO/NAME.
- **Descricoes:** normalizar para o dedupeHash (uppercase, remover acentos, colapsar espacos), mas SEMPRE preservar a descricao original para exibicao.

Fixtures de teste obrigatorias: um arquivo real anonimizado de cada formato (OFX 1.x, OFX 2.x, CSV `;`, CSV `,`, XLSX) na pasta `tests/fixtures/`.

### 5.2 Deduplicacao de transacoes
- Com FITID (OFX): chave de dedupe e (accountId, fitId).
- Sem FITID: dedupeHash conforme Secao 4.
- Reimportar o mesmo arquivo NUNCA duplica. Duplicatas sao contadas e exibidas no resumo.

### 5.3 Categorizacao em tres camadas (nesta ordem)
1. **Regras do workspace** (CategoryRule, por prioridade). Custo zero, deterministico.
2. **IA em lote** para o que sobrar: batches de ate 50 transacoes por chamada, prompt da Secao 8.1. Aplicar somente quando confidence >= 0.8; abaixo vira sugestao destacada.
3. **Revisao manual** na tela de conciliacao. Correcao manual oferece "criar regra a partir desta correcao".

### 5.4 Transferencias entre contas
Categoria neutra (isTransferNeutral): fora da DRE e dos totais. Detectar pares automaticamente (mesmo valor, sinais opostos, ate 2 dias de diferenca, contas da mesma empresa) e sugerir vinculo.

### 5.5 Fechamento de periodo
- So fecha com 100% das transacoes categorizadas.
- Fechar congela snapshotJson usado no relatorio; editar depois exige reabrir e regerar.

### 5.6 Limites e controle de custo
- Upload: maximo 10 MB e 10.000 linhas por arquivo. Acima disso, mensagem orientando dividir o periodo.
- IA de categorizacao: maximo 20 batches (1.000 transacoes) por clique; excedente permanece para regras/manual ou novo clique.
- Parecer executivo: maximo 3 regeracoes por periodo (evita loop de custo).
- Toda chamada de IA registra tokens de entrada/saida em log estruturado para acompanhamento de custo.

---

## 6. Plano de Contas Gerencial Padrao (seed)

Grupos da DRE de caixa, nesta ordem de apresentacao:

1. **RECEITAS** - Receita de vendas, Receita de servicos, Outras receitas
2. **(-) IMPOSTOS SOBRE VENDAS** - Simples/DAS, ISS, outros impostos sobre receita
3. **(-) CUSTOS VARIAVEIS** - Fornecedores/CMV, Comissoes, Taxas de meios de pagamento
4. **(-) DESPESAS COM PESSOAL** - Salarios, Pro-labore, Encargos (INSS/FGTS), Beneficios
5. **(-) DESPESAS OPERACIONAIS** - Aluguel e condominio, Energia/agua/internet, Software e tecnologia, Marketing e comercial, Servicos de terceiros (contador, juridico), Despesas administrativas
6. **(-) DESPESAS FINANCEIRAS** - Tarifas bancarias, Juros e multas
7. **RESULTADO OPERACIONAL DE CAIXA** (calculado: 1-2-3-4-5-6)
8. **INVESTIMENTOS** - Equipamentos, Obras e melhorias
9. **MOVIMENTACOES SOCIETARIAS E EMPRESTIMOS** - Aportes de socios, Distribuicao de lucros, Emprestimos captados, Parcelas de emprestimos pagas
10. **GERACAO LIQUIDA DE CAIXA** (calculado: 7-8+9)
11. **TRANSFERENCIAS ENTRE CONTAS** (neutro, fora dos totais)

Workspaces podem renomear e adicionar categorias, nunca excluir os grupos calculados.

Implementacao: `src/lib/categories/default-plan.ts` (fonte unica) + `prisma/seed.ts`.

---

## 7. Relatorio Executivo (o produto final)

Gerado a partir do snapshot do periodo. Estrutura fixa do PDF (A4, retrato):

1. **Capa** - logo da empresa (ou do escritorio), nome da empresa, "Relatorio Financeiro Executivo", mes/ano.
2. **Sumario executivo (IA)** - 3 a 5 paragrafos, tom institucional (Secao 8.2).
3. **Indicadores do mes (cards)** - Entradas totais, Saidas totais, Resultado operacional, Geracao liquida de caixa, Margem operacional (%), Saldo consolidado ao fim do mes (openingBalance + soma das transacoes ate a data).
4. **DRE de caixa** - tabela completa (Secao 6): mes atual, mes anterior, variacao %.
5. **Graficos** - barras (entradas x saidas, ultimos 6 meses), barras horizontais (top 8 categorias de despesa), linha (evolucao do saldo no mes).
6. **Maiores lancamentos** - top 10 saidas e top 10 entradas (data, descricao, categoria, valor).
7. **Rodape** - "Gerado por Grenor" + data de geracao.

**Link compartilhavel:** rota publica `/r/[shareToken]` com o mesmo relatorio em HTML responsivo, somente leitura, sem login, desativavel pelo usuario.

---

## 8. Prompts de IA (templates obrigatorios)

### 8.1 Categorizacao (batch)
System prompt fixo; user message montada por batch. A resposta DEVE ser JSON puro.

```
SYSTEM:
Voce e um classificador de transacoes bancarias de empresas brasileiras.
Responda SOMENTE com JSON valido, sem markdown, sem texto fora do JSON.

USER:
Plano de contas disponivel (id | nome | grupo):
{{lista de categorias do workspace}}

Classifique as transacoes abaixo. Para cada uma retorne:
{"results":[{"txId":"...","categoryId":"...","confidence":0.0}]}
Regras:
- confidence entre 0 e 1; use < 0.8 quando houver duvida real.
- Transferencia entre contas da propria empresa: use a categoria de transferencia.
- PIX/TED recebido de pessoa fisica sem contexto: Receita de vendas com confidence <= 0.7.
- Tarifas, IOF, "MANUT CONTA": Tarifas bancarias.

Transacoes (id | data | valor em BRL | descricao):
{{lote de ate 50 transacoes}}
```

Parsing da resposta com Zod; em caso de JSON invalido, 1 retry com instrucao de correcao; falhou de novo, o batch fica sem categoria (falha silenciosa, nada quebra).

### 8.2 Parecer executivo
```
SYSTEM:
Voce e um analista financeiro senior escrevendo para donos de pequenas
empresas brasileiras. Tom executivo, direto, sem jargao tecnico, sem
emojis, sem listas: apenas paragrafos corridos em portugues do Brasil.
Nunca invente numeros: use somente os dados fornecidos.

USER:
Dados do periodo (JSON): {{snapshotJson}}
Dados do periodo anterior (JSON ou null): {{snapshotAnterior}}

Escreva o sumario executivo do relatorio mensal em 3 a 5 paragrafos:
1) resultado geral do mes; 2) principais variacoes vs. mes anterior e
seus provaveis motivos com base nas categorias; 3) pontos de atencao;
4) uma recomendacao pratica. Maximo 300 palavras.
```

### 8.3 Regras gerais de integracao IA
- SDK oficial da Anthropic, modelo claude-sonnet mais recente.
- Timeout de 30s por chamada; retry unico com backoff.
- A aplicacao funciona 100% sem IA (feature-flag `AI_ENABLED`): sem a flag, camadas 1 e 3 de categorizacao seguem funcionando e o parecer vira campo de texto manual.

---

## 9. Telas do MVP

1. **Auth** - login, cadastro, recuperacao de senha.
2. **Onboarding** - wizard: criar workspace (nome + logo) -> primeira empresa -> primeira conta (com saldo inicial e data) -> importar primeiro extrato.
3. **Dashboard do workspace** - grid de empresas com status do mes (sem dados / em conciliacao / fechado), busca, nova empresa.
4. **Visao da empresa** - resumo do mes, contas, historico de periodos, atalhos.
5. **Importacao** - upload drag-and-drop, deteccao de formato, preview, mapeamento de colunas (CSV/XLSX), resumo de duplicatas, confirmacao.
6. **Conciliacao** - tabela do periodo com filtros (sem categoria, conta, texto), edicao em massa, sugestoes de IA com confidence, criar regra a partir de correcao.
7. **Fechamento e relatorio** - checklist, fechar mes, preview, gerar PDF, link compartilhavel.
8. **Configuracoes** - plano de contas, regras, membros, dados do workspace.

Design: sobrio e executivo. Paleta: azul profundo (#1B2A4A), grafite (#2E3440), dourado discreto (#C9A227), fundos claros. Tipografia: Inter. Sem gradientes chamativos.

---

## 10. Fases de Construcao (ordem obrigatoria)

Cada fase termina com o sistema rodando e testavel. Commits pequenos e frequentes.

**Fase 0 - Fundacao:** scaffold Next.js + TS + Tailwind + shadcn/ui; Prisma + Supabase conectados; schema completo migrado; RLS ativado (Secao 3); Auth funcionando; layout base; seed do plano de contas.

**Fase 1 - Estrutura multiempresa:** CRUD de workspace, empresas e contas (com saldo inicial); helpers de autorizacao; suite de testes de isolamento entre workspaces; onboarding wizard.

**Fase 2 - Importacao:** upload ao Storage; parsers OFX/CSV/XLSX com a normalizacao da Secao 5.1 e fixtures de teste; preview com mapeamento; deduplicacao; ImportBatch e resumo.

**Fase 3 - Categorizacao por regras:** motor de regras; tela de conciliacao completa; edicao em massa; regra a partir de correcao; deteccao de transferencias.

**Fase 4 - Categorizacao por IA:** integracao Anthropic (Secao 8.1); batches; aplicacao por confidence; limites da Secao 5.6; feature-flag; fallback silencioso.

**Fase 5 - DRE e dashboard:** calculo da DRE (Secao 6); cards; graficos; comparativo mes anterior; fechamento com snapshot.

**Fase 6 - Relatorio PDF e link:** template HTML do relatorio; PDF via playwright-core + @sparticuz/chromium em rota nodejs/maxDuration 60; upload ao Storage; rota publica `/r/[shareToken]`.

**Fase 7 - Parecer executivo por IA:** geracao (Secao 8.2); limite de 3 regeracoes; edicao manual antes do PDF final.

**Fase 8 - Polimento de lancamento:** empty/loading/error states; responsivo; seeds de demonstracao (empresa exemplo com 3 meses de dados realistas); pagina publica com lista de espera.

**Fora do MVP (nao construir):** Open Finance, billing automatizado, app mobile, permissoes granulares, white-label completo, exportacao contabil (SPED e afins), filas externas.

---

## 11. Qualidade e Convencoes

- TypeScript strict. Zero `any` sem justificativa comentada.
- Toda rota valida entrada com Zod e autoriza via helpers da Secao 3 antes de qualquer query.
- Server Components por padrao; Client Components apenas quando necessario.
- Testes unitarios obrigatorios (Vitest): parsers e normalizacao (5.1), dedupeHash, motor de regras, calculo da DRE, isolamento multi-tenant.
- `.env.example` documentado: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, ANTHROPIC_API_KEY, AI_ENABLED.
- Nunca commitar segredos; `.env*` no gitignore desde o primeiro commit.
- Commits: conventional commits (feat:, fix:, chore:).

---

## 12. Como usar este documento com o Claude Code

1. Leia este arquivo inteiro antes de escrever codigo.
2. Execute uma fase por vez, na ordem da Secao 10.
3. Ao terminar uma fase, liste o que foi feito e o que testar manualmente antes da proxima.
4. Teste cada fase antes de autorizar a proxima. Nao acumule fases sem testar.
5. Decisoes nao cobertas por este documento: o agente pergunta antes de implementar, propondo a opcao mais simples que atende a Secao 1.

---

## 13. Estado da construcao

**Fase 0 - Fundacao: concluida.**
**Fase 1 - Estrutura multiempresa: concluida.**
Demais fases: pendentes.

### Comandos

| Comando | Uso |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de producao |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Testes unitarios (sem rede) |
| `npm run test:db` | Testes de isolamento multi-tenant (exige banco) |
| `npm run test:all` | Unitarios + integracao |
| `npm run db:deploy` | Aplica as migracoes |
| `npm run db:seed` | Semeia o plano de contas padrao |
| `npm run db:setup` | migrate deploy + generate + seed |
| `npm run db:studio` | Prisma Studio |
| `npm run doctor` | Diagnostica .env, Supabase, banco, seed e RLS |

### Decisoes tecnicas tomadas na Fase 0

Versoes instaladas ficaram acima do previsto na Secao 2. Diferencas que importam:

- **Next.js 16** (a Secao 2 pedia 15+). Consequencias: middleware chama-se `proxy`
  (`src/proxy.ts`), Turbopack e o bundler padrao, `params`/`searchParams`/`cookies()`/
  `headers()` sao assincronos, e os tipos `PageProps<"/rota">` / `LayoutProps<"/rota">`
  sao gerados pelo framework (`npx next typegen`).
  Antes de escrever codigo de framework, leia os docs da versao instalada em
  `node_modules/next/dist/docs/` - e o que o AGENTS.md determina.
- **Prisma 7.** O client e gerado em `src/generated/prisma` (fora do git) e importado
  de `@/generated/prisma/client`. Exige driver adapter: usamos `@prisma/adapter-pg`.
  A configuracao do CLI vive em `prisma.config.ts`, nao mais no schema.
- **Duas URLs de banco.** `DATABASE_URL` (pooler, porta 6543) para o runtime;
  `DIRECT_URL` (conexao direta, porta 5432) para o CLI do Prisma, porque o pooler em
  modo transaction nao executa DDL.
- **Tabelas em snake_case** (`@@map`), para o SQL de RLS ficar legivel.
- **Modelo de RLS** (detalhado no topo de `prisma/migrations/20260820120100_rls/migration.sql`):
  a aplicacao conecta como dona das tabelas e portanto nao passa por RLS - o isolamento
  no caminho da aplicacao e responsabilidade dos helpers da Secao 3. O RLS existe para
  blindar a superficie publica (API PostgREST), onde `anon` e `authenticated` estao com
  todos os privilegios revogados, com policies por workspace como segunda barreira.
- **Acentuacao.** Este documento e os comentarios de codigo seguem sem acentos; todo
  texto visivel ao usuario usa portugues correto, com acentos.
- **Rotas em portugues** para telas (`/cadastro`, `/recuperar-senha`, `/configuracoes`);
  codigo, tipos e nomes de variaveis em ingles.

### Convencoes descobertas na pratica

- **FormData.get() devolve `null`**, e `null` nao satisfaz `z.string().optional()`.
  Leia sempre por `field()` (em `src/lib/auth/forms.ts` e
  `src/lib/validation/schemas.ts`). Um campo opcional ausente ja derrubou o
  login inteiro uma vez.
- **Dinheiro em centavos, sempre.** `parseMoneyToCents` aceita todos os formatos
  da Secao 5.1; `formatMoney`/`formatAmount` sao o caminho de volta. Nunca
  construa valor monetario com aritmetica de ponto flutuante.
- **Datas civis em UTC meia-noite.** `parseCivilDate` e `formatDate` cuidam
  disso; formatar em fuso local produz "um dia a menos".
- **Mes de competencia vem de `currentMonth()`**, que resolve em
  America/Sao_Paulo, nao no fuso do servidor.
- **Toda leitura de recurso por id do cliente passa por um `assert*InWorkspace`**
  (`src/lib/auth/workspace.ts`). Recurso alheio responde 404, nunca 403.
- **`server-only` quebra fora do bundler do Next.** Testes de integracao usam o
  stub em `tests/integration/server-only-stub.ts`.

### Estrutura

```
prisma/
  migrations/20260820120000_init/     schema completo
  migrations/20260820120100_rls/      RLS, revokes e policies
  schema.prisma
  seed.ts                             plano de contas padrao
src/
  app/
    (auth)/                           login, cadastro, recuperar-senha, nova-senha
    (app)/                            area autenticada
      app/                            grid de empresas, busca, nova empresa
      empresas/[id]/                  visao da empresa, contas, periodos
      configuracoes/                  workspace, membros, plano de contas
      onboarding/                     wizard de 4 passos
      actions.ts                      CRUD de workspace, empresa e conta
    auth/callback|confirmar/          retorno de OAuth e de links por e-mail
  components/
    ui/                               shadcn/ui
    auth/ app/ brand/ forms/
  lib/
    auth/session.ts                   getCurrentUser, requireUser
    auth/workspace.ts                 getWorkspaceOrThrow, assert*InWorkspace
    auth/forms.ts                     schemas dos formularios de auth
    validation/schemas.ts             schemas de workspace/empresa/conta
    categories/default-plan.ts        plano de contas (fonte unica)
    companies/overview.ts             grid do workspace com status do mes
    workspace/{create,slug}.ts        criacao do workspace e slug
    format.ts period.ts               dinheiro, datas civis, competencia
    supabase/{server,client,admin,auth-settings}.ts
    env.ts prisma.ts site-url.ts
  proxy.ts                            renovacao de sessao + guarda de rotas
tests/unit/                           sem rede
tests/integration/                    isolamento multi-tenant, exige banco
```

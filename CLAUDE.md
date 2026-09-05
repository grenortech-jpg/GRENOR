@AGENTS.md

# FINORT (by Grenor) - Especificacao Tecnica (v3)

> Documento mestre para desenvolvimento assistido por IA (Claude Code).
> Construa o sistema fase por fase, na ordem definida na Secao 10. Nao pule fases.
> O estado atual da construcao esta na Secao 13.

---

## 1. Visao do Produto

**Finort** e uma plataforma SaaS que transforma extratos bancarios em relatorios financeiros executivos automaticamente.

**Identidade de marca:** Grenor e a EMPRESA; Finort e o PRODUTO (marca composta registravel: "Grenor Finort"). Na interface, o produto se apresenta como "Finort", com o selo "by Grenor" no login e no rodape. O simbolo do produto e a estrela polar dourada da marca. Nao renomear repositorio, pacotes ou variaveis por causa disso: o rebranding e de UI e comunicacao, nao de codigo.

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

CategorizationMemory (Fase 11, nivel workspace)
- id, workspaceId, normalizedDescription (chave sem datas/numeros), categoryId, hits
- unique (workspaceId, normalizedDescription); alimentada por confirmacao humana

CnpjProfile (Fase 11, nivel plataforma - dado publico, sem workspace)
- cnpj (14 digitos, PK), razaoSocial, cnaePrincipal, cnaeDescricao
- suggestedDefaultId (categoria PADRAO para saidas), source, notFound, hits, fetchedAt

Category ganha `defaultId`: a categoria do sistema da qual foi clonada. E o que
permite uma sugestao global apontar para "Fornecedores / CMV" em qualquer
workspace, mesmo renomeada.
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

**Rebranding de UI (obrigatorio):** substituir o wordmark "GRENOR" da sidebar e do login pela marca do produto: estrela polar dourada + "FINORT", com "by Grenor" discreto abaixo (login) e no rodape. Titulo das paginas: "Finort". Nenhuma mudanca em nomes de codigo, pacotes ou banco.

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

**Fase 9 - Producao e blindagem (custo zero):** deploy no Vercel (plano Hobby) + Supabase Free; CI no GitHub Actions rodando lint, typecheck e a suite Vitest completa em todo push e pull request; substituir a dependencia `xlsx` servida pelo CDN da SheetJS por alternativa do registry npm (exceljs ou xlsx do registry), eliminando o ponto unico de falha de build; backup logico semanal do banco (pg_dump) agendado no GitHub Actions com artefato retido por 30 dias.

**Fase 10 - Captacao antecipada:** pagina publica do Finort (proposta de valor, telas, video demo) com lista de espera (nome, e-mail e consentimento LGPD) gravada em tabela `Waitlist`; antecipa a parte publica da antiga v0.6.0 porque captar demanda e gratuito e nao deve esperar o produto ficar "pronto".

**Fase 11 - Memoria de categorizacao em dois niveis (a melhoria tecnica mais valiosa):**
- Nivel workspace: cache `CategorizationMemory(workspaceId, normalizedDescription, categoryId, hits)` alimentado por toda confirmacao humana; consultado ANTES das regras.
- Nivel plataforma (global): somente CNPJ, que e dado publico: `CnpjProfile(cnpj, razaoSocial, cnaePrincipal, suggestedCategoryId)`. NUNCA compartilhar descricoes entre workspaces (podem conter dados pessoais).
- Extracao de CNPJ por regex da propria descricao (PIX, TED, boleto) e enriquecimento do CNAE via BrasilAPI ou Minha Receita (APIs gratuitas), com cache local permanente.
- Nova ordem de resolucao: cache do workspace -> CNPJ/CNAE global -> regras -> IA -> humano. Registrar em log a porcentagem resolvida por camada (metrica de custo).

**Fase 12 - Onboarding e ingestao por e-mail:** assistente de configuracao em 4 passos + empresa de demonstracao + checklist de primeiros passos (v0.2.0); em seguida, endereco de e-mail dedicado por empresa via Cloudflare Email Workers (gratuito), reaproveitando o pipeline de importacao e deduplicacao existente, com notificacao de novos lancamentos (v0.3.0).

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
**Fase 2 - Importacao: concluida.**
**Fase 3 - Categorizacao por regras: concluida.**
**Fase 4 - Categorizacao por IA: concluida** (falta exercitar contra a API real:
depende de credito na conta Anthropic; AI_ENABLED esta false por decisao do
usuario ate haver cliente pagante).
**Fase 5 - DRE e dashboard: concluida.**
**Fase 6 - Relatorio PDF e link publico: concluida.**
**Fase 7 - Parecer executivo por IA: concluida** (mesma ressalva da Fase 4:
o caminho da IA nao foi exercitado contra a API real; o caminho manual, que e
o unico ativo com AI_ENABLED=false, esta funcionando).
**Fase 8 - Polimento de lancamento: concluida.** A migracao
`20260821100000_waitlist` precisa ser aplicada (`npm run db:deploy`) antes de
a lista de espera funcionar.

**Rebranding de UI (Secao 9): concluido.** Wordmark FINORT com a estrela polar
(`components/brand/logo.tsx`), titulo das paginas "Finort", selo "by Grenor" no
login, na landing e no link publico, icone do navegador (`src/app/icon.svg`). O
rodape do relatorio segue "Gerado por Grenor", como manda a Secao 7.

**Fase 9 - Producao e blindagem: concluida no codigo; deploy pendente de
login.** CI em `.github/workflows/ci.yml` (lint, typecheck e unitarios em todo
push e PR; integracao so quando existem os secrets `CI_*` de um projeto
Supabase separado). Backup semanal em `backup.yml`: `pg_dump` 17 do schema
`public`, cifrado com gpg (secrets `DIRECT_URL` e `BACKUP_PASSPHRASE`),
artefato por 30 dias - cifrado porque o repositorio e publico. `exceljs` no
lugar do CDN da SheetJS. O deploy no Vercel exige `vercel login` do usuario;
`vercel.json` (regiao gru1, 2 GB e 60 s na rota do PDF) ja esta pronto.

**Fase 10 - Captacao antecipada: concluida.** Pagina publica com proposta de
valor, video-demo (`public/demo.webm`, 1,9 MB, gravado pelo Playwright na
empresa de demonstracao), tres telas (`public/telas/`), lista de espera com
consentimento LGPD (`consent_at`, migracao `20260904120000_waitlist_consent`)
e aviso de privacidade em `/privacidade`.

**Fase 11 - Memoria de categorizacao em dois niveis: concluida.** Ordem de
resolucao em `lib/categorization/resolve.ts`: memoria do workspace -> CNPJ/CNAE
-> regras -> IA (acao separada) -> humano. O botao da conciliacao virou
"Categorizar automaticamente" (`autoCategorizeAction`); `applyRulesAction` segue
existindo para o "criar regra". Toda confirmacao humana (categorizacao manual,
regra criada a partir de um lancamento, sugestao da IA aceita) alimenta a
memoria. Consulta de CNPJ na BrasilAPI com fallback Minha Receita, cache
permanente em `cnpj_profiles`, ate 30 consultas por rodada, desligavel por
`CNPJ_LOOKUP_ENABLED=false`. Log `categorization_resolve` com a porcentagem por
camada. Migracao `20260904130000_categorization_memory`.

**Fase 12: pendente.**

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
| `npm run db:demo -- <slug>` | Empresa de demonstracao com 3 meses de dados |
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
- **dedupeHash carrega a ordem de ocorrencia.** A Secao 4 define o hash por
  accountId+data+valor+descricao, mas duas transacoes legitimamente distintas
  podem ter os quatro iguais (dois PIX de R$ 50 no mesmo dia). A n-esima
  ocorrencia entra no hash com sufixo, entao repeticao real sobrevive e
  reimportar o mesmo arquivo continua nao duplicando.
- **O preview nao e fonte de verdade.** A confirmacao da importacao reprocessa
  o arquivo guardado no Storage; o cliente nao dita quais linhas entram.
- **XLSX e lido pelo `exceljs` (registry npm), nao pelo SheetJS.** O `xlsx` do
  registry parou em 0.18.5, com CVEs, e a versao boa so existia no CDN da
  SheetJS - um tarball fora do npm que derrubava `npm ci` quando o CDN
  falhava (Fase 9). O exceljs e assincrono, por isso `parseStatement`
  devolve Promise; celulas viram texto (data em ISO, numero com duas casas)
  e seguem pelas mesmas regras do CSV.
- **Estado de `useActionState` nao atravessa componentes.** SheetPicker e
  ColumnMapper tinham cada um o seu e descartavam o preview devolvido:
  "Reler com esta aba" rodava a action e a tela nao mudava. O
  `useActionState` de reprocessamento vive no painel, e os formularios
  recebem `action` e `feedback` por props; `key` remonta o formulario quando
  o preview troca.
- **Regex de regra e entrada de usuario num processo compartilhado.** Todo
  padrao passa por `validatePattern` antes de ser gravado, que mede o tempo
  contra sondas adversarias. As sondas terminam com um caractere que IMPEDE o
  casamento (retrocesso catastrofico so ocorre quando falha) e sao curtas de
  proposito, para que a propria deteccao termine.
- **Regras nunca sobrescrevem categoria existente.** `applyRulesAction` so
  alcanca o que esta com `categoryId: null`: correcao manual e decisao do
  usuario.
- **Sugestao da IA nao ocupa `categoryId`.** Palpite abaixo de 0.8 vai para
  `aiSuggestedCategoryId` e o lancamento segue pendente. Se ocupasse
  `categoryId`, o periodo fecharia como "100% categorizado" carregando um chute
  para dentro da DRE.
- **A IA valida o que volta.** Ids de transacao fora do lote e ids de categoria
  fora do workspace sao descartados antes de gravar: o modelo pode inventar id.
- **Todo total da DRE e SOMA de valores com sinal, nunca subtracao manual.** A
  Secao 6 escreve "1-2-3-4-5-6" lendo os grupos de despesa como positivos a
  subtrair; somar valores ja sinalizados da o mesmo numero e continua correto
  quando um estorno positivo cai dentro de um grupo de despesa.
- **Variacao percentual contra zero e `null`, nao infinito.** "De 0 para 5.000"
  nao e aumento de infinito por cento; a interface mostra um traco.
- **Saldo consolidado conta o que veio DEPOIS da data do saldo inicial.** O
  saldo inicial e o da vespera do primeiro extrato; contar lancamentos
  anteriores somaria o mesmo dinheiro duas vezes. O checklist do fechamento
  avisa quando existem lancamentos anteriores - sinal de data mal cadastrada.
- **`react-dom/server` e proibido no App Router do Next.** Por isso o relatorio
  e gerado por template de string (`reports/report-html.ts`), e nao por
  componente React. O ganho colateral: PDF e link publico saem exatamente da
  mesma funcao, sem chance de divergirem, e o HTML pode ser testado.
- **Todo texto vindo do banco passa por `escapeHtml` no relatorio.** Descricao
  de lancamento vem de arquivo enviado pelo usuario e o link publico abre na
  maquina do cliente do escritorio.
- **Grupo de despesa aparece em modulo; os demais, com sinal.** O rotulo dos
  grupos 2 a 6 ja carrega o "(-)". Em "Movimentacoes societarias", esconder o
  sinal faz o leitor somar o que era saida.
- **PDF: `page.setContent`, nunca navegacao.** O gerador nao faz requisicao de
  volta para a propria aplicacao, nao depende de o relatorio estar publicado e
  nao cria URL interna a proteger.
- **Nada de estado mutavel em nivel de modulo em Server Components.** E
  compartilhado entre requisicoes concorrentes e vaza dados de um tenant no
  render de outro.
- **A fronteira de erro do Next 16 recebe `retry`, nao `reset`.** `retry`
  estabilizou na 16.3 e refaz a busca dos dados; `reset` so limpa o estado e
  re-renderiza, sem buscar de novo. Escrever `reset` por habito das versoes
  anteriores da um botao que nao conserta nada.
- **Erro nao mostra `error.message` ao usuario.** A mensagem pode carregar
  detalhe de banco ou de infraestrutura e a pagina e publica; o que aparece e
  o `digest`, que localiza o erro real no log do servidor.
- **A lista de espera nao tem policy de RLS, de proposito.** Nas tabelas
  financeiras a policy por workspace e a segunda barreira, mas quem se inscreve
  nao pertence a workspace nenhum: uma policy permissiva ali abriria a lista de
  e-mails para leitura publica. Sem policy, nenhuma linha e visivel - so o dono
  das tabelas (a aplicacao) alcanca.
- **Telas e video da pagina publica vem SO da empresa de demonstracao**, do
  mes de junho/2026 (o unico com a DRE inteira categorizada), com o cabecalho
  da aplicacao oculto por CSS. O painel `/app` nunca entra: lista empresas
  reais do workspace. Regerar: `scratchpad/assets.mjs` grava em `public/`.
- **Consentimento LGPD e `z.literal("on")`, nao boolean.** So a caixa marcada
  manda "on"; `consent=1` de robo nao consente com nada. A action grava
  `consentAt` (renovado a cada reinscricao), que e o registro que a LGPD
  pede para tratamento por consentimento.
- **O matcher do proxy lista extensoes de arquivo estatico.** `webm` e `mp4`
  precisaram entrar: sem isso `/demo.webm` era rota protegida e ia para o
  login.
- **E-mail repetido na lista responde sucesso, nao erro.** Mensagem diferente
  para endereco ja cadastrado transformaria o formulario publico num oraculo de
  "esse e-mail esta na lista?".
- **O relatorio tambem abre em celular.** As celulas da DRE usam
  `white-space:nowrap`, entao a tabela vai dentro de um `overflow-x:auto`; os
  maiores lancamentos usam `flex-wrap` com base de 260px, para ficarem lado a
  lado no PDF e empilharem no telefone. Sem media query: o mesmo HTML serve aos
  dois.
- **`Period` so existe depois do fechamento.** A tabela ganha linha quando o
  mes e fechado, entao ela nao serve para listar o historico: uma empresa com
  tres meses importados e nenhum fechamento aparecia como "nenhum periodo
  ainda". O historico vem de `listCompanyMonths`, que agrupa os lancamentos por
  ano/mes.
- **O status da empresa e do MES corrente, nao da empresa.** Por isso o badge
  fica ao lado da competencia e nao do nome: "Sem dados" ao lado do titulo, com
  170 lancamentos na mesma tela, diz uma mentira sobre a empresa.
- **Toda tela precisa de saida para meses anteriores.** Os atalhos do topo so
  aparecem quando o mes corrente tem movimento; sem a lista de meses clicavel,
  uma empresa com historico e o mes corrente vazio virava beco sem saida.
- **O unico `$queryRaw` do projeto** esta em `lib/companies/months.ts`: o
  Prisma nao agrupa por parte de data, e a alternativa era carregar a tabela de
  lancamentos inteira so para contar. Leva o `workspace_id` na propria consulta,
  como segundo cinto da Secao 3.
- **A chave da memoria nao e a normalizacao do dedupe.** `memoryKey` tira
  datas, competencias e qualquer token com tres ou mais digitos, para "PIX
  RECEBIDO 0106" e "PIX RECEBIDO 0206" caírem na mesma memoria; o dedupeHash
  precisa continuar estavel e nao pode mudar junto.
- **Todo candidato a CNPJ passa pelos digitos verificadores.** Numero de
  boleto tambem tem 14 digitos; sem a validacao viraria consulta a API e
  categoria errada.
- **CNAE so decide ENTRADA quando a contraparte e adquirente ou banco (64/66).**
  Receber de uma empresa qualquer nao diz se e venda ou servico; a resposta
  certa e deixar para as regras, a IA ou o humano.
- **Sugestao global aponta para a categoria PADRAO (`Category.defaultId`),
  nunca para um id de workspace.** Categoria e clonada por workspace e pode
  ser renomeada; o vinculo com a origem e o unico identificador estavel.
- **404 da API de CNPJ vira cache negativo; 429, 5xx e timeout nao.** O CNPJ
  que nao existe nao vai passar a existir; a API fora do ar volta.
- **Depois de `prisma generate`, reinicie o `next dev`.** O client do Prisma e
  singleton em `globalThis` e sobrevive ao hot reload com o schema antigo:
  campo novo da `PrismaClientValidationError` ate o processo subir de novo.
- **Funcao pura que o teste unitario precisa nao mora em modulo
  `server-only`.** `parseCnpjApiResponse` vive em `cnpj-api.ts` por isso.
- **Falha de IA e silenciosa por design** (Secao 8.1). Lote que estoura timeout
  ou devolve JSON invalido duas vezes fica sem categoria e a execucao segue nos
  demais.
- **O parecer descreve o snapshot, nunca um recalculo.** `generateSummaryAction`
  le `report.snapshotJson` e exige periodo fechado. Se o texto falasse de
  numeros calculados ao vivo enquanto a DRE mostra os congelados, os dois se
  contradiriam dentro do mesmo PDF.
- **"Maximo 3 regeracoes" (Secao 5.6) conta 3 chamadas no total**, incluindo a
  primeira, e o contador nao zera ao reabrir e refechar - senao reabrir em loop
  daria IA infinita. Edicao manual do texto e ilimitada e sem custo.
- **O contador so avanca quando ha texto entregue.** Chamada que falhou nao
  consome uma das tres: cobrar do usuario o erro da API e injusto, e falha de
  auth ou billing nem chega a gastar token.
- **O parecer e entrada de usuario num documento publico.** Depois da Fase 7 o
  campo e digitavel, e o mesmo texto vai para o PDF e para `/r/[shareToken]`,
  que abre na maquina do cliente do escritorio. `summaryHtml` escapa paragrafo
  a paragrafo, com teste de regressao.
- **O select de categoria da linha remonta por `key={row.categoryId}`.**
  Depois de "Categorizar automaticamente", a linha voltava categorizada do
  servidor mas o select continuava em "Sem categoria", porque `defaultValue`
  nao acompanha a prop.
- **Resetar campo quando a prop muda se faz com `key`, nao com efeito.** O
  ESLint (`react-hooks/set-state-in-effect`) barra `setState` dentro de
  `useEffect`; remontar o textarea por `key` faz o mesmo sem render em cascata.
- **Sonnet 5 rejeita `temperature` e `top_p` com 400.** O parecer roda com
  raciocinio adaptativo e `effort: "medium"` - interpretar variacao pede
  analise, mas o padrao (`high`) arrisca estourar os 30s da Secao 8.3.

### Estrutura

```
.github/workflows/
  ci.yml                              lint, typecheck e testes em push e PR
  backup.yml                          pg_dump semanal cifrado, artefato 30 dias
prisma/
  migrations/20260820120000_init/     schema completo
  migrations/20260820120100_rls/      RLS, revokes e policies
  migrations/20260821100000_waitlist/ lista de espera
  migrations/20260904120000_waitlist_consent/ consentimento LGPD
  migrations/20260904130000_categorization_memory/ memoria e perfis de CNPJ
  schema.prisma
  seed.ts                             plano de contas padrao
src/
  app/
    (auth)/                           login, cadastro, recuperar-senha, nova-senha
    (app)/                            area autenticada
      app/                            grid de empresas, busca, nova empresa
      empresas/[id]/                  visao da empresa, contas, periodos
      configuracoes/                  workspace, membros, plano de contas
      empresas/[id]/importar/         upload, preview, mapeamento de colunas
      empresas/[id]/conciliacao/      tabela do periodo, regras, transferencias
      empresas/[id]/fechamento/       DRE, indicadores, graficos, fechamento
    api/relatorio/[periodId]/pdf/     geracao do PDF (nodejs, maxDuration 60)
    r/[shareToken]/                   relatorio publico, sem login
    page.tsx actions.ts               pagina publica do Finort e lista de espera
    privacidade/                      aviso de privacidade (LGPD)
    error.tsx global-error.tsx        fronteiras de erro
    not-found.tsx                     404 publica
      configuracoes/regras/           CRUD das regras do workspace
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
    companies/months.ts               meses com movimento de uma empresa
    workspace/{create,slug}.ts        criacao do workspace e slug
    import/                           parsers e normalizacao da Secao 5.1
      parse.ts                        orquestrador, deteccao de formato, limites
      encoding.ts dates.ts            latin-1, dd/mm/aaaa, serial do Excel
      ofx.ts csv.ts xlsx.ts tabular.ts
      normalize.ts dedupe.ts          dedupeHash e separacao de duplicatas
      storage.ts                      bucket privado de extratos
    ai/{client,prompt,categorize}.ts  camada 2: IA em lote, limites e custo
    ai/{summary-prompt,summarize}.ts  parecer executivo (Secao 8.2)
    reports/dre.ts                    calculo da DRE, puro e testavel
    reports/load.ts                   carga dos dados do periodo
    reports/report-html.ts            o relatorio, como HTML (PDF e link)
    reports/svg-charts.ts             graficos sem JavaScript
    reports/pdf.ts                    Chromium serverless / Chrome local
    reports/storage.ts                PDFs no bucket privado, URL assinada
    categorization/                   memoria em dois niveis (Fase 11)
      memory-key.ts cnpj.ts           chave da memoria; extracao/validacao de CNPJ
      cnae-map.ts cnpj-api.ts         CNAE -> categoria padrao; leitura das APIs
      cnpj-lookup.ts memory.ts        consulta com cache; alimentar/lembrar
      resolve.ts                      ordem de resolucao e log por camada
    rules/engine.ts                   motor de regras e validacao de padrao
    transactions/transfers.ts         pares de transferencia (Secao 5.4)
    categories/list.ts                plano de contas do workspace
    format.ts period.ts               dinheiro, datas civis, competencia
    supabase/{server,client,admin,auth-settings}.ts
    env.ts prisma.ts site-url.ts
  proxy.ts                            renovacao de sessao + guarda de rotas
public/telas/ public/demo.webm        telas e video da pagina publica (demo)
scripts/demo.ts                       empresa de demonstracao (3 meses)
tests/unit/                           sem rede
tests/fixtures/                       OFX 1.x, OFX 2.x, CSV ; , e XLSX
tests/integration/                    isolamento e importacao, exigem banco
  company-months.test.ts              historico e isolamento do $queryRaw
  waitlist.test.ts                    lista de espera pela propria action
  categorization-memory.test.ts       memoria: contagem e isolamento
  cnpj-lookup.test.ts                 consulta real de CNPJ (pula sem rede)
```

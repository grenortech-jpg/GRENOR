# Ingestão de extratos por e-mail (Fase 12)

Cada empresa ganha um endereço dedicado (`<token>@extratos.seudominio.com.br`).
O extrato enviado como anexo entra pelo mesmo pipeline da tela de importação:
parser, deduplicação e Storage. Nada é duplicado e nada é confirmado às cegas:
só remetentes autorizados na tela da empresa são aceitos.

Custo zero: Cloudflare Email Routing + Email Workers (plano gratuito).

## Passo a passo

1. **Domínio na Cloudflare.** O domínio (ou subdomínio, ex. `extratos.finort.com.br`)
   precisa ter DNS na Cloudflare. Em *Email > Email Routing*, ative o roteamento.
2. **Aplicação.** No `.env` de produção defina:
   - `INBOUND_EMAIL_DOMAIN=extratos.seudominio.com.br`
   - `INBOUND_EMAIL_SECRET=<frase longa e aleatória>`
3. **Worker.** Nesta pasta:
   ```sh
   npm install
   npx wrangler login
   npx wrangler secret put FINORT_INBOUND_URL     # https://app.seudominio.com.br/api/inbound/email
   npx wrangler secret put FINORT_INBOUND_SECRET  # o mesmo INBOUND_EMAIL_SECRET
   npm run deploy
   ```
4. **Rota.** Em *Email Routing > Routing rules*, crie a regra *catch-all*
   ("todos os endereços") com ação *Send to a Worker* → `finort-email-worker`.
5. **Na empresa.** Abra a empresa no Finort, card *Extratos por e-mail*: ative,
   informe os remetentes autorizados (um por linha) e copie o endereço.

## Empresa com mais de uma conta

Use a tag da conta no endereço: `<token>+conta-corrente@…`. A tag é o apelido
da conta em minúsculas, sem acento, com hífens. A tela mostra os endereços prontos.

## O que o Worker faz e o que não faz

- Extrai anexos `.ofx`, `.csv`, `.txt`, `.xlsx`, `.xlsm` e os envia à aplicação.
- Não guarda mensagem nem anexo; não decide nada sobre token ou remetente.
- Mensagem sem anexo de extrato, endereço desconhecido ou remetente não
  autorizado é **rejeitada** (o remetente recebe a devolução com o motivo).
- Erro 5xx da aplicação faz o Worker falhar, e a Cloudflare tenta de novo.

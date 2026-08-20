import { parseOfxDate } from "@/lib/import/dates";
import { ParseError, type ParseResult, type ParseWarning, type ParsedTransaction } from "@/lib/import/types";
import { parseMoneyToCents } from "@/lib/format";

/**
 * Parser de OFX 1.x (SGML) e 2.x (XML).
 *
 * Escrito a mao de proposito. O OFX 1.x nao e XML: as tags nao fecham
 * (`<TRNAMT>-50.00` e uma linha inteira valida) e os arquivos brasileiros
 * costumam trazer lixo antes do `<OFX>`, quebras de linha em lugares
 * improvaveis e valor com virgula decimal. Bibliotecas genericas de XML
 * engasgam nisso; um leitor tolerante resolve.
 */

type OfxNode = {
  tag: string;
  value: string;
};

/**
 * Extrai os pares tag/valor do corpo, funcionando tanto para SGML quanto para
 * XML. Tags de abertura sem texto tambem entram: no XML, `<STMTTRN>` vem
 * sozinha numa linha, e e justamente ela que marca o inicio de cada
 * lancamento. Descartar tag vazia funde o extrato inteiro numa transacao so.
 *
 * Tags de fechamento (`</STMTTRN>`) nao casam com o padrao e sao ignoradas.
 */
function tokenize(body: string): OfxNode[] {
  const nodes: OfxNode[] = [];
  const pattern = /<([A-Za-z0-9._]+)>([^<]*)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    nodes.push({
      tag: match[1].toUpperCase(),
      value: match[2].replace(/\r/g, "").trim(),
    });
  }

  return nodes;
}

/** Remove o cabecalho do OFX 1.x e devolve o corpo a partir de `<OFX>`. */
function stripHeader(text: string): string {
  const start = text.search(/<OFX>/i);
  if (start === -1) {
    throw new ParseError(
      "Arquivo OFX sem a seção <OFX>. Confira se o download do banco foi concluído.",
    );
  }
  return text.slice(start);
}

/** Entidades XML que aparecem em descricoes ("BAR & CIA"). */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Valores em OFX deveriam usar ponto decimal, mas exportadores brasileiros
 * mandam virgula. parseMoneyToCents aceita os dois.
 */
function parseAmount(value: string): number | null {
  return parseMoneyToCents(value);
}

export function parseOfx(text: string): ParseResult {
  const body = stripHeader(text);
  const nodes = tokenize(body);

  const transactions: ParsedTransaction[] = [];
  const warnings: ParseWarning[] = [];

  let accountHint: string | undefined;
  let bankId: string | undefined;
  let accountId: string | undefined;

  // Uma transacao comeca em STMTTRN e termina no proximo STMTTRN. Como as
  // tags do 1.x nao fecham, acumulamos por tag ate a proxima abertura.
  let current: Partial<ParsedTransaction> & { type?: string } | null = null;

  const flush = () => {
    if (!current) return;

    const { date, description, amountCents } = current;

    if (!date || amountCents === undefined) {
      warnings.push({
        reason: `Lançamento ignorado por falta de data ou valor${
          description ? `: ${description}` : ""
        }.`,
      });
      current = null;
      return;
    }

    transactions.push({
      date,
      description: description?.trim() || "Sem descrição",
      amountCents,
      fitId: current.fitId,
    });

    current = null;
  };

  for (const node of nodes) {
    // STMTTRN e um marcador estrutural e nao carrega texto; as demais tags so
    // interessam quando trazem valor.
    if (node.tag !== "STMTTRN" && !node.value) continue;

    switch (node.tag) {
      case "BANKID":
        bankId = node.value;
        break;
      case "ACCTID":
        accountId = node.value;
        break;

      case "STMTTRN":
        // O 1.x nao traz valor em STMTTRN; a tag so marca o inicio.
        flush();
        current = {};
        break;

      case "TRNTYPE":
        if (!current) current = {};
        current.type = node.value.toUpperCase();
        break;

      case "DTPOSTED": {
        if (!current) current = {};
        const date = parseOfxDate(node.value);
        if (date) current.date = date;
        else warnings.push({ reason: `Data inválida no OFX: ${node.value}` });
        break;
      }

      case "TRNAMT": {
        if (!current) current = {};
        const cents = parseAmount(node.value);
        if (cents !== null) current.amountCents = cents;
        else warnings.push({ reason: `Valor inválido no OFX: ${node.value}` });
        break;
      }

      case "FITID":
        if (!current) current = {};
        current.fitId = node.value;
        break;

      case "NAME":
      case "MEMO": {
        if (!current) current = {};
        const value = decodeEntities(node.value);
        // NAME e MEMO costumam se complementar; concatenar preserva contexto
        // sem repetir quando um e prefixo do outro.
        if (!current.description) {
          current.description = value;
        } else if (
          !current.description.includes(value) &&
          !value.includes(current.description)
        ) {
          current.description = `${current.description} - ${value}`;
        } else if (value.length > current.description.length) {
          current.description = value;
        }
        break;
      }

      default:
        break;
    }
  }

  flush();

  if (bankId || accountId) {
    accountHint = [bankId, accountId].filter(Boolean).join(" / ");
  }

  if (transactions.length === 0) {
    throw new ParseError(
      "Nenhum lançamento encontrado no OFX. O arquivo pode estar vazio ou ser de um período sem movimento.",
    );
  }

  return {
    fileType: "OFX",
    transactions,
    warnings,
    accountHint,
  };
}

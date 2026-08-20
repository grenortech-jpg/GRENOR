/**
 * Graficos em SVG estatico para o relatorio (Secao 2).
 *
 * O PDF e o link compartilhado nao executam JavaScript: o Recharts serve a
 * tela, aqui o desenho precisa vir pronto. Como sao os mesmos dados e a mesma
 * paleta, o cliente ve a mesma coisa nos dois lugares.
 *
 * Funcoes puras que devolvem string de SVG - testaveis sem navegador.
 */

const BRAND = "#1b2a4a";
const GOLD = "#c9a227";
const GRID = "#e3e8ef";
const MUTED = "#6b7280";

const MONTH_ABBR = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** Escapa texto que vai para dentro do SVG. */
function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compact(cents: number): string {
  const reais = cents / 100;
  if (Math.abs(reais) >= 1000) return `${Math.round(reais / 1000)}k`;
  return String(Math.round(reais));
}

/** Barras agrupadas: entradas e saidas dos ultimos seis meses (Secao 7). */
export function monthlyFlowSvg(
  data: { year: number; month: number; inflowCents: number; outflowCents: number }[],
  options: { width?: number; height?: number } = {},
): string {
  const width = options.width ?? 520;
  const height = options.height ?? 200;
  const padding = { top: 12, right: 8, bottom: 24, left: 44 };

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = Math.max(
    1,
    ...data.map((row) => Math.max(row.inflowCents, row.outflowCents)),
  );

  const groupWidth = plotWidth / Math.max(1, data.length);
  const barWidth = Math.min(18, (groupWidth - 8) / 2);

  const bars: string[] = [];
  const labels: string[] = [];

  data.forEach((row, index) => {
    const groupX = padding.left + index * groupWidth;
    const center = groupX + groupWidth / 2;

    const inflowHeight = (row.inflowCents / max) * plotHeight;
    const outflowHeight = (row.outflowCents / max) * plotHeight;

    bars.push(
      `<rect x="${(center - barWidth - 2).toFixed(1)}" y="${(
        padding.top + plotHeight - inflowHeight
      ).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${inflowHeight.toFixed(
        1,
      )}" fill="${BRAND}" rx="2" />`,
    );
    bars.push(
      `<rect x="${(center + 2).toFixed(1)}" y="${(
        padding.top + plotHeight - outflowHeight
      ).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${outflowHeight.toFixed(
        1,
      )}" fill="${GOLD}" rx="2" />`,
    );

    labels.push(
      `<text x="${center.toFixed(1)}" y="${(height - 8).toFixed(
        1,
      )}" text-anchor="middle" font-size="10" fill="${MUTED}">${
        MONTH_ABBR[row.month - 1]
      }/${String(row.year).slice(2)}</text>`,
    );
  });

  const ticks = [0, 0.5, 1].map((fraction) => {
    const y = padding.top + plotHeight - fraction * plotHeight;
    return (
      `<line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${(
        width - padding.right
      ).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GRID}" />` +
      `<text x="${padding.left - 6}" y="${(y + 3).toFixed(
        1,
      )}" text-anchor="end" font-size="9" fill="${MUTED}">${compact(
        max * fraction,
      )}</text>`
    );
  });

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Entradas e saídas dos últimos seis meses">${ticks.join(
    "",
  )}${bars.join("")}${labels.join("")}</svg>`;
}

/** Barras horizontais: maiores categorias de despesa (Secao 7). */
export function topExpensesSvg(
  data: { name: string; cents: number }[],
  options: { width?: number } = {},
): string {
  if (data.length === 0) return "";

  const width = options.width ?? 520;
  const rowHeight = 22;
  const gap = 6;
  const labelWidth = 150;
  const height = data.length * (rowHeight + gap) + 8;

  const max = Math.max(...data.map((row) => row.cents), 1);
  const plotWidth = width - labelWidth - 60;

  const rows = data.map((row, index) => {
    const y = index * (rowHeight + gap) + 4;
    const barWidth = (row.cents / max) * plotWidth;
    // A maior despesa em dourado: e a que o dono precisa olhar primeiro.
    const fill = index === 0 ? GOLD : BRAND;

    return (
      `<text x="${labelWidth - 8}" y="${(y + rowHeight / 2 + 4).toFixed(
        1,
      )}" text-anchor="end" font-size="10" fill="#2e3440">${escape(
        row.name.length > 26 ? `${row.name.slice(0, 25)}…` : row.name,
      )}</text>` +
      `<rect x="${labelWidth}" y="${y}" width="${Math.max(barWidth, 1).toFixed(
        1,
      )}" height="${rowHeight}" fill="${fill}" rx="2" />` +
      `<text x="${(labelWidth + barWidth + 6).toFixed(1)}" y="${(
        y +
        rowHeight / 2 +
        4
      ).toFixed(1)}" font-size="10" fill="${MUTED}">${compact(row.cents)}</text>`
    );
  });

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Maiores categorias de despesa">${rows.join(
    "",
  )}</svg>`;
}

/** Linha: evolucao do saldo no mes (Secao 7). */
export function balanceSvg(
  data: { date: string; balanceCents: number }[],
  options: { width?: number; height?: number } = {},
): string {
  if (data.length === 0) return "";

  const width = options.width ?? 520;
  const height = options.height ?? 200;
  const padding = { top: 12, right: 8, bottom: 24, left: 48 };

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const values = data.map((point) => point.balanceCents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Faixa achatada quando o saldo mal varia; senao a linha vira uma reta
  // colada no topo do grafico.
  const range = max - min || Math.max(Math.abs(max), 1);

  const points = data.map((point, index) => {
    const x = padding.left + (index / Math.max(1, data.length - 1)) * plotWidth;
    const y =
      padding.top + plotHeight - ((point.balanceCents - min) / range) * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const ticks = [0, 0.5, 1].map((fraction) => {
    const y = padding.top + plotHeight - fraction * plotHeight;
    return (
      `<line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${(
        width - padding.right
      ).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GRID}" />` +
      `<text x="${padding.left - 6}" y="${(y + 3).toFixed(
        1,
      )}" text-anchor="end" font-size="9" fill="${MUTED}">${compact(
        min + range * fraction,
      )}</text>`
    );
  });

  const dayLabels = data
    .map((point, index) => ({ point, index }))
    .filter(({ index }) => index % 5 === 0 || index === data.length - 1)
    .map(({ point, index }) => {
      const x = padding.left + (index / Math.max(1, data.length - 1)) * plotWidth;
      return `<text x="${x.toFixed(1)}" y="${(height - 8).toFixed(
        1,
      )}" text-anchor="middle" font-size="9" fill="${MUTED}">${point.date.slice(
        8,
        10,
      )}</text>`;
    });

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Evolução do saldo no mês">${ticks.join(
    "",
  )}<polyline points="${points.join(
    " ",
  )}" fill="none" stroke="${BRAND}" stroke-width="2" stroke-linejoin="round" />${dayLabels.join(
    "",
  )}</svg>`;
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney } from "@/lib/format";

/**
 * Graficos da Secao 7. Paleta sobria da Secao 9: azul profundo para entradas e
 * saldo, dourado para saidas e destaques. Sem gradiente, sem 3D.
 */

const BRAND = "#1b2a4a";
const GOLD = "#c9a227";
const GRID = "#e3e8ef";

/** Eixo de valores em milhares: "12.500,00" em cada tick polui o grafico. */
function compact(cents: number): string {
  const reais = cents / 100;
  if (Math.abs(reais) >= 1000) {
    return `${Math.round(reais / 1000)}k`;
  }
  return String(Math.round(reais));
}

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

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((entry, index) => (
        <p key={index} className="tabular" style={{ color: entry.color }}>
          {entry.name}: {formatMoney(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

export function MonthlyFlowChart({
  data,
}: {
  data: { year: number; month: number; inflowCents: number; outflowCents: number }[];
}) {
  const rows = data.map((row) => ({
    label: `${MONTH_ABBR[row.month - 1]}/${String(row.year).slice(2)}`,
    Entradas: row.inflowCents,
    Saídas: row.outflowCents,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: GRID }}
          fontSize={12}
        />
        <YAxis
          tickFormatter={compact}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={44}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f4f6f9" }} />
        <Bar dataKey="Entradas" fill={BRAND} radius={[3, 3, 0, 0]} />
        <Bar dataKey="Saídas" fill={GOLD} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopExpensesChart({
  data,
}: {
  data: { name: string; cents: number }[];
}) {
  const rows = [...data].reverse().map((row) => ({
    name: row.name,
    Valor: row.cents,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34)}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
      >
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={compact}
          tickLine={false}
          axisLine={false}
          fontSize={12}
        />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={150}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f4f6f9" }} />
        <Bar dataKey="Valor" radius={[0, 3, 3, 0]}>
          {rows.map((_, index) => (
            <Cell
              key={index}
              // A maior despesa em dourado: e a que o dono precisa olhar
              // primeiro.
              fill={index === rows.length - 1 ? GOLD : BRAND}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BalanceChart({
  data,
}: {
  data: { date: string; balanceCents: number }[];
}) {
  const rows = data.map((row) => ({
    label: row.date.slice(8, 10),
    Saldo: row.balanceCents,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: GRID }}
          fontSize={12}
          interval={4}
        />
        <YAxis
          tickFormatter={compact}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={44}
        />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="Saldo"
          stroke={BRAND}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

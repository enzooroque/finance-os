"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthLabel } from "./bits";
import { formatBRL } from "@/lib/money";

// Paleta validada (dark, superfície #161b2b): CVD ΔE 19.6, contraste ≥ 3:1.
export const INCOME_COLOR = "#4a8ae0";
export const EXPENSE_COLOR = "#e0535f";
const SINGLE = "#7c5cff";
const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11 };
const short = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);

function TooltipBox({ title, items }: { title: string; items: { label: string; color: string; cents: number }[] }) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium capitalize">{title}</p>
      {items.map((i) => (
        <p key={i.label} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ backgroundColor: i.color }} />
          <span className="text-muted-foreground">{i.label}</span>
          <span className="tabular ml-auto">{formatBRL(i.cents)}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

type Point = { month: string; income: number; expense: number; balance: number };

export function IncomeExpenseChart({ data }: { data: Point[] }) {
  return (
    <figure>
      <Legend items={[{ label: "Receitas", color: INCOME_COLOR }, { label: "Despesas", color: EXPENSE_COLOR }]} />
      <div className="h-52" role="img" aria-label="Receitas e despesas dos últimos 6 meses">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} margin={{ left: -12, right: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m).split(" ")[0]} tickLine={false} axisLine={false} {...AXIS} />
            <YAxis tickFormatter={short} tickLine={false} axisLine={false} width={48} {...AXIS} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={monthLabel(String(label))}
                    items={[
                      { label: "Receitas", color: INCOME_COLOR, cents: Number(payload[0].payload.income) },
                      { label: "Despesas", color: EXPENSE_COLOR, cents: Number(payload[0].payload.expense) },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="income" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="expense" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function BalanceChart({ data }: { data: Point[] }) {
  return (
    <div className="h-44" role="img" aria-label="Evolução do saldo nos últimos 6 meses">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m).split(" ")[0]} tickLine={false} axisLine={false} {...AXIS} />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} width={48} {...AXIS} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox title={`Fim de ${monthLabel(String(label))}`} items={[{ label: "Saldo", color: SINGLE, cents: Number(payload[0].value) }]} />
              ) : null
            }
          />
          <Line type="monotone" dataKey="balance" stroke={SINGLE} strokeWidth={2} dot={{ r: 4, fill: SINGLE, stroke: "var(--card)", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontais (sem gráfico de pizza): nome e valor sempre visíveis, sem depender de cor. */
export function CategoryBars({ data }: { data: { name: string; cents: number }[] }) {
  const max = Math.max(...data.map((d) => d.cents), 1);
  return (
    <ul className="grid gap-2" aria-label="Despesas por categoria">
      {data.map((d) => (
        <li key={d.name} className="grid gap-1">
          <div className="flex justify-between gap-2 text-xs">
            <span className="truncate">{d.name}</span>
            <span className="tabular text-muted-foreground">{formatBRL(d.cents)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-3">
            <div className="h-full rounded-full" style={{ width: `${(d.cents / max) * 100}%`, backgroundColor: SINGLE }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

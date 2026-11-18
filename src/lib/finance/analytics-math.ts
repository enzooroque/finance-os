/** Agregações puras (testadas) para dashboard e relatórios. Valores sempre em centavos. */
import { addMonthsClamped } from "@/lib/dates";

export type TxLite = {
  type: "income" | "expense";
  amount_cents: number;
  occurred_on: string;
  category_id: string | null;
};

/** Lista de meses "AAAA-MM" terminando em `end` (inclusive). */
export function lastMonths(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonthsClamped(`${end}-01`, i - count + 1).slice(0, 7));
}

export function monthlyTotals(rows: TxLite[], months: string[]) {
  const map = new Map(months.map((m) => [m, { month: m, income: 0, expense: 0 }]));
  for (const r of rows) {
    const bucket = map.get(r.occurred_on.slice(0, 7));
    if (bucket) bucket[r.type] += Number(r.amount_cents);
  }
  return months.map((m) => map.get(m)!);
}

/** Despesas por categoria-mãe, maiores primeiro; o que passar de `top` vira "Outras". */
export function expensesByCategory(
  rows: TxLite[],
  categories: { id: string; name: string; parentId: string | null }[],
  top = 6,
): { name: string; cents: number }[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (r.type !== "expense") continue;
    const cat = r.category_id ? byId.get(r.category_id) : undefined;
    const parent = cat?.parentId ? byId.get(cat.parentId) : cat;
    const name = parent?.name ?? "Sem categoria";
    totals.set(name, (totals.get(name) ?? 0) + Number(r.amount_cents));
  }
  const sorted = [...totals.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
  if (sorted.length <= top) return sorted;
  const rest = sorted.slice(top - 1).reduce((s, x) => s + x.cents, 0);
  return [...sorted.slice(0, top - 1), { name: "Outras", cents: rest }];
}

/**
 * Saldo no fim de cada mês, andando para trás a partir do saldo atual:
 * saldo(fim de M) = saldo(fim de M+1) − fluxo de caixa líquido de M+1.
 * `netByMonth` deve incluir os meses depois do último da lista até hoje.
 */
export function balanceHistory(currentCents: number, months: string[], netByMonth: Map<string, number>, today: string): number[] {
  const thisMonth = today.slice(0, 7);
  const out: number[] = [];
  let balance = currentCents;
  // tira os meses posteriores ao último da lista (se a lista termina no passado)
  for (let m = thisMonth; m > months[months.length - 1]; m = addMonthsClamped(`${m}-01`, -1).slice(0, 7)) {
    balance -= netByMonth.get(m) ?? 0;
  }
  for (let i = months.length - 1; i >= 0; i--) {
    out[i] = balance;
    balance -= netByMonth.get(months[i]) ?? 0;
  }
  return out;
}

/** Variação percentual inteira (null quando a base é zero). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) * 100) / Math.abs(previous));
}

// ------------------------------------------------------------------ CSV
const FORMULA = /^[=+\-@\t\r]/;

/** Célula CSV segura: aspas escapadas e proteção contra fórmula (Excel/Sheets). */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  // Números (inclusive negativos, "-50,00") não são fórmula; o resto que começa com =+-@ é neutralizado.
  if (FORMULA.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV no padrão brasileiro (separador ";"), com BOM para o Excel abrir acentos certo. */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
}

/** Centavos -> "1234,56" (sem R$), para planilhas. */
export function centsToCsv(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

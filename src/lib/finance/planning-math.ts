/** Cálculos de planejamento (puros, testados): datas de recorrência, metas e orçamentos. */
import { addMonthsClamped } from "@/lib/dates";

export type Frequency = "weekly" | "monthly" | "yearly";
export const frequencyLabel: Record<Frequency, string> = { weekly: "Semanal", monthly: "Mensal", yearly: "Anual" };

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Vencimentos de uma regra entre `from` e `to` (inclusive, YYYY-MM-DD).
 * Mensal/anual mantém o dia de início (31 vira o último dia em meses curtos).
 */
export function occurrenceDates(
  rule: { startOn: string; endOn: string | null; frequency: Frequency; intervalCount: number },
  from: string,
  to: string,
): string[] {
  const out: string[] = [];
  const anchor = Number(rule.startOn.slice(8, 10));
  const step = Math.max(1, rule.intervalCount);
  const last = rule.endOn && rule.endOn < to ? rule.endOn : to;
  for (let i = 0; i < 2000; i++) {
    const date =
      rule.frequency === "weekly"
        ? addDays(rule.startOn, 7 * step * i)
        : addMonthsClamped(rule.startOn, (rule.frequency === "yearly" ? 12 : 1) * step * i, anchor);
    if (date > last) break;
    if (date >= from) out.push(date);
  }
  return out;
}

/** Quanto guardar por mês para chegar na meta até o prazo (arredonda para cima, em centavos). */
export function monthlyNeeded(remainingCents: number, today: string, deadline: string | null): number | null {
  if (!deadline || remainingCents <= 0) return null;
  const [ty, tm] = today.split("-").map(Number);
  const [dy, dm] = deadline.split("-").map(Number);
  const months = Math.max(1, (dy - ty) * 12 + (dm - tm));
  return Math.ceil(remainingCents / months);
}

/** Meses estimados para concluir, no ritmo médio de aporte informado (null se sem ritmo). */
export function monthsToFinish(remainingCents: number, avgMonthlyCents: number): number | null {
  if (remainingCents <= 0) return 0;
  if (avgMonthlyCents <= 0) return null;
  return Math.ceil(remainingCents / avgMonthlyCents);
}

export type BudgetLevel = "ok" | "warning" | "over";

/** Alerta de orçamento: 80% avisa, acima de 100% estourou. */
export function budgetLevel(usedCents: number, plannedCents: number): BudgetLevel {
  if (plannedCents <= 0) return usedCents > 0 ? "over" : "ok";
  if (usedCents > plannedCents) return "over";
  return usedCents * 100 >= plannedCents * 80 ? "warning" : "ok";
}

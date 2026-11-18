/** Ritmo de gastos do mês ("pode gastar"): puro e testado. Valores em centavos. */
import { daysInMonth } from "@/lib/dates";

export type PaceStatus = "ok" | "ahead" | "over";

export function monthPace({ limitCents, spentCents, month, today }: { limitCents: number; spentCents: number; month: string; today: string }) {
  const [y, m] = month.split("-").map(Number);
  const total = daysInMonth(y, m);
  const thisMonth = today.slice(0, 7);
  // Dias que já passaram (contando hoje) e que ainda restam, conforme o mês olhado.
  const elapsed = month < thisMonth ? total : month > thisMonth ? 0 : Number(today.slice(8, 10));
  const daysLeft = total - elapsed + (month === thisMonth ? 1 : 0);
  const remainingCents = limitCents - spentCents;
  const expectedCents = Math.round((limitCents * elapsed) / total);
  const status: PaceStatus = remainingCents < 0 ? "over" : spentCents > expectedCents ? "ahead" : "ok";
  return {
    remainingCents,
    daysLeft,
    dailyCents: daysLeft > 0 && remainingCents > 0 ? Math.floor(remainingCents / daysLeft) : 0,
    usedPct: limitCents > 0 ? Math.min(100, Math.round((spentCents * 100) / limitCents)) : 0,
    status,
    isNewMonth: month === thisMonth && elapsed <= 3,
  };
}

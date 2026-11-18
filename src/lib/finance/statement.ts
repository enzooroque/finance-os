/** Regras de exibição de cartões e faturas (compartilhadas entre servidor e cliente). */

export const CARD_BRANDS = ["visa", "mastercard", "elo", "amex", "hipercard", "other"] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

export const brandLabel: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  elo: "Elo",
  amex: "American Express",
  hipercard: "Hipercard",
  other: "Outra",
};

export type StatementState = "open" | "closed" | "partial" | "paid" | "empty";

export const statementStateLabel: Record<StatementState, string> = {
  open: "Aberta",
  closed: "Fechada",
  partial: "Paga em parte",
  paid: "Paga",
  empty: "Sem gastos",
};

/** Situação da fatura em uma data (YYYY-MM-DD, fuso de São Paulo). */
export function statementState(s: { closingDate: string; totalCents: number; paidCents: number }, today: string): StatementState {
  if (s.totalCents > 0 && s.paidCents >= s.totalCents) return "paid";
  if (s.paidCents > 0) return "partial";
  if (today < s.closingDate) return "open";
  if (s.totalCents === 0) return "empty";
  return s.paidCents > 0 ? "partial" : "closed";
}

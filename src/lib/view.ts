/**
 * As três visões do app. A escolha fica num cookie para que, nas próximas fases,
 * o servidor também saiba qual visão buscar. Importante: a visão é só um FILTRO de
 * conveniência; quem garante que A não vê dados privados de B é o RLS no banco.
 */
export const VIEWS = [
  { value: "pessoal", label: "Pessoal" },
  { value: "compartilhado", label: "Compartilhado" },
  { value: "consolidado", label: "Consolidado" },
] as const;

export type FinanceView = (typeof VIEWS)[number]["value"];

export const VIEW_COOKIE = "fos_view";
export const DEFAULT_VIEW: FinanceView = "consolidado";

export function parseView(value: string | undefined | null): FinanceView {
  return VIEWS.some((v) => v.value === value) ? (value as FinanceView) : DEFAULT_VIEW;
}

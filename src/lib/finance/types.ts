/** Tipos e rótulos compartilhados entre servidor e cliente (sem segredo nenhum). */

export type Scope = "personal" | "shared";
export type AccountType = "checking" | "savings" | "digital_wallet" | "cash" | "investment";

export const accountTypeLabel: Record<AccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  digital_wallet: "Carteira digital",
  cash: "Dinheiro",
  investment: "Investimentos",
};

export const scopeLabel: Record<Scope, string> = { personal: "Pessoal", shared: "Compartilhado" };

export type Account = {
  id: string;
  name: string;
  institution: string | null;
  type: AccountType;
  color: string | null;
  scope: Scope;
  archived: boolean;
  initialBalanceCents: number;
  balanceCents: number;
  pendingCents: number;
  /** Taxa de rendimento em pontos-base ao ano (1040 = 10,40%); null = não rende. */
  yieldAnnualBp: number | null;
  /** "% do CDI" em pontos-base (10200 = 102%); quando preenchido, vale no lugar da taxa fixa. */
  yieldCdiBp: number | null;
};

export type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  parentId: string | null;
  color: string | null;
  /** null = categoria padrão do sistema */
  scope: Scope | null;
};

export type Member = { userId: string; displayName: string; avatarColor: string };

export type TransactionRow = {
  id: string;
  type: "income" | "expense";
  amountCents: number;
  description: string;
  occurredOn: string;
  paidOn: string | null;
  status: "paid" | "pending";
  isFixed: boolean;
  notes: string | null;
  scope: Scope;
  accountId: string | null;
  accountName: string | null;
  creditCardName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  createdByName: string;
  responsibleUserId: string | null;
  responsibleName: string | null;
  splits: { userId: string; amountCents: number }[];
  /** "2/12" quando é parcela de compra no cartão. */
  installment: string | null;
  purchaseId: string | null;
  editable: boolean;
};

export type TransferRow = {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  fromName: string | null;
  toName: string | null;
  amountCents: number;
  occurredOn: string;
  description: string | null;
  createdByName: string;
};

/** Opções que o formulário de lançamento precisa (carregadas no servidor). */
export type EntryOptions = {
  userId: string;
  householdId: string | null;
  members: Member[];
  accounts: Pick<Account, "id" | "name" | "scope">[];
  categories: Category[];
};

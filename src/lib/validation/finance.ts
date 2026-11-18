import { z } from "zod";
import { daysInMonth } from "@/lib/dates";
import { parseBRL, splitByWeights } from "@/lib/money";

/**
 * Schemas financeiros. Os "Input" são o que o SERVIDOR aceita (valores já em centavos);
 * os "Form" são o que o usuário digita (texto em reais) e viram Input via funções to*Input.
 */

export const ACCOUNT_TYPES = ["checking", "savings", "digital_wallet", "cash", "investment"] as const;
export const SCOPES = ["personal", "shared"] as const;
const MAX_CENTS = 10_000_000_000_000; // R$ 100 bilhões: barra valores absurdos/digitação errada.

const uuid = z.uuid("Identificador inválido");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida");
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
  }, "Data inválida");
const positiveCents = z.number().int().positive("Informe um valor maior que zero").max(MAX_CENTS, "Valor alto demais");
const money = (msg = "Valor inválido") =>
  z.string().refine((s) => parseBRL(s) !== null, msg);

// ---------------------------------------------------------------- Contas
export const accountInput = z.object({
  id: uuid.nullable(),
  scope: z.enum(SCOPES),
  name: z.string().trim().min(1, "Informe o nome").max(60),
  institution: z.string().trim().max(60),
  type: z.enum(ACCOUNT_TYPES),
  initialBalanceCents: z.number().int().min(-MAX_CENTS).max(MAX_CENTS),
  color,
  archived: z.boolean(),
  yieldAnnualBp: z.number().int().min(0).max(10000).nullable(),
  yieldCdiBp: z.number().int().min(0).max(50000).nullable(),
});
export type AccountInput = z.infer<typeof accountInput>;

// ---------------------------------------------------------------- Categorias
export const categoryInput = z.object({
  id: uuid.nullable(),
  scope: z.enum(SCOPES),
  kind: z.enum(["income", "expense"]),
  name: z.string().trim().min(1, "Informe o nome").max(40),
  parentId: uuid.nullable(),
  color,
});
export type CategoryInput = z.infer<typeof categoryInput>;

// ---------------------------------------------------------------- Transferências
export const transferInput = z
  .object({
    id: uuid.nullable(),
    fromAccountId: uuid,
    toAccountId: uuid,
    amountCents: positiveCents,
    occurredOn: isoDate,
    description: z.string().trim().max(140),
    idempotencyKey: uuid,
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    path: ["toAccountId"],
    message: "Escolha contas diferentes",
  });
export type TransferInput = z.infer<typeof transferInput>;

// ---------------------------------------------------------------- Lançamentos
export const transactionInput = z.object({
  id: uuid.nullable(),
  scope: z.enum(SCOPES),
  type: z.enum(["income", "expense"]),
  amountCents: positiveCents,
  description: z.string().trim().min(1, "Informe a descrição").max(140),
  categoryId: uuid.nullable(),
  occurredOn: isoDate,
  accountId: uuid,
  status: z.enum(["paid", "pending"]),
  responsibleUserId: uuid.nullable(),
  isFixed: z.boolean(),
  notes: z.string().trim().max(1000),
  splits: z.array(z.object({ userId: uuid, amountCents: z.number().int().min(0) })).max(2),
  idempotencyKey: uuid,
});
export type TransactionInput = z.infer<typeof transactionInput>;

export const SPLIT_MODES = ["none", "equal", "percent", "amount"] as const;

/** O que o formulário de lançamento/transferência guarda (texto como digitado). */
export const entryForm = z.object({
  kind: z.enum(["expense", "income", "transfer"]),
  scope: z.enum(SCOPES),
  amount: money("Informe um valor, ex.: 1.234,56"),
  description: z.string().max(140),
  categoryId: z.string(),
  occurredOn: isoDate,
  accountId: z.string(),
  toAccountId: z.string(),
  status: z.enum(["paid", "pending"]),
  responsibleUserId: z.string(),
  isFixed: z.boolean(),
  notes: z.string().max(1000),
  splitMode: z.enum(SPLIT_MODES),
  /** Parte da 1ª pessoa: percentual ("60" ou "33,5") ou valor ("12,50"), conforme o modo. */
  splitShare: z.string(),
});
export type EntryForm = z.infer<typeof entryForm>;

type Member = { userId: string };

/** Converte a divisão escolhida em centavos por pessoa. Lança erro com mensagem amigável. */
export function computeSplits(
  totalCents: number,
  mode: EntryForm["splitMode"],
  share: string,
  members: Member[],
): { userId: string; amountCents: number }[] {
  if (mode === "none") return [];
  if (members.length !== 2) throw new Error("A divisão precisa de duas pessoas no espaço");
  const [a, b] = members;
  if (mode === "equal") {
    const [x, y] = splitByWeights(totalCents, [1, 1]);
    return [
      { userId: a.userId, amountCents: x },
      { userId: b.userId, amountCents: y },
    ];
  }
  if (mode === "percent") {
    // Percentual com até 2 casas, convertido em pontos-base (60,5% = 6050) sem float.
    const bp = parseBRL(share);
    if (bp === null || bp < 0 || bp > 10000) throw new Error("Percentual deve ficar entre 0 e 100");
    const [x, y] = splitByWeights(totalCents, [bp, 10000 - bp]);
    return [
      { userId: a.userId, amountCents: x },
      { userId: b.userId, amountCents: y },
    ];
  }
  const first = parseBRL(share);
  if (first === null || first < 0 || first > totalCents) throw new Error("A parte da primeira pessoa deve ficar entre zero e o total");
  return [
    { userId: a.userId, amountCents: first },
    { userId: b.userId, amountCents: totalCents - first },
  ];
}

/** Monta o Input do servidor a partir do formulário (receita/despesa). */
export function toTransactionInput(
  form: EntryForm,
  ctx: { id: string | null; idempotencyKey: string; members: Member[] },
): TransactionInput {
  const amountCents = parseBRL(form.amount) ?? 0;
  const shared = form.scope === "shared" && form.kind === "expense";
  return {
    id: ctx.id,
    scope: form.scope,
    type: form.kind === "income" ? "income" : "expense",
    amountCents,
    description: form.description,
    categoryId: form.categoryId || null,
    occurredOn: form.occurredOn,
    accountId: form.accountId,
    status: form.status,
    responsibleUserId: form.responsibleUserId || null,
    isFixed: form.isFixed,
    notes: form.notes,
    splits: shared ? computeSplits(amountCents, form.splitMode, form.splitShare, ctx.members) : [],
    idempotencyKey: ctx.idempotencyKey,
  };
}

export function toTransferInput(form: EntryForm, ctx: { id: string | null; idempotencyKey: string }): TransferInput {
  return {
    id: ctx.id,
    fromAccountId: form.accountId,
    toAccountId: form.toAccountId,
    amountCents: parseBRL(form.amount) ?? 0,
    occurredOn: form.occurredOn,
    description: form.description,
    idempotencyKey: ctx.idempotencyKey,
  };
}

// ---------------------------------------------------------------- Cartões
export const CARD_BRAND_VALUES = ["visa", "mastercard", "elo", "amex", "hipercard", "other"] as const;
const day = z.number().int().min(1, "Dia entre 1 e 31").max(31, "Dia entre 1 e 31");

export const cardInput = z.object({
  id: uuid.nullable(),
  scope: z.enum(SCOPES),
  name: z.string().trim().min(1, "Informe o nome").max(60),
  institution: z.string().trim().max(60),
  brand: z.enum(CARD_BRAND_VALUES),
  // Só os 4 últimos dígitos, nunca o número completo.
  lastFour: z.string().regex(/^(\d{4})?$/, "Use só os 4 últimos dígitos"),
  limitCents: z.number().int().min(0).max(MAX_CENTS),
  closingDay: day,
  dueDay: day,
  color,
  archived: z.boolean(),
});
export type CardInput = z.infer<typeof cardInput>;

export const purchaseInput = z.object({
  cardId: uuid,
  description: z.string().trim().min(1, "Informe a descrição").max(140),
  totalCents: positiveCents,
  installments: z.number().int().min(1, "Mínimo 1").max(72, "Máximo 72"),
  purchasedOn: isoDate,
  categoryId: uuid.nullable(),
  idempotencyKey: uuid,
});
export type PurchaseInput = z.infer<typeof purchaseInput>;

export const paymentInput = z.object({
  statementId: uuid,
  accountId: uuid,
  amountCents: positiveCents,
  paidOn: isoDate,
  idempotencyKey: uuid,
});
export type PaymentInput = z.infer<typeof paymentInput>;

// ---------------------------------------------------------------- Planejamento
export const ruleInput = z
  .object({
    id: uuid.nullable(),
    scope: z.enum(SCOPES),
    type: z.enum(["income", "expense"]),
    description: z.string().trim().min(1, "Informe a descrição").max(140),
    amountCents: positiveCents,
    categoryId: uuid.nullable(),
    accountId: uuid.nullable(),
    frequency: z.enum(["weekly", "monthly", "yearly"]),
    intervalCount: z.number().int().min(1).max(12),
    startOn: isoDate,
    endOn: isoDate.nullable(),
  })
  .refine((v) => !v.endOn || v.endOn >= v.startOn, { path: ["endOn"], message: "O término deve ser depois do início" });
export type RuleInput = z.infer<typeof ruleInput>;

export const occurrencePayInput = z.object({
  ruleId: uuid,
  dueOn: isoDate,
  accountId: uuid,
  amountCents: positiveCents,
  paidOn: isoDate,
});

export const goalInput = z.object({
  id: uuid.nullable(),
  scope: z.enum(SCOPES),
  name: z.string().trim().min(1, "Informe o nome").max(60),
  targetCents: positiveCents,
  deadline: isoDate.nullable(),
  color,
});

export const goalMovementInput = z.object({
  goalId: uuid,
  kind: z.enum(["deposit", "withdrawal"]),
  amountCents: positiveCents,
  occurredOn: isoDate,
  notes: z.string().trim().max(280),
  idempotencyKey: uuid,
});

export const budgetInput = z.object({
  id: uuid.nullable(),
  scope: z.enum(SCOPES),
  categoryId: uuid,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido"),
  plannedCents: z.number().int().min(0).max(MAX_CENTS),
});

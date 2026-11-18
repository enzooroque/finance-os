import { describe, expect, it } from "vitest";
import { computeSplits, entryForm, toTransactionInput, transactionInput, transferInput, type EntryForm } from "./finance";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ACC = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";
const members = [{ userId: A }, { userId: B }];

const form = (over: Partial<EntryForm> = {}): EntryForm => ({
  kind: "expense",
  scope: "shared",
  amount: "100,01",
  description: "Mercado",
  categoryId: "",
  occurredOn: "2026-11-15",
  accountId: ACC,
  toAccountId: "",
  status: "paid",
  responsibleUserId: A,
  isFixed: false,
  notes: "",
  splitMode: "none",
  splitShare: "",
  ...over,
});

describe("divisão de despesa", () => {
  it("meio a meio com centavo ímpar fecha a soma", () => {
    expect(computeSplits(10001, "equal", "", members)).toEqual([
      { userId: A, amountCents: 5001 },
      { userId: B, amountCents: 5000 },
    ]);
  });
  it("percentual com vírgula (33,5%)", () => {
    const s = computeSplits(10000, "percent", "33,5", members);
    expect(s.map((x) => x.amountCents)).toEqual([3350, 6650]);
  });
  it("por valor: a segunda pessoa fica com o resto", () => {
    expect(computeSplits(10000, "amount", "25,00", members).map((x) => x.amountCents)).toEqual([2500, 7500]);
  });
  it("recusa percentual > 100, valor > total e espaço sem 2 pessoas", () => {
    expect(() => computeSplits(1000, "percent", "120", members)).toThrow(/entre 0 e 100/);
    expect(() => computeSplits(1000, "amount", "20,00", members)).toThrow(/entre zero e o total/);
    expect(() => computeSplits(1000, "equal", "", [{ userId: A }])).toThrow(/duas pessoas/);
  });
});

describe("formulário -> dados do servidor", () => {
  it("converte reais em centavos e monta a divisão", () => {
    const input = toTransactionInput(form({ splitMode: "equal" }), { id: null, idempotencyKey: KEY, members });
    expect(input.amountCents).toBe(10001);
    expect(input.splits).toHaveLength(2);
    expect(transactionInput.safeParse(input).success).toBe(true);
  });
  it("lançamento pessoal ou receita nunca leva divisão", () => {
    expect(toTransactionInput(form({ scope: "personal", splitMode: "equal" }), { id: null, idempotencyKey: KEY, members }).splits).toEqual([]);
    expect(toTransactionInput(form({ kind: "income", splitMode: "equal" }), { id: null, idempotencyKey: KEY, members }).splits).toEqual([]);
  });
  it("servidor recusa valor zero, data inexistente e descrição vazia", () => {
    const ok = toTransactionInput(form(), { id: null, idempotencyKey: KEY, members });
    expect(transactionInput.safeParse({ ...ok, amountCents: 0 }).success).toBe(false);
    expect(transactionInput.safeParse({ ...ok, occurredOn: "2026-02-30" }).success).toBe(false);
    expect(transactionInput.safeParse({ ...ok, description: "   " }).success).toBe(false);
    expect(transactionInput.safeParse({ ...ok, amountCents: 10.5 }).success).toBe(false);
  });
  it("formulário recusa valor digitado inválido", () => {
    expect(entryForm.safeParse(form({ amount: "12,345" })).success).toBe(false);
    expect(entryForm.safeParse(form({ amount: "abc" })).success).toBe(false);
  });
  it("transferência exige contas diferentes", () => {
    const base = { id: null, fromAccountId: ACC, toAccountId: ACC, amountCents: 100, occurredOn: "2026-11-15", description: "", idempotencyKey: KEY };
    expect(transferInput.safeParse(base).success).toBe(false);
    expect(transferInput.safeParse({ ...base, toAccountId: A }).success).toBe(true);
  });
});

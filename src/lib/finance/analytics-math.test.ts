import { describe, expect, it } from "vitest";
import { balanceHistory, centsToCsv, csvCell, expensesByCategory, lastMonths, monthlyTotals, percentChange, toCsv } from "./analytics-math";

const tx = (type: "income" | "expense", cents: number, date: string, category_id: string | null = null) => ({
  type,
  amount_cents: cents,
  occurred_on: date,
  category_id,
});

describe("séries mensais", () => {
  it("últimos meses virando o ano", () => {
    expect(lastMonths("2027-02", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
  it("soma receitas e despesas por mês e ignora fora da janela", () => {
    const r = monthlyTotals([tx("income", 1000, "2026-12-05"), tx("expense", 300, "2026-12-31"), tx("expense", 99, "2026-10-01")], ["2026-11", "2026-12"]);
    expect(r).toEqual([
      { month: "2026-11", income: 0, expense: 0 },
      { month: "2026-12", income: 1000, expense: 300 },
    ]);
  });
});

describe("despesas por categoria", () => {
  const cats = [
    { id: "a", name: "Mercado", parentId: null },
    { id: "a1", name: "Feira", parentId: "a" },
    { id: "b", name: "Lazer", parentId: null },
  ];
  it("subcategoria soma na mãe; sem categoria tem grupo próprio; ordena", () => {
    const r = expensesByCategory([tx("expense", 100, "2026-11-01", "a"), tx("expense", 50, "2026-11-01", "a1"), tx("expense", 70, "2026-11-01", null), tx("income", 999, "2026-11-01", "b")], cats);
    expect(r).toEqual([
      { name: "Mercado", cents: 150 },
      { name: "Sem categoria", cents: 70 },
    ]);
  });
  it("agrupa o excesso em Outras", () => {
    const rows = ["a", "b", null].map((c, i) => tx("expense", 100 - i, "2026-11-01", c));
    expect(expensesByCategory(rows, cats, 2)).toEqual([
      { name: "Mercado", cents: 100 },
      { name: "Outras", cents: 99 + 98 },
    ]);
  });
});

describe("evolução do saldo", () => {
  it("anda para trás a partir do saldo atual", () => {
    const net = new Map([
      ["2026-10", 500],
      ["2026-11", -200],
    ]);
    expect(balanceHistory(1000, ["2026-09", "2026-10", "2026-11"], net, "2026-11-15")).toEqual([700, 1200, 1000]);
  });
  it("lista terminando no passado desconta os meses seguintes", () => {
    const net = new Map([["2026-11", -200]]);
    expect(balanceHistory(1000, ["2026-10"], net, "2026-11-15")).toEqual([1200]);
  });
});

describe("comparação e CSV", () => {
  it("variação percentual", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 0)).toBeNull();
  });
  it("célula protege contra fórmula e escapa separador/aspas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
    expect(csvCell(null)).toBe("");
    expect(csvCell("-50,00")).toBe("-50,00");
    expect(csvCell("-1+1")).toBe("'-1+1");
  });
  it("valores no padrão brasileiro e BOM", () => {
    expect(centsToCsv(-12345)).toBe("-123,45");
    expect(toCsv(["a"], [["x"]]).startsWith("﻿a\r\nx")).toBe(true);
  });
});

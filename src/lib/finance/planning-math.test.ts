import { describe, expect, it } from "vitest";
import { budgetLevel, monthlyNeeded, monthsToFinish, occurrenceDates } from "./planning-math";

describe("datas de recorrência", () => {
  it("mensal no dia 31 respeita meses curtos e volta ao 31", () => {
    expect(occurrenceDates({ startOn: "2026-01-31", endOn: null, frequency: "monthly", intervalCount: 1 }, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });
  it("semanal, a cada 2 semanas, só dentro da janela", () => {
    expect(occurrenceDates({ startOn: "2026-11-02", endOn: null, frequency: "weekly", intervalCount: 2 }, "2026-11-10", "2026-12-01")).toEqual([
      "2026-11-16",
      "2026-11-30",
    ]);
  });
  it("respeita a data de término e o ano bissexto (anual)", () => {
    expect(occurrenceDates({ startOn: "2028-02-29", endOn: "2030-12-31", frequency: "yearly", intervalCount: 1 }, "2028-01-01", "2032-12-31")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
    ]);
  });
});

describe("metas", () => {
  it("aporte mensal necessário arredonda para cima", () => {
    expect(monthlyNeeded(100000, "2026-11-15", "2027-02-01")).toBe(33334);
    expect(monthlyNeeded(100000, "2026-11-15", "2026-11-30")).toBe(100000);
    expect(monthlyNeeded(0, "2026-11-15", "2027-02-01")).toBeNull();
  });
  it("estimativa de conclusão no ritmo atual", () => {
    expect(monthsToFinish(100000, 30000)).toBe(4);
    expect(monthsToFinish(100000, 0)).toBeNull();
  });
});

describe("orçamento", () => {
  it("avisa em 80% e estoura acima de 100%", () => {
    expect(budgetLevel(7999, 10000)).toBe("ok");
    expect(budgetLevel(8000, 10000)).toBe("warning");
    expect(budgetLevel(10000, 10000)).toBe("warning");
    expect(budgetLevel(10001, 10000)).toBe("over");
  });
});

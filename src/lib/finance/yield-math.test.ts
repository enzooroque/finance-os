import { describe, expect, it } from "vitest";
import { bankHolidays, businessDays, effectiveAnnualBp, isBusinessDay, yieldCents } from "./yield-math";

describe("dias úteis", () => {
  it("feriados móveis de 2026: Carnaval 16-17/02, Sexta Santa 03/04, Corpus Christi 04/06", () => {
    const h = bankHolidays(2026);
    for (const d of ["2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2026-11-20", "2026-12-25"]) expect(h.has(d)).toBe(true);
  });
  it("fim de semana e feriado não são dia útil", () => {
    expect(isBusinessDay("2026-11-14")).toBe(false); // sábado
    expect(isBusinessDay("2026-11-20")).toBe(false); // Consciência Negra
    expect(isBusinessDay("2026-11-16")).toBe(true);
  });
  it("novembro/2026 tem 19 dias úteis", () => {
    // 30 dias, 9 sábados/domingos, feriados 02/11 (seg) e 20/11 (sex); 15/11 cai no domingo.
    expect(businessDays("2026-11-01", "2026-11-30")).toBe(19);
  });
});

describe("rendimento estimado", () => {
  it("R$ 6.000 a 10,40% a.a. rende ~R$ 2,36 por dia útil", () => {
    expect(yieldCents(600000, 1040, 1)).toBe(236);
  });
  it("252 dias úteis dão exatamente a taxa anual", () => {
    expect(yieldCents(1000000, 1000, 252)).toBe(100000);
  });
  it("sem saldo, taxa ou dias, rende zero", () => {
    expect(yieldCents(0, 1040, 10)).toBe(0);
    expect(yieldCents(-500, 1040, 10)).toBe(0);
    expect(yieldCents(1000, 0, 10)).toBe(0);
  });
});

describe("taxa efetiva", () => {
  it("102% do CDI com CDI a 13,65% = 13,92% a.a.", () => {
    expect(effectiveAnnualBp({ yieldAnnualBp: null, yieldCdiBp: 10200 }, 1365)).toBe(1392);
  });
  it("taxa fixa ignora o CDI; sem CDI disponível não estima", () => {
    expect(effectiveAnnualBp({ yieldAnnualBp: 650, yieldCdiBp: null }, 1365)).toBe(650);
    expect(effectiveAnnualBp({ yieldAnnualBp: null, yieldCdiBp: 10000 }, null)).toBeNull();
  });
});

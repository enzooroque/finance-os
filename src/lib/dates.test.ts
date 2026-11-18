import { describe, expect, it } from "vitest";
import { addMonthsClamped, formatDate, monthStart, todayISO } from "./dates";

describe("formatDate", () => {
  it("usa DD/MM/AAAA sem deslocar o dia por fuso", () => {
    expect(formatDate("2026-03-09")).toBe("09/03/2026");
    expect(formatDate("2026-12-31")).toBe("31/12/2026");
  });
  it("rejeita formatos inválidos", () => {
    expect(() => formatDate("09/03/2026")).toThrow();
  });
});

describe("todayISO (America/Sao_Paulo)", () => {
  it("às 01:30 UTC ainda é o dia anterior em São Paulo", () => {
    expect(todayISO(new Date("2026-01-01T01:30:00Z"))).toBe("2025-12-31");
  });
  it("às 03:00 UTC já é o mesmo dia em São Paulo", () => {
    expect(todayISO(new Date("2026-01-01T03:00:00Z"))).toBe("2026-01-01");
  });
});

describe("addMonthsClamped (virada de mês)", () => {
  it("31/01 + 1 mês = último dia de fevereiro", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29"); // bissexto
  });
  it("vira o ano", () => {
    expect(addMonthsClamped("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsClamped("2026-01-15", -1)).toBe("2025-12-15");
  });
  it("mantém o dia âncora em sequências (não 'encolhe' para 28 para sempre)", () => {
    expect(addMonthsClamped("2026-02-28", 1, 31)).toBe("2026-03-31");
  });
});

describe("monthStart", () => {
  it("retorna o primeiro dia do mês", () => {
    expect(monthStart("2026-03-09")).toBe("2026-03-01");
  });
});

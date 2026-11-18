import { describe, expect, it } from "vitest";
import { statementState } from "./statement";

const s = (totalCents: number, paidCents: number) => ({ closingDate: "2026-11-05", totalCents, paidCents });

describe("situação da fatura", () => {
  it("antes do fechamento está aberta; depois, fechada", () => {
    expect(statementState(s(1000, 0), "2026-11-04")).toBe("open");
    expect(statementState(s(1000, 0), "2026-11-05")).toBe("closed");
  });
  it("paga em parte e paga", () => {
    expect(statementState(s(1000, 400), "2026-11-10")).toBe("partial");
    expect(statementState(s(1000, 1000), "2026-11-10")).toBe("paid");
    expect(statementState(s(1000, 1000), "2026-11-01")).toBe("paid");
    expect(statementState(s(1000, 400), "2026-11-01")).toBe("partial");
  });
  it("fechada sem gastos", () => {
    expect(statementState(s(0, 0), "2026-11-10")).toBe("empty");
  });
});

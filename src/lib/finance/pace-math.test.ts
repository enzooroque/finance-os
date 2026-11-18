import { describe, expect, it } from "vitest";
import { monthPace } from "./pace-math";

const base = { limitCents: 300000, month: "2026-11", today: "2026-11-16" };

describe("ritmo do mês", () => {
  it("no dia 16 de 30, gastar menos que a metade está no ritmo", () => {
    const p = monthPace({ ...base, spentCents: 100000 });
    expect(p).toMatchObject({ status: "ok", remainingCents: 200000, daysLeft: 15, usedPct: 33 });
    expect(p.dailyCents).toBe(13333);
  });
  it("gastando acima do esperado fica acima do ritmo", () => {
    expect(monthPace({ ...base, spentCents: 200000 }).status).toBe("ahead");
  });
  it("passou do limite: estourou, sem valor por dia", () => {
    expect(monthPace({ ...base, spentCents: 310000 })).toMatchObject({ status: "over", dailyCents: 0, usedPct: 100 });
  });
  it("mês passado não tem dias restantes; início do mês é 'mês novo'", () => {
    expect(monthPace({ ...base, month: "2026-10", spentCents: 0 }).daysLeft).toBe(0);
    expect(monthPace({ ...base, today: "2026-11-02", spentCents: 0 }).isNewMonth).toBe(true);
  });
});

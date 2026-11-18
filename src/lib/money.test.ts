import { describe, expect, it } from "vitest";
import { centsToInput, formatBRL, parseBRL, splitByWeights, splitCents } from "./money";

describe("centsToInput", () => {
  it.each([
    [123456, "1234,56"],
    [5, "0,05"],
    [-5, "-0,05"],
    [0, "0,00"],
  ])("%i -> %s e volta igual pelo parseBRL", (cents, text) => {
    expect(centsToInput(cents)).toBe(text);
    expect(parseBRL(text)).toBe(cents);
  });
});

describe("splitByWeights (divisão por percentual)", () => {
  it("60/40 de R$ 100,01 fecha a soma", () => {
    const parts = splitByWeights(10001, [6000, 4000]);
    expect(parts).toEqual([6001, 4000]);
    expect(parts[0] + parts[1]).toBe(10001);
  });
  it("divisão igual entre 3 com sobra", () => {
    expect(splitByWeights(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });
  it("valida pesos", () => {
    expect(() => splitByWeights(100, [0, 0])).toThrow();
    expect(() => splitByWeights(100, [-1, 2])).toThrow();
  });
});

describe("formatBRL", () => {
  it("formata centavos em reais no padrão brasileiro", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(5)).toBe("R$ 0,05");
    expect(formatBRL(-1990)).toBe("-R$ 19,90");
  });
  it("rejeita valores que não são centavos inteiros", () => {
    expect(() => formatBRL(10.5)).toThrow();
  });
});

describe("parseBRL", () => {
  it.each([
    ["1.234,56", 123456],
    ["R$ 10", 1000],
    ["10,5", 1050],
    ["0,01", 1],
    ["-5,50", -550],
    ["1234567,89", 123456789],
  ])("%s -> %i centavos", (input, cents) => {
    expect(parseBRL(input)).toBe(cents);
  });
  it.each(["", "abc", "1,234", "12.34", "1.23,00", "10,"])("rejeita %j", (input) => {
    expect(parseBRL(input)).toBeNull();
  });
  it("não sofre erro de float (0,1 + 0,2)", () => {
    expect(parseBRL("0,10")! + parseBRL("0,20")!).toBe(30);
  });
});

describe("splitCents", () => {
  it("R$ 1.200 em 12x dá 12 parcelas de R$ 100", () => {
    expect(splitCents(120000, 12)).toEqual(Array(12).fill(10000));
  });
  it("sobra de centavos vai para as primeiras parcelas e a soma fecha", () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
    const parts = splitCents(99999, 7);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(99999);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
  });
  it("valida entradas", () => {
    expect(() => splitCents(100, 0)).toThrow();
    expect(() => splitCents(-100, 2)).toThrow();
  });
});

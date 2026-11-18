/**
 * Dinheiro é sempre representado em CENTAVOS INTEIROS (number seguro até 2^53).
 * Nunca some/subtraia valores em reais com float. Converta para reais só na exibição.
 */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number): string {
  assertCents(cents);
  // Intl troca o espaço comum por NBSP; normalizamos para facilitar testes/cópia.
  return brl.format(cents / 100).replace(/ /g, " ");
}

/**
 * Converte texto digitado pelo usuário ("1.234,56", "R$ 10", "-5,5") em centavos.
 * Retorna null se o texto não for um valor válido (ex.: mais de 2 casas decimais).
 * Faz a conversão por string, sem passar por float.
 */
export function parseBRL(input: string): number | null {
  const cleaned = input.replace(/R\$|\s| /g, "");
  const match = /^(-)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign, intPart, decPart = ""] = match;
  const cents = Number(intPart.replace(/\./g, "")) * 100 + Number(decPart.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return sign && cents !== 0 ? -cents : cents;
}

/**
 * Divide um total em N parcelas inteiras cuja soma é exatamente o total.
 * Regra: os centavos que sobram vão para as PRIMEIRAS parcelas
 * (ex.: R$ 10,00 em 3x = 3,34 + 3,33 + 3,33).
 */
export function splitCents(totalCents: number, parts: number): number[] {
  assertCents(totalCents);
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError("parts deve ser inteiro >= 1");
  if (totalCents < 0) throw new RangeError("total deve ser >= 0");
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Divide um total proporcionalmente a pesos inteiros (ex.: percentuais em pontos-base,
 * 6000/4000 = 60%/40%). Método do maior resto: a soma sempre fecha com o total.
 */
export function splitByWeights(totalCents: number, weights: number[]): number[] {
  assertCents(totalCents);
  if (totalCents < 0) throw new RangeError("total deve ser >= 0");
  if (!weights.length || weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new RangeError("pesos devem ser inteiros >= 0");
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new RangeError("a soma dos pesos deve ser > 0");
  // shortcut: exato enquanto total*peso < 2^53 (≈ R$ 9 bilhões com pesos até 10.000); suficiente aqui.
  const exact = weights.map((w) => (totalCents * w) / sum);
  const parts = exact.map(Math.floor);
  let remainder = totalCents - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (remainder-- <= 0) break;
    parts[i] += 1;
  }
  return parts;
}

/** Centavos -> texto editável sem "R$" (123456 -> "1234,56", -5 -> "-0,05"). Sem float. */
export function centsToInput(cents: number): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function assertCents(value: number) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`Valor em centavos inválido: ${value}`);
}

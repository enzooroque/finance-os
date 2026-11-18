/**
 * Rendimento estimado de conta (juros compostos por dia útil, base 252, como CDI/CDB no Brasil).
 * É ESTIMATIVA bruta (antes de IR): o valor real vem do banco e é lançado pela pessoa.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (s: string) => new Date(`${s}T00:00:00Z`);

/** Domingo de Páscoa (algoritmo de Meeus/Butcher). */
function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const holidayCache = new Map<number, Set<string>>();

/** Feriados bancários nacionais (Carnaval, Sexta-feira Santa e Corpus Christi incluídos). */
export function bankHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const e = easter(year).getTime();
  const shift = (days: number) => iso(new Date(e + days * 864e5));
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${year}-${md}`);
  const set = new Set([...fixed, shift(-48), shift(-47), shift(-2), shift(60)]);
  holidayCache.set(year, set);
  return set;
}

export function isBusinessDay(date: string): boolean {
  const dow = utc(date).getUTCDay();
  return dow !== 0 && dow !== 6 && !bankHolidays(Number(date.slice(0, 4))).has(date);
}

/** Dias úteis entre `from` e `to`, inclusive. */
export function businessDays(from: string, to: string): number {
  let count = 0;
  for (let t = utc(from).getTime(), end = utc(to).getTime(); t <= end; t += 864e5) {
    if (isBusinessDay(iso(new Date(t)))) count++;
  }
  return count;
}

/** Rendimento estimado em centavos para `days` dias úteis, com taxa anual em pontos-base (1040 = 10,40% a.a.). */
export function yieldCents(balanceCents: number, annualBp: number, days: number): number {
  if (balanceCents <= 0 || annualBp <= 0 || days <= 0) return 0;
  // Float só no fator; o resultado volta arredondado para centavos inteiros.
  return Math.round(balanceCents * (Math.pow(1 + annualBp / 10000, days / 252) - 1));
}

/** Taxa anual efetiva da conta: "% do CDI" (usa o CDI do dia) ou taxa fixa ao ano. Null = sem rendimento/sem CDI. */
export function effectiveAnnualBp(a: { yieldAnnualBp: number | null; yieldCdiBp: number | null }, cdiBp: number | null): number | null {
  if (a.yieldCdiBp) return cdiBp ? Math.round((cdiBp * a.yieldCdiBp) / 10000) : null;
  return a.yieldAnnualBp || null;
}

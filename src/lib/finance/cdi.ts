import "server-only";
import { cacheLife } from "next/cache";

/**
 * CDI anualizado (base 252) mais recente do Banco Central (série SGS 4389), em pontos-base.
 * Dado público; guardado em cache por horas. Retorna null se o BC estiver fora do ar.
 */
export async function getCdiAnnualBp(): Promise<{ bp: number; date: string } | null> {
  "use cache";
  cacheLife("hours");
  try {
    const res = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const [last] = (await res.json()) as { data: string; valor: string }[];
    const bp = Math.round(Number(last.valor.replace(",", ".")) * 100);
    return Number.isFinite(bp) && bp > 0 && bp < 10000 ? { bp, date: last.data } : null;
  } catch {
    return null;
  }
}

/**
 * Datas financeiras são "datas de calendário" (YYYY-MM-DD), sem hora e sem fuso,
 * iguais ao tipo `date` do Postgres. Assim uma compra do dia 31 nunca "pula" de dia
 * por causa de fuso horário. O "hoje" é sempre calculado em America/Sao_Paulo.
 */
import { appConfig } from "@/config/app";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(isoDate: string): [number, number, number] {
  const m = ISO_DATE.exec(isoDate);
  if (!m) throw new TypeError(`Data inválida (esperado YYYY-MM-DD): ${isoDate}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "2026-03-09" -> "09/03/2026" */
export function formatDate(isoDate: string): string {
  const [y, m, d] = parts(isoDate);
  return `${pad(d)}/${pad(m)}/${pad(y, 4)}`;
}

/** Data de hoje no fuso de São Paulo, como YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: appConfig.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Soma meses mantendo o dia, mas limitando ao último dia do mês de destino.
 * Ex.: 31/01 + 1 mês = 28/02 (ou 29/02 em ano bissexto). Base de parcelas e recorrências.
 */
export function addMonthsClamped(isoDate: string, months: number, anchorDay?: number): string {
  const [y, m, d] = parts(isoDate);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(ty, tm));
  return `${pad(ty, 4)}-${pad(tm)}-${pad(day)}`;
}

/** Primeiro dia do mês da data: "2026-03-09" -> "2026-03-01" (chave de orçamentos/faturas). */
export function monthStart(isoDate: string): string {
  const [y, m] = parts(isoDate);
  return `${pad(y, 4)}-${pad(m)}-01`;
}

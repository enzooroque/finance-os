import { getReportRows } from "@/lib/finance/analytics";
import { centsToCsv, toCsv } from "@/lib/finance/analytics-math";
import { getViewContext } from "@/lib/finance/queries";
import { formatDate, todayISO } from "@/lib/dates";
import { parseMonth } from "@/components/finance/bits";

/** CSV dos lançamentos do período, na visão escolhida (respeita login, visão e RLS). */
export async function GET(request: Request) {
  const ctx = await getViewContext(); // exige login; sem sessão, redireciona
  const url = new URL(request.url);
  const today = todayISO();
  let from = parseMonth(url.searchParams.get("de"), today);
  let to = parseMonth(url.searchParams.get("ate"), today);
  if (from > to) [from, to] = [to, from];
  const rows = await getReportRows(ctx, from, to);
  const csv = toCsv(
    ["Data", "Tipo", "Descrição", "Valor (R$)", "Situação", "Categoria", "Conta/Cartão", "Pessoa", "Titularidade"],
    rows.map((r) => [
      formatDate(r.date),
      r.type === "income" ? "Receita" : "Despesa",
      r.description,
      centsToCsv(r.type === "income" ? r.amountCents : -r.amountCents),
      r.isCard ? "Cartão" : r.status === "paid" ? "Pago" : "Pendente",
      r.category,
      r.source,
      r.person,
      r.scope,
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance-os_${ctx.view}_${from}_a_${to}.csv"`,
      // Dados financeiros: nunca guardar em cache.
      "Cache-Control": "private, no-store",
    },
  });
}

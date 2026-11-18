import type { Metadata } from "next";
import { Download, FileBarChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseMonth } from "@/components/finance/bits";
import { CategoryBars } from "@/components/finance/charts";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { todayISO } from "@/lib/dates";
import { getReportRows, groupTotals } from "@/lib/finance/analytics";
import { getViewContext } from "@/lib/finance/queries";
import { VIEWS } from "@/lib/view";
import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react";

export const metadata: Metadata = { title: "Relatórios" };

export default async function RelatoriosPage({ searchParams }: PageProps<"/relatorios">) {
  const sp = await searchParams;
  const ctx = await getViewContext(); // primeiro: marca como "por requisição"
  const today = todayISO();
  let from = parseMonth(sp.de, today);
  let to = parseMonth(sp.ate, today);
  if (from > to) [from, to] = [to, from];
  const rows = await getReportRows(ctx, from, to);
  const income = rows.filter((r) => r.type === "income").reduce((s, r) => s + r.amountCents, 0);
  const expense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amountCents, 0);
  const viewLabel = VIEWS.find((v) => v.value === ctx.view)?.label;
  const blocks = [
    { title: "Despesas por categoria", data: groupTotals(rows, (r) => r.category) },
    { title: "Despesas por pessoa", data: groupTotals(rows, (r) => r.person) },
    { title: "Despesas por conta/cartão", data: groupTotals(rows, (r) => r.source) },
    { title: "Receitas por categoria", data: groupTotals(rows, (r) => r.category, "income") },
  ];

  return (
    <>
      <PageHeader title="Relatórios" description={`Visão ${viewLabel}. Troque a visão no topo para mudar o relatório.`} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-surface-1/60 p-3">
        <div className="grid gap-1.5">
          <Label htmlFor="de">De</Label>
          <Input id="de" name="de" type="month" defaultValue={from} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ate">Até</Label>
          <Input id="ate" name="ate" type="month" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit">Ver</Button>
        {rows.length > 0 && (
          <Button asChild variant="outline" className="sm:ml-auto">
            <a href={`/relatorios/exportar?de=${from}&ate=${to}`} download>
              <Download data-icon="inline-start" /> Exportar CSV
            </a>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={FileBarChart} title="Nenhum lançamento no período" description="Escolha outro período ou outra visão." />
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Receitas" cents={income} icon={ArrowUpRight} tone="positive" />
            <StatCard label="Despesas" cents={expense} icon={ArrowDownRight} tone="negative" />
            <StatCard label="Resultado" cents={income - expense} icon={Scale} tone={income - expense < 0 ? "negative" : "positive"} hint={`${rows.length} lançamentos`} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {blocks.map((b) => (
              <Card key={b.title}>
                <CardHeader>
                  <CardTitle>{b.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {b.data.length ? <CategoryBars data={b.data.slice(0, 8)} /> : <p className="text-sm text-muted-foreground">Sem dados.</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

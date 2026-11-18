import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Amount, MonthNav, parseMonth, ScopeBadge } from "@/components/finance/bits";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { addMonthsClamped, daysInMonth, formatDate, todayISO } from "@/lib/dates";
import { getOccurrences, getRules, type Occurrence } from "@/lib/finance/planning";
import { frequencyLabel } from "@/lib/finance/planning-math";
import { getEntryOptions, getViewContext } from "@/lib/finance/queries";
import type { EntryOptions } from "@/lib/finance/types";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { DeleteRuleButton, OccurrenceActions, RuleDialog } from "./bills-ui";

export const metadata: Metadata = { title: "Contas a pagar" };

const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];

function Row({ o, today, accounts }: { o: Occurrence; today: string; accounts: EntryOptions["accounts"] }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3", o.status === "skipped" && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{o.rule.description}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatDate(o.dueOn)} · {frequencyLabel[o.rule.frequency]}
          {o.rule.categoryName ? ` · ${o.rule.categoryName}` : ""}
          {o.status === "pending" && o.dueOn < today && <span className="text-negative"> · atrasada</span>}
          {o.amountCents !== o.rule.amountCents && " · valor ajustado"}
        </p>
      </div>
      <Amount cents={o.amountCents} kind={o.rule.type} className="text-sm" />
      <OccurrenceActions rule={o.rule} dueOn={o.dueOn} amountCents={o.amountCents} status={o.status} accounts={accounts} />
    </li>
  );
}

export default async function ContasAPagarPage({ searchParams }: PageProps<"/contas-a-pagar">) {
  const sp = await searchParams;
  const ctx = await getViewContext(); // primeiro: marca como "por requisição"
  const today = todayISO();
  const month = parseMonth(sp.mes, today);
  const [rules, options] = await Promise.all([getRules(ctx), getEntryOptions()]);
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
  // Atrasadas: até 12 meses para trás, ainda pendentes.
  const [items, past] = await Promise.all([
    getOccurrences(rules, first, last),
    getOccurrences(rules, addMonthsClamped(today, -12), today),
  ]);
  const overdue = past.filter((o) => o.status === "pending" && o.dueOn < today && o.dueOn < first);
  const defaultScope = ctx.view === "compartilhado" ? "shared" : "personal";
  const newButton = <RuleDialog options={options} defaultScope={defaultScope} />;

  const pendingOut = items.filter((o) => o.status === "pending" && o.rule.type === "expense").reduce((s, o) => s + o.amountCents, 0);
  const pendingIn = items.filter((o) => o.status === "pending" && o.rule.type === "income").reduce((s, o) => s + o.amountCents, 0);
  const byDay = new Map<string, Occurrence[]>();
  for (const o of items) byDay.set(o.dueOn, [...(byDay.get(o.dueOn) ?? []), o]);
  const offset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();

  return (
    <>
      <PageHeader title="Contas a pagar" description="Contas fixas, recorrências e vencimentos." actions={rules.length ? newButton : undefined} />
      {rules.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nenhuma conta fixa"
          description="Cadastre aluguel, luz, internet, assinaturas ou salário para ver os vencimentos do mês."
          action={newButton}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            {overdue.length > 0 && (
              <section className="mb-6">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-negative">
                  Em atraso <Badge variant="outline" className="text-negative">{overdue.length}</Badge>
                </h2>
                <ul className="divide-y overflow-hidden rounded-xl border border-negative/30 bg-card">
                  {overdue.map((o) => (
                    <Row key={`${o.ruleId}|${o.dueOn}`} o={o} today={today} accounts={options.accounts} />
                  ))}
                </ul>
              </section>
            )}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <MonthNav month={month} basePath="/contas-a-pagar" />
              <p className="text-xs text-muted-foreground">
                A pagar {formatBRL(pendingOut)} · a receber {formatBRL(pendingIn)}
              </p>
            </div>
            {items.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nada vence neste mês" />
            ) : (
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {items.map((o) => (
                  <Row key={`${o.ruleId}|${o.dueOn}`} o={o} today={today} accounts={options.accounts} />
                ))}
              </ul>
            )}
          </div>

          <aside className="grid content-start gap-4">
            <div className="rounded-xl border bg-card p-3" aria-label="Calendário do mês">
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
                {WEEK.map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`e${i}`} />
                ))}
                {Array.from({ length: daysInMonth(y, m) }, (_, i) => {
                  const date = `${month}-${String(i + 1).padStart(2, "0")}`;
                  const list = byDay.get(date) ?? [];
                  const late = list.some((o) => o.status === "pending" && date < today);
                  const open = list.some((o) => o.status === "pending");
                  return (
                    <span
                      key={date}
                      title={list.map((o) => `${o.rule.description}: ${formatBRL(o.amountCents)}`).join("\n") || undefined}
                      className={cn(
                        "relative grid aspect-square place-items-center rounded-md text-xs text-foreground",
                        date === today && "ring-1 ring-primary",
                        list.length > 0 && "bg-surface-2 font-medium",
                      )}
                    >
                      {i + 1}
                      {list.length > 0 && (
                        <span className={cn("absolute bottom-1 size-1 rounded-full", late ? "bg-negative" : open ? "bg-warning" : "bg-positive")} />
                      )}
                    </span>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">● amarelo a pagar · vermelho atrasada · verde paga</p>
            </div>
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Séries cadastradas</h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {rules.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{r.description}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatBRL(r.amountCents)} · {frequencyLabel[r.frequency]}
                        {r.endOn ? ` até ${formatDate(r.endOn)}` : ""}
                      </p>
                    </div>
                    <ScopeBadge scope={r.scope} />
                    <RuleDialog rule={r} options={options} defaultScope={defaultScope} />
                    <DeleteRuleButton rule={r} />
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

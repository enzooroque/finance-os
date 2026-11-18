import Link from "next/link";
import { Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { monthPace } from "@/lib/finance/pace-math";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BorderBeam } from "@/components/ui/border-beam";
import { MoneyTicker } from "./money-ticker";

const statusLabel = { ok: "No ritmo", ahead: "Acima do ritmo", over: "Estourou" } as const;
const statusColor = { ok: "var(--positive)", ahead: "var(--warning)", over: "var(--negative)" } as const;

/** "Pode gastar": quanto sobra do limite do mês (soma dos orçamentos), em anel, com o ritmo. */
export function SpendRing({ limitCents, spentCents, month, today }: { limitCents: number; spentCents: number; month: string; today: string }) {
  if (limitCents <= 0) {
    return (
      <Card className="flex-row items-center gap-3 px-4">
        <Gauge className="size-8 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          Defina limites em{" "}
          <Link href={`/orcamentos?mes=${month}`} className="text-primary hover:underline">
            Orçamentos
          </Link>{" "}
          para ver aqui quanto ainda pode gastar no mês e se está no ritmo.
        </p>
      </Card>
    );
  }

  const p = monthPace({ limitCents, spentCents, month, today });
  const r = 52;
  const arc = 2 * Math.PI * r * 0.75; // anel aberto embaixo (270°)
  const left = Math.max(0, 100 - p.usedPct);
  const message = p.status === "over"
    ? `Limite do mês estourado em ${formatBRL(-p.remainingCents)}. Segura os gastos variáveis até virar o mês.`
    : p.isNewMonth
      ? `Mês novo, limite cheio: ${formatBRL(limitCents)}. Respira antes de pedir delivery.`
      : p.status === "ahead"
        ? `Você está gastando mais rápido que o ritmo. Dá pra gastar ${formatBRL(p.dailyCents)} por dia até o fim do mês.`
        : p.daysLeft > 0
          ? `No ritmo: dá pra gastar ${formatBRL(p.dailyCents)} por dia nos próximos ${p.daysLeft} dias.`
          : `Mês fechado: sobraram ${formatBRL(p.remainingCents)} do limite.`;

  return (
    <Card className="relative items-center gap-2 px-4">
      <BorderBeam size={90} duration={9} colorFrom="#7c5cff" colorTo="#4a8ae0" />
      <p className="max-w-sm rounded-lg bg-surface-2 px-3 py-2 text-center text-xs">{message}</p>
      <div className="relative size-48" role="img" aria-label={`Pode gastar ${formatBRL(Math.max(0, p.remainingCents))} de ${formatBRL(limitCents)}`}>
        <svg viewBox="0 0 120 120" className="size-full -rotate-[225deg]">
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${arc} 999`} />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={statusColor[p.status]}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(arc * left) / 100} 999`}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground">Pode gastar</span>
          <MoneyTicker cents={Math.max(0, p.remainingCents)} className={cn("text-2xl font-semibold", p.status === "over" && "text-negative")} />
          <span className="text-[11px] text-muted-foreground">
            de {formatBRL(limitCents)}
            {p.daysLeft > 0 ? ` · ${p.daysLeft} dias` : ""}
          </span>
        </div>
      </div>
      <Badge variant="outline" style={{ color: statusColor[p.status] }}>
        {statusLabel[p.status]}
      </Badge>
      <p className="text-[11px] text-muted-foreground">Conta só os gastos do dia a dia (contas fixas ficam de fora).</p>
    </Card>
  );
}

/** "O mês em uma conta": entra − fixos − dia a dia = sobra (inclui o que ainda vai entrar/sair). */
export function MonthInOne({ inCents, fixedCents, variableCents, leftCents }: { inCents: number; fixedCents: number; variableCents: number; leftCents: number }) {
  const rows = [
    { label: "Entra", cents: inCents, sign: "+" },
    { label: "Fixos (contas do mês)", cents: fixedCents, sign: "−" },
    { label: "Dia a dia", cents: variableCents, sign: "−" },
  ];
  return (
    <Card className="gap-2 px-4">
      <p className="text-sm font-medium">O mês em uma conta</p>
      <dl className="grid gap-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="tabular">
              {r.sign} {formatBRL(r.cents)}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-2 border-t pt-2 font-medium">
          <dt>Sobra</dt>
          <dd className={cn("tabular", leftCents < 0 ? "text-negative" : "text-positive")}>{formatBRL(leftCents)}</dd>
        </div>
      </dl>
      <p className="text-[11px] text-muted-foreground">Conta também o que ainda vai entrar e sair neste mês (contas fixas pendentes).</p>
    </Card>
  );
}

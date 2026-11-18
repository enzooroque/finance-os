"use client";

import { useState } from "react";
import { CheckCircle2, Scale } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, parseBRL } from "@/lib/money";

/**
 * Conciliação: compara o saldo do app com o saldo que o banco mostra.
 * shortcut: só compara (não grava a conferência); marcar lançamentos conferidos fica para depois.
 */
export function ReconcileCard({ balanceCents, pendingCents }: { balanceCents: number; pendingCents: number }) {
  const [bank, setBank] = useState("");
  const bankCents = bank.trim() ? parseBRL(bank) : null;
  const diff = bankCents === null ? null : bankCents - balanceCents;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="size-4" /> Conferir com o banco
        </CardTitle>
        <CardDescription>Digite o saldo que aparece no app do banco hoje.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="bank-balance">Saldo no banco (R$)</Label>
          <Input id="bank-balance" inputMode="decimal" placeholder="0,00" value={bank} onChange={(e) => setBank(e.target.value)} />
          {bank.trim() && bankCents === null && <p className="text-xs text-negative">Valor inválido, ex.: 1.234,56</p>}
        </div>
        {diff !== null && (
          <div role="status" className="rounded-lg bg-surface-1 p-3 text-sm">
            {diff === 0 ? (
              <p className="flex items-center gap-2 text-positive">
                <CheckCircle2 className="size-4" /> Tudo certo: os saldos batem.
              </p>
            ) : (
              <>
                <p>
                  Diferença de <span className={diff > 0 ? "text-positive" : "text-negative"}>{formatBRL(diff)}</span>
                  {diff > 0 ? " a mais no banco." : " a menos no banco."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Confira lançamentos esquecidos ou ainda marcados como pendentes
                  {pendingCents !== 0 ? ` (pendentes nesta conta: ${formatBRL(pendingCents)})` : ""}.
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

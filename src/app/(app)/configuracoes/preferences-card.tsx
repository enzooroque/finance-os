"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { setFinanceView, useFinanceView } from "@/components/layout/use-finance-view";
import { VIEWS } from "@/lib/view";

export function PreferencesCard() {
  const view = useFinanceView();
  const router = useRouter();
  const label = VIEWS.find((v) => v.value === view)?.label;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências deste aparelho</CardTitle>
        <CardDescription>Ficam salvas só neste navegador. Não incluem dados financeiros.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Visão padrão: <span className="font-medium">{label}</span>
        </p>
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <RotateCcw data-icon="inline-start" />
              Restaurar padrões
            </Button>
          }
          title="Restaurar preferências?"
          description="A visão escolhida volta para “Consolidado”. Nenhum dado financeiro é apagado."
          confirmLabel="Restaurar"
          onConfirm={() => {
            setFinanceView(null);
            router.refresh();
            toast.success("Preferências restauradas");
          }}
        />
      </CardContent>
    </Card>
  );
}

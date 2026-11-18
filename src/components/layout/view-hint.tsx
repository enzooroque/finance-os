"use client";

import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { setFinanceView, useFinanceView } from "./use-finance-view";

/** Lembra que a tela está filtrada (Pessoal/Compartilhado) e oferece voltar para "tudo". */
export function ViewHint({ hasHousehold = true }: { hasHousehold?: boolean }) {
  const chosen = useFinanceView();
  const router = useRouter();
  const view = chosen === "compartilhado" && !hasHousehold ? "consolidado" : chosen;
  if (view === "consolidado") return null;
  return (
    <div className="border-b bg-surface-1/80 px-4 py-1.5 text-center text-xs text-muted-foreground md:px-8">
      <Eye className="mr-1 inline size-3.5" />
      Mostrando só o que é {view === "pessoal" ? "pessoal" : "compartilhado"}.{" "}
      <button
        type="button"
        className="font-medium text-primary underline-offset-2 hover:underline"
        onClick={() => {
          setFinanceView("consolidado");
          router.refresh();
        }}
      >
        Ver tudo
      </button>
    </div>
  );
}

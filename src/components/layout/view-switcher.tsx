"use client";

import { useRouter } from "next/navigation";
import { VIEWS } from "@/lib/view";
import { cn } from "@/lib/utils";
import { setFinanceView, useFinanceView } from "./use-finance-view";

export function ViewSwitcher({ className, hasHousehold = true }: { className?: string; hasHousehold?: boolean }) {
  const chosen = useFinanceView();
  // Sem espaço compartilhado o servidor mostra "Consolidado"; o seletor mostra o mesmo.
  const current = chosen === "compartilhado" && !hasHousehold ? "consolidado" : chosen;
  const router = useRouter();
  return (
    <div
      role="radiogroup"
      aria-label="Visão dos dados"
      className={cn("inline-flex rounded-lg border bg-surface-1 p-0.5", className)}
    >
      {VIEWS.map((view) => {
        const active = view.value === current;
        const disabled = view.value === "compartilhado" && !hasHousehold;
        return (
          <button
            key={view.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={disabled ? "Crie ou entre em um espaço compartilhado em Configurações" : undefined}
            onClick={() => {
              setFinanceView(view.value);
              router.refresh(); // o servidor relê o cookie e devolve os dados da nova visão
            }}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:px-3",
              active ? "bg-surface-3 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}


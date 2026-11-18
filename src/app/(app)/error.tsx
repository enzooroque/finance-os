"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/** Erro inesperado numa página: mensagem amigável, sem detalhes técnicos na tela. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Algo deu errado ao carregar esta página"
      description={`Seus dados estão seguros. Tente de novo; se continuar, verifique a internet.${error.digest ? ` (código ${error.digest})` : ""}`}
      action={<Button onClick={reset}>Tentar de novo</Button>}
    />
  );
}

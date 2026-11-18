"use client";

import { EntryDialog } from "@/components/finance/entry-dialog";

/** Ponto único de "Nova transação" (botão do topo e botão central do celular). */
export function NewTransactionDialog({ children }: { children: React.ReactNode }) {
  return <EntryDialog>{children}</EntryDialog>;
}

"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Account } from "@/lib/finance/types";
import { AccountDialog } from "./account-dialog";
import { deleteAccount } from "./actions";

export function AccountActions({ account, hasHousehold, afterDelete }: { account: Account; hasHousehold: boolean; afterDelete?: string }) {
  const router = useRouter();
  return (
    <div className="flex gap-1">
      <AccountDialog account={account} hasHousehold={hasHousehold}>
        <Button variant="ghost" size="icon-sm" aria-label={`Editar ${account.name}`}>
          <Pencil />
        </Button>
      </AccountDialog>
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${account.name}`}>
            <Trash2 />
          </Button>
        }
        title={`Excluir a conta "${account.name}"?`}
        description="Só é possível excluir contas sem lançamentos. Se ela tiver histórico, arquive em vez de excluir."
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          const result = await deleteAccount(account.id);
          if (!result.ok) return void toast.error(result.message);
          toast.success("Conta excluída");
          if (afterDelete) router.push(afterDelete);
        }}
      />
    </div>
  );
}

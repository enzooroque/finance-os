"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ColorSwatches, FieldError, Segmented } from "@/components/finance/form-bits";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { Category } from "@/lib/finance/types";
import { deleteCategory, saveCategory } from "./actions";

export function CategoryDialog({
  category,
  categories,
  hasHousehold,
  defaultKind = "expense",
}: {
  category?: Category;
  categories: Category[];
  hasHousehold: boolean;
  defaultKind?: "income" | "expense";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState(category?.kind ?? defaultKind);
  const [scope, setScope] = useState<"personal" | "shared">(category?.scope ?? "personal");
  const [name, setName] = useState(category?.name ?? "");
  const [parentId, setParentId] = useState(category?.parentId ?? "");
  const [color, setColor] = useState(category?.color ?? "#7c5cff");
  const [error, setError] = useState<string>();

  const hasChildren = !!category && categories.some((c) => c.parentId === category.id);
  // Mãe possível: principal, do mesmo tipo, do sistema ou da mesma titularidade.
  const parents = categories.filter(
    (c) => !c.parentId && c.kind === kind && c.id !== category?.id && (c.scope === null || c.scope === scope),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Informe o nome");
    startTransition(async () => {
      const result = await saveCategory({
        id: category?.id ?? null,
        scope,
        kind,
        name,
        parentId: parentId || null,
        color,
      });
      if (!result.ok) {
        setError(result.fieldErrors?.name?.[0]);
        return void toast.error(result.message);
      }
      toast.success(category ? "Categoria atualizada" : "Categoria criada");
      setOpen(false);
      if (!category) setName("");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {category ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${category.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus data-icon="inline-start" /> Nova categoria
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          <DialogDescription>Use subcategorias para detalhar, ex.: Mercado › Feira.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Segmented
            label="Tipo"
            value={kind}
            disabled={!!category}
            onChange={(v) => {
              setKind(v);
              setParentId("");
            }}
            options={[
              { value: "expense", label: "Despesa" },
              { value: "income", label: "Receita" },
            ]}
          />
          {hasHousehold && (
            <Segmented
              label="Titularidade"
              value={scope}
              disabled={!!category}
              onChange={(v) => {
                setScope(v);
                setParentId("");
              }}
              options={[
                { value: "personal", label: "Pessoal" },
                { value: "shared", label: "Compartilhada" },
              ]}
            />
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="cat-name">Nome</Label>
            <Input id="cat-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} aria-describedby="cat-name-err" />
            <FieldError id="cat-name-err" message={error} />
          </div>
          {!hasChildren && (
            <div className="grid gap-1.5">
              <Label htmlFor="cat-parent">Dentro de</Label>
              <NativeSelect id="cat-parent" className="w-full" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <NativeSelectOption value="">Nenhuma (categoria principal)</NativeSelectOption>
                {parents.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          <ColorSwatches value={color} onChange={setColor} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCategoryButton({ category }: { category: Category }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${category.name}`}>
          <Trash2 />
        </Button>
      }
      title={`Excluir "${category.name}"?`}
      description="Os lançamentos desta categoria ficam como “Sem categoria”. Orçamentos dela são removidos."
      confirmLabel="Excluir"
      destructive
      onConfirm={async () => {
        const result = await deleteCategory(category.id);
        if (!result.ok) return void toast.error(result.message);
        toast.success("Categoria excluída");
      }}
    />
  );
}

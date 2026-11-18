import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScopeBadge } from "@/components/finance/bits";
import { PageHeader } from "@/components/shared/page-header";
import { getCategories, getViewContext } from "@/lib/finance/queries";
import type { Category } from "@/lib/finance/types";
import { CategoryDialog, DeleteCategoryButton } from "./category-dialog";

export const metadata: Metadata = { title: "Categorias" };

type ListProps = { categories: Category[]; hasHousehold: boolean };

function Row({ c, child, categories, hasHousehold }: ListProps & { c: Category; child?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${child ? "pl-10" : ""}`}>
      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? "#64748b" }} />
      <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
      {c.scope === null ? (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          Padrão
        </Badge>
      ) : (
        <>
          <ScopeBadge scope={c.scope} />
          <CategoryDialog category={c} categories={categories} hasHousehold={hasHousehold} />
          <DeleteCategoryButton category={c} />
        </>
      )}
    </div>
  );
}

function Group({ kind, title, ...props }: ListProps & { kind: Category["kind"]; title: string }) {
  const parents = props.categories.filter((c) => c.kind === kind && !c.parentId);
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h2>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {parents.map((p) => (
          <li key={p.id}>
            <Row c={p} {...props} />
            {props.categories
              .filter((c) => c.parentId === p.id)
              .map((c) => (
                <Row key={c.id} c={c} child {...props} />
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function CategoriasPage() {
  const [ctx, categories] = await Promise.all([getViewContext(), getCategories()]);
  const props = { categories, hasHousehold: !!ctx.household };
  return (
    <>
      <Link href="/transacoes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Transações
      </Link>
      <PageHeader
        title="Categorias"
        description="As padrão valem para todos. Crie as suas, pessoais ou do casal."
        actions={<CategoryDialog {...props} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Group kind="expense" title="Despesas" {...props} />
        <Group kind="income" title="Receitas" {...props} />
      </div>
    </>
  );
}

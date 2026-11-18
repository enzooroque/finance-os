import { navItems } from "@/config/navigation";
import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

/**
 * Página de uma seção que ainda não tem dados (o banco entra nas próximas fases).
 * Mostra o que a seção fará e em qual fase, sem números inventados.
 */
export function SectionPlaceholder({
  href,
  emptyTitle,
  emptyDescription,
  phase,
}: {
  href: string;
  emptyTitle: string;
  emptyDescription: string;
  phase: number;
}) {
  const item = navItems.find((i) => i.href === href);
  if (!item) throw new Error(`Seção não cadastrada na navegação: ${href}`);
  return (
    <>
      <PageHeader title={item.label} description={item.description} />
      <EmptyState
        icon={item.icon}
        title={emptyTitle}
        description={
          <>
            {emptyDescription}{" "}
            <span className="text-foreground/80">Disponível na Fase {phase}.</span>
          </>
        }
      />
    </>
  );
}

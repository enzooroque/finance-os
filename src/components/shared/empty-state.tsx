import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex animate-in flex-col items-center rounded-2xl border border-dashed bg-surface-1/50 px-6 py-12 text-center duration-500 fade-in-0 slide-in-from-bottom-2",
        className,
      )}
    >
      <div className="relative mb-4">
        <div aria-hidden className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl" />
        <div className="relative grid size-14 place-items-center rounded-2xl bg-surface-2 text-primary ring-1 ring-border">
          <Icon className="size-6" />
        </div>
      </div>
      <h2 className="text-base font-medium">{title}</h2>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

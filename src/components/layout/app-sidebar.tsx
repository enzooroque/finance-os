"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, navItems } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";

/** Recebe o endereço atual; com "" (fallback do Suspense) nenhum item fica ativo. */
export function AppSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar px-3 py-5 md:flex">
      <div className="px-2">
        <Brand />
      </div>
      <nav aria-label="Principal" className="mt-8 flex flex-1 flex-col gap-0.5">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                item.href === "/configuracoes" && "mt-auto",
              )}
            >
              <item.icon className={cn("size-4 shrink-0", active && "text-primary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function AppSidebarLive() {
  return <AppSidebar pathname={usePathname()} />;
}

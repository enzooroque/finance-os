"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Plus } from "lucide-react";
import { isActive, mobilePrimaryHrefs, navItems, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NewTransactionDialog } from "./new-transaction-dialog";

const primary = mobilePrimaryHrefs.map((href) => navItems.find((i) => i.href === href)!);
const secondary = navItems.filter((i) => !(mobilePrimaryHrefs as readonly string[]).includes(i.href));

function TabLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <item.icon className={cn("size-5", active && "text-primary")} />
      <span className="max-w-full truncate">{item.short}</span>
    </Link>
  );
}

/** Recebe o endereço atual; com "" (fallback do Suspense) nenhum item fica ativo. */
export function MobileNav({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = secondary.some((i) => isActive(pathname, i.href));

  return (
    <nav
      aria-label="Navegação inferior"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch px-2">
        <TabLink item={primary[0]} pathname={pathname} />
        <TabLink item={primary[1]} pathname={pathname} />
        <div className="flex flex-1 items-center justify-center">
          <NewTransactionDialog>
            <button
              type="button"
              aria-label="Nova transação"
              className="-mt-5 grid size-13 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-95"
            >
              <Plus className="size-6" />
            </button>
          </NewTransactionDialog>
        </div>
        <TabLink item={primary[2]} pathname={pathname} />
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[11px]",
                moreActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Menu className={cn("size-5", moreActive && "text-primary")} />
              Mais
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <SheetHeader>
              <SheetTitle>Mais seções</SheetTitle>
              <SheetDescription>Acesse as outras áreas do app.</SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 px-4">
              {secondary.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border bg-surface-1 p-3 text-center text-xs",
                      active ? "border-primary/50 text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <item.icon className={cn("size-5", active && "text-primary")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

export function MobileNavLive() {
  return <MobileNav pathname={usePathname()} />;
}

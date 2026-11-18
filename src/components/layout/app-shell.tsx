import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar, AppSidebarLive } from "./app-sidebar";
import { Brand } from "./brand";
import { MobileNav, MobileNavLive } from "./mobile-nav";
import { NewTransactionDialog } from "./new-transaction-dialog";
import { UserMenu, UserMenuSkeleton } from "./user-menu";
import { ViewSwitcher } from "./view-switcher";
import { ViewHintLive, ViewSwitcherLive } from "./view-switcher-live";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      {/* O endereço atual só existe na requisição; o menu aparece já e marca o item ativo em seguida. */}
      <Suspense fallback={<AppSidebar pathname="" />}>
        <AppSidebarLive />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-8">
            <div className="min-w-0 md:hidden">
              <Brand compact />
            </div>
            <Suspense fallback={<ViewSwitcher className="ml-auto shrink-0 md:ml-0" />}>
              <ViewSwitcherLive className="ml-auto shrink-0 md:ml-0" />
            </Suspense>
            <NewTransactionDialog>
              <Button className="ml-auto hidden md:inline-flex">
                <Plus data-icon="inline-start" />
                Nova transação
              </Button>
            </NewTransactionDialog>
            <Suspense fallback={<UserMenuSkeleton />}>
              <UserMenu />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <ViewHintLive />
          </Suspense>
        </header>
        {/* pb extra no celular para o conteúdo não ficar atrás da barra inferior */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-10">{children}</main>
      </div>
      <Suspense fallback={<MobileNav pathname="" />}>
        <MobileNavLive />
      </Suspense>
    </div>
  );
}

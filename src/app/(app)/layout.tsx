import { AppShell } from "@/components/layout/app-shell";

// Proteção: o proxy.ts manda visitantes para /login; dados só são lidos via lib/auth.ts (DAL) + RLS.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}

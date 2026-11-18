import type { Metadata } from "next";
import { Suspense } from "react";
import { DatabaseZap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Brand } from "@/components/layout/brand";
import { EmptyState } from "@/components/shared/empty-state";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  const configured = getSupabaseEnv() !== null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex justify-center">
        <Brand />
      </div>
      {configured ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Entrar</CardTitle>
            <CardDescription>Acesso restrito. Contas são criadas pelo administrador.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-52 w-full" />}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={DatabaseZap}
          title="Banco de dados não configurado"
          description="Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local e reinicie o app. O passo a passo está em docs/SUPABASE.md."
        />
      )}
    </main>
  );
}

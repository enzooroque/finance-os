import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/layout/user-menu";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUser } from "@/lib/auth";
import { getMyHousehold } from "@/lib/household";
import {
  AcceptInviteForm,
  CreateHouseholdForm,
  InviteGenerator,
  PasswordForm,
  ProfileForm,
} from "./account-forms";
import { PreferencesCard } from "./preferences-card";

export const metadata: Metadata = { title: "Configurações" };

export default function ConfiguracoesPage() {
  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<SectionsSkeleton />}>
          <AccountSections />
        </Suspense>
        <PreferencesCard />
      </div>
    </>
  );
}

async function AccountSections() {
  const [user, household] = await Promise.all([getCurrentUser(), getMyHousehold()]);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm displayName={user.displayName} avatarColor={user.avatarColor} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Espaço compartilhado</CardTitle>
          <CardDescription>Até 2 pessoas, com entrada por convite seguro.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {household ? (
            <>
              <div>
                <p className="font-medium">{household.name}</p>
                <ul className="mt-3 grid gap-2">
                  {household.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-3 text-sm">
                      <Avatar name={m.displayName} color={m.avatarColor} />
                      <span className="truncate">
                        {m.displayName}
                        {m.userId === user.id && <span className="text-muted-foreground"> (você)</span>}
                      </span>
                      {m.role === "owner" && <Badge variant="secondary">Criador</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
              {household.members.length < 2 && (
                <>
                  <Separator />
                  <InviteGenerator />
                </>
              )}
            </>
          ) : (
            <>
              <CreateHouseholdForm />
              <Separator />
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">Recebeu um convite? Cole o código:</p>
                <AcceptInviteForm />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Senha</CardTitle>
          <CardDescription>Use pelo menos 8 caracteres.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </>
  );
}

function SectionsSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-72 rounded-xl" />
      ))}
    </>
  );
}

import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInviteForm } from "../configuracoes/account-forms";

export const metadata: Metadata = { title: "Convite" };

export default function ConvitePage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Entrar no espaço compartilhado</CardTitle>
          <CardDescription>
            Confirme para começar a ver as finanças compartilhadas. Seus dados pessoais continuam só seus.
            Se você precisou fazer login antes, abra o link do convite de novo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptInviteForm readFromHash />
        </CardContent>
      </Card>
    </div>
  );
}

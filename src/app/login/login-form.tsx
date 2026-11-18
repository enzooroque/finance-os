"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField, FormMessage } from "@/components/shared/form-field";
import type { FormState } from "@/lib/validation/auth";
import { signIn } from "./actions";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormField
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        required
        errors={state.fieldErrors?.email}
      />
      <FormField
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <FormMessage message={state.message} ok={state.ok} />
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}

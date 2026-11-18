import { z } from "zod";

/** Schemas validados NO SERVIDOR (Server Actions) antes de tocar no banco. */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Informe um e-mail válido")),
  password: z.string().min(1, "Informe a senha").max(72),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Informe seu nome").max(60, "Máximo de 60 caracteres"),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual").max(72),
    newPassword: z.string().min(8, "Use pelo menos 8 caracteres").max(72, "Máximo de 72 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "A nova senha precisa ser diferente da atual",
  });

export const householdNameSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao espaço").max(60, "Máximo de 60 caracteres"),
});

/** O token do convite tem 64 caracteres hexadecimais (32 bytes aleatórios). */
export const inviteTokenSchema = z.object({
  token: z.string().trim().toLowerCase().regex(/^[0-9a-f]{64}$/, "Código de convite inválido"),
});

export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export function toFieldErrors(error: z.ZodError): FormState {
  return { ok: false, fieldErrors: z.flattenError(error).fieldErrors as FormState["fieldErrors"] };
}

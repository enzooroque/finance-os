/**
 * Configuração central do app. Para trocar o nome, defina NEXT_PUBLIC_APP_NAME
 * no arquivo .env.local (ou edite o valor padrão abaixo).
 */
export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "Finance OS",
  description: "Gestão financeira pessoal e compartilhada para duas pessoas.",
  locale: "pt-BR",
  currency: "BRL",
  timeZone: "America/Sao_Paulo",
} as const;

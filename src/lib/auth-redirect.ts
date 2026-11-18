/** Rotas que não exigem login. */
export const PUBLIC_PATHS = ["/login"] as const;

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Valida o destino depois do login (?next=). Só aceita caminhos internos,
 * para impedir "open redirect" (ex.: ?next=https://site-malicioso.com ou //site).
 */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/";
  }
  if (/[\u0000-\u001f]/.test(raw) || isPublicPath(raw.split("?")[0])) return "/";
  return raw;
}

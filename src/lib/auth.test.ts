import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./auth-redirect";
import { dbErrorMessage } from "./db-errors";
import { inviteTokenSchema, loginSchema, passwordSchema, profileSchema } from "./validation/auth";

describe("safeNextPath (proteção contra open redirect)", () => {
  it.each(["/", "/contas", "/transacoes?mes=2026-11"])("aceita caminho interno %s", (p) => {
    expect(safeNextPath(p)).toBe(p);
  });
  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "contas",
    "/login",
    "/login?next=/x",
    "/\nx",
    null,
    123,
  ])("recusa %j e volta para /", (p) => {
    expect(safeNextPath(p)).toBe("/");
  });
});

describe("rotas públicas", () => {
  it("só /login é pública", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/configuracoes")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});

describe("validação no servidor", () => {
  it("login normaliza e-mail e exige senha", () => {
    expect(loginSchema.parse({ email: " Ana@Exemplo.com ", password: "x" }).email).toBe("ana@exemplo.com");
    expect(loginSchema.safeParse({ email: "nao-e-email", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
  it("senha nova: mínimo 8, confirmação igual e diferente da atual", () => {
    const ok = { currentPassword: "antiga123", newPassword: "novaSenha1", confirmPassword: "novaSenha1" };
    expect(passwordSchema.safeParse(ok).success).toBe(true);
    expect(passwordSchema.safeParse({ ...ok, newPassword: "curta", confirmPassword: "curta" }).success).toBe(false);
    expect(passwordSchema.safeParse({ ...ok, confirmPassword: "outra1234" }).success).toBe(false);
    expect(passwordSchema.safeParse({ ...ok, newPassword: "antiga123", confirmPassword: "antiga123" }).success).toBe(false);
  });
  it("perfil: nome obrigatório e cor hexadecimal", () => {
    expect(profileSchema.safeParse({ displayName: "  ", avatarColor: "#7c5cff" }).success).toBe(false);
    expect(profileSchema.safeParse({ displayName: "Ana", avatarColor: "red" }).success).toBe(false);
    expect(profileSchema.safeParse({ displayName: "Ana", avatarColor: "#7c5cff" }).success).toBe(true);
  });
  it("token de convite: 64 hexadecimais", () => {
    expect(inviteTokenSchema.safeParse({ token: "a".repeat(64) }).success).toBe(true);
    expect(inviteTokenSchema.safeParse({ token: "a".repeat(63) }).success).toBe(false);
    expect(inviteTokenSchema.safeParse({ token: "'; drop table x; --" }).success).toBe(false);
  });
});

describe("mensagens de erro do banco", () => {
  it("repassa só mensagens conhecidas e esconde detalhes internos", () => {
    expect(dbErrorMessage({ code: "22023", message: "Convite inválido ou expirado" })).toBe("Convite inválido ou expirado");
    expect(dbErrorMessage({ code: "XX000", message: "internal: relation secret" })).not.toContain("secret");
    expect(dbErrorMessage(null)).toMatch(/Tente novamente/);
  });
});

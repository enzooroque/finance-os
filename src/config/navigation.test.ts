import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isActive, mobilePrimaryHrefs, navItems } from "./navigation";

describe("navegação", () => {
  it("toda seção do menu tem uma página real (nenhum link quebrado)", () => {
    for (const item of navItems) {
      const page = join(process.cwd(), "src/app/(app)", item.href, "page.tsx");
      expect(existsSync(page), `${item.href} sem page.tsx`).toBe(true);
    }
  });
  it("itens fixos do celular existem no menu", () => {
    for (const href of mobilePrimaryHrefs) expect(navItems.some((i) => i.href === href)).toBe(true);
  });
  it("marca a seção ativa corretamente", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/contas", "/")).toBe(false);
    expect(isActive("/contas/123", "/contas")).toBe(true);
    expect(isActive("/contas-a-pagar", "/contas")).toBe(false);
  });
});

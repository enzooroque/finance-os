"use client";

import { useState, useSyncExternalStore } from "react";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "fos_install_dismissed";
const noop = () => () => {};

/** Mostra como instalar o app só no celular, quando ainda não está instalado e não foi dispensado. */
function shouldShow() {
  try {
    if (localStorage.getItem(KEY)) return null;
  } catch {
    /* sem localStorage: segue mostrando */
  }
  if (window.matchMedia("(display-mode: standalone)").matches) return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return null;
}

export function InstallCard() {
  const platform = useSyncExternalStore(noop, shouldShow, () => null);
  const [hidden, setHidden] = useState(false);
  if (!platform || hidden) return null;
  const steps =
    platform === "ios"
      ? ["Toque em Compartilhar (quadrado com seta) no Safari", "Escolha “Adicionar à Tela de Início”", "Toque em Adicionar e abra pelo ícone"]
      : ["Toque no menu ⋮ do navegador", "Escolha “Adicionar à tela inicial” ou “Instalar app”", "Abra pelo ícone, em tela cheia"];
  return (
    <div className="relative rounded-xl border bg-surface-1 p-3 text-sm">
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-2 right-2"
        aria-label="Dispensar"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            /* ignora */
          }
          setHidden(true);
        }}
      >
        <X />
      </Button>
      <p className="mb-2 flex items-center gap-2 font-medium">
        <Smartphone className="size-4 text-primary" /> Instale no celular
      </p>
      <ol className="grid list-decimal gap-1 pl-5 text-xs text-muted-foreground">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_VIEW, parseView, VIEW_COOKIE, type FinanceView } from "@/lib/view";

const EVENT = "fos:view-change";

function readCookie(): FinanceView {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${VIEW_COOKIE}=`));
  return parseView(raw?.split("=")[1]);
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

/** Salva a visão escolhida (null apaga a preferência e volta ao padrão). */
export function setFinanceView(view: FinanceView | null) {
  // Preferência de interface, não é dado sensível. max-age=0 apaga o cookie.
  const maxAge = view ? 60 * 60 * 24 * 365 : 0;
  document.cookie = `${VIEW_COOKIE}=${view ?? ""}; path=/; max-age=${maxAge}; samesite=lax`;
  window.dispatchEvent(new Event(EVENT));
}

export function useFinanceView(): FinanceView {
  return useSyncExternalStore(subscribe, readCookie, () => DEFAULT_VIEW);
}

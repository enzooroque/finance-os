"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Valor em reais que "rola" até o número (baseado no NumberTicker do Magic UI).
 * O HTML já nasce com o valor final (leitor de tela, sem JS e quem desliga animações veem o número certo).
 */
export function MoneyTicker({ cents, className }: { cents: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (reduce || !inView) return;
    const show = (c: number) => {
      if (ref.current) ref.current.textContent = formatBRL(c);
    };
    // A animação é só visual; perto do fim (e ao terminar) mostra o valor exato, nunca "quase".
    const unsub = spring.on("change", (v) => show(Math.abs(cents - v) < 100 ? cents : Math.round(v)));
    const unsubDone = spring.on("animationComplete", () => show(cents));
    motionValue.set(cents);
    return () => {
      unsub();
      unsubDone();
    };
  }, [cents, inView, reduce, motionValue, spring]);

  return (
    <span ref={ref} aria-label={formatBRL(cents)} className={cn("tabular inline-block", className)}>
      {formatBRL(cents)}
    </span>
  );
}

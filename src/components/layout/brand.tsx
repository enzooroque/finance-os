import Link from "next/link";
import { appConfig } from "@/config/app";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5 font-semibold tracking-tight">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-sm font-bold text-primary ring-1 ring-primary/30"
      >
        {appConfig.name.charAt(0)}
      </span>
      {/* compact: no celular só o logo aparece; o nome fica para leitores de tela */}
      <span className={compact ? "sr-only" : "truncate"}>{appConfig.name}</span>
    </Link>
  );
}

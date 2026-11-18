"use client";

import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const COLORS = ["#7c5cff", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#64748b"];

export function ColorSwatches({ value, onChange, label = "Cor" }: { value: string; onChange: (c: string) => void; label?: string }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Cor ${c}`}
            aria-pressed={c === value}
            onClick={() => onChange(c)}
            className={cn(
              "grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-popover transition",
              c === value && "ring-2 ring-foreground",
            )}
            style={{ backgroundColor: c }}
          >
            {c === value && <Check className="size-4 text-white" />}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Botões segmentados (escolha única), acessíveis como radiogroup. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-lg border bg-surface-1 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled && o.value !== value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2 py-1.5 text-sm font-medium transition-colors disabled:opacity-40",
            o.value === value ? "bg-surface-3 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-xs text-negative">
      {message}
    </p>
  ) : null;
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <DialogFooter>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
        {children}
      </Button>
    </DialogFooter>
  );
}

export function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}


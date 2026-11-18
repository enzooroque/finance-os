import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Campo com rótulo e mensagem de erro acessível (aria-invalid + aria-describedby). */
export function FormField({
  label,
  name,
  errors,
  ...inputProps
}: { label: string; name: string; errors?: string[] } & React.ComponentProps<typeof Input>) {
  const errorId = `${name}-error`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? errorId : undefined}
        {...inputProps}
      />
      {errors?.length ? (
        <p id={errorId} className="text-xs text-negative">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

export function FormMessage({ message, ok }: { message?: string; ok?: boolean }) {
  if (!message) return null;
  return (
    <p role={ok ? "status" : "alert"} className={ok ? "text-sm text-positive" : "text-sm text-negative"}>
      {message}
    </p>
  );
}

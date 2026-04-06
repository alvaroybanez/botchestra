import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InlineToastState } from "./types";

export function InlineToast({ toast }: { toast: InlineToastState }) {
  return (
    <div className="fixed right-4 top-4 z-[60] max-w-sm">
      <div
        className={cn(
          "rounded-lg border px-4 py-3 text-sm shadow-lg",
          toast.tone === "error"
            ? "border-destructive/30 bg-destructive text-destructive-foreground"
            : "border-emerald-300 bg-emerald-600 text-white",
        )}
        role="alert"
      >
        {toast.message}
      </div>
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function LoadingCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

export function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  isOpen,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        aria-modal="true"
        className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl"
        role="dialog"
      >
        <div className="space-y-3">
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={onConfirm}>
            {isSubmitting ? "Working..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AxisInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  );
}

export function LocalSummaryValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

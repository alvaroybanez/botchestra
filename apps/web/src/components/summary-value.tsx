import { cn } from "@/lib/utils";

type SummaryValueVariant = "card" | "inline" | "bordered";

interface SummaryValueProps {
  label: string;
  value: string;
  variant?: SummaryValueVariant;
  className?: string;
}

const variantStyles: Record<
  SummaryValueVariant,
  { wrapper: string; label: string; value: string }
> = {
  card: {
    wrapper: "rounded-lg bg-card/50 p-3",
    label: "font-label text-[10px] text-muted-foreground",
    value: "mt-1 break-words text-sm font-medium",
  },
  inline: {
    wrapper: "space-y-1",
    label: "font-label text-[10px] text-muted-foreground",
    value: "text-sm leading-6",
  },
  bordered: {
    wrapper: "rounded-lg border bg-background p-4",
    label: "text-sm font-medium text-muted-foreground",
    value: "mt-1 break-words text-sm font-medium",
  },
};

export function SummaryValue({
  label,
  value,
  variant = "card",
  className,
}: SummaryValueProps) {
  const styles = variantStyles[variant];

  return (
    <div className={cn(styles.wrapper, className)}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}

interface SummaryGridProps {
  children: React.ReactNode;
  columns?: string;
  className?: string;
}

export function SummaryGrid({ children, columns, className }: SummaryGridProps) {
  return <dl className={cn("grid gap-3", columns, className)}>{children}</dl>;
}

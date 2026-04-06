import { cn } from "@/lib/utils";

type SummaryValueVariant = "card" | "inline" | "bordered";

interface SummaryValueProps {
  label: string;
  value: string;
  variant?: SummaryValueVariant;
  className?: string;
}

const variantClasses: Record<
  SummaryValueVariant,
  { wrapper: string; dt: string; dd: string }
> = {
  card: {
    wrapper: "rounded-lg bg-card/50 p-3",
    dt: "font-label text-[10px] text-muted-foreground",
    dd: "mt-1 break-words text-sm font-medium",
  },
  inline: {
    wrapper: "space-y-1",
    dt: "font-label text-[10px] text-muted-foreground",
    dd: "text-sm leading-6",
  },
  bordered: {
    wrapper: "rounded-lg border bg-background p-4",
    dt: "text-sm font-medium text-muted-foreground",
    dd: "mt-1 break-words text-sm font-medium",
  },
};

function SummaryValue({
  label,
  value,
  variant = "card",
  className,
}: SummaryValueProps) {
  const classes = variantClasses[variant];

  return (
    <div className={cn(classes.wrapper, className)}>
      <dt className={classes.dt}>{label}</dt>
      <dd className={classes.dd}>{value}</dd>
    </div>
  );
}

interface SummaryGridProps {
  children: React.ReactNode;
  columns?: string;
  className?: string;
}

function SummaryGrid({ children, columns, className }: SummaryGridProps) {
  return (
    <dl className={cn("grid gap-3", columns, className)}>{children}</dl>
  );
}

export { SummaryValue, SummaryGrid };
export type { SummaryValueProps, SummaryGridProps };

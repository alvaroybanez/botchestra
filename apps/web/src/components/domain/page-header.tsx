import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  badge?: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}

function PageHeader({
  eyebrow,
  title,
  badge,
  description,
  actions,
  as: Heading = "h2",
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="space-y-3">
        {eyebrow && (
          <p className="font-label text-xs text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Heading className="font-heading text-3xl tracking-tight">
              {title}
            </Heading>
            {badge}
          </div>
          {description && (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export { PageHeader };
export type { PageHeaderProps };

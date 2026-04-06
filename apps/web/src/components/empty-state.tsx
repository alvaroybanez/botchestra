import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EmptyStateVariant = "card" | "inline";

interface EmptyStateProps {
  title?: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  variant?: EmptyStateVariant;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  variant = "card",
  className,
}: EmptyStateProps) {
  if (variant === "inline") {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {description}
      </p>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        {icon && <div className="mb-2">{icon}</div>}
        {title && <CardTitle>{title}</CardTitle>}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  );
}

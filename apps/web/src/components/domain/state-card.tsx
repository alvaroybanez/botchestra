import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StateCardProps {
  title: string;
  description: string;
  className?: string;
}

function StateCard({ title, description, className }: StateCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export { StateCard };
export type { StateCardProps };

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 font-body text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

interface FilterBarProps {
  title?: string;
  columns?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  title = "Filters",
  columns = "lg:grid-cols-2",
  children,
  footer,
  className,
}: FilterBarProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className={cn("grid gap-4", columns)}>
        {children}
      </CardContent>
      {footer && <div className="px-6 pb-6">{footer}</div>}
    </Card>
  );
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
}

export function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "All",
  className,
}: FilterSelectProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClassName}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface FilterSearchProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "url" | "datetime-local";
  min?: string;
  max?: string;
  step?: string;
  className?: string;
}

export function FilterSearch({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
  step,
  className,
}: FilterSearchProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
      />
    </div>
  );
}

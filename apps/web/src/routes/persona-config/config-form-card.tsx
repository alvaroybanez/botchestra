import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConfigFormValue } from "./types";
import { emptyAxis, textareaClassName } from "./helpers";
import { AxisEditorCard } from "./axis-components";

export function ConfigFormCard({
  form,
  formPrefix,
  submitLabel,
  title,
  description,
  error,
  disabled,
  onSubmit,
  onChange,
  axisGenerationSlot,
}: {
  form: ConfigFormValue;
  formPrefix: string;
  submitLabel: string;
  title: string | null;
  description: string | null;
  error: string | null;
  disabled: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  onChange: (value: ConfigFormValue) => void;
  axisGenerationSlot?: React.ReactNode;
}) {
  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {title ? (
        <div className="space-y-1">
          <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
          {description ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${formPrefix}-name`}>
            Persona configuration name
          </Label>
          <Input
            id={`${formPrefix}-name`}
            value={form.name}
            onChange={(event) =>
              onChange({
                ...form,
                name: event.target.value,
              })
            }
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${formPrefix}-context`}>Context</Label>
          <Input
            id={`${formPrefix}-context`}
            value={form.context}
            onChange={(event) =>
              onChange({
                ...form,
                context: event.target.value,
              })
            }
            required
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${formPrefix}-description`}>Description</Label>
        <textarea
          id={`${formPrefix}-description`}
          className={textareaClassName}
          value={form.description}
          onChange={(event) =>
            onChange({
              ...form,
              description: event.target.value,
            })
          }
          required
        />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Shared axes</h3>
            <p className="text-sm text-muted-foreground">
              Capture the common dimensions that every persona in this persona
              configuration should share.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange({
                ...form,
                sharedAxes: [...form.sharedAxes, emptyAxis()],
              })
            }
          >
            Add axis
          </Button>
        </div>

        {axisGenerationSlot ?? null}

        <div className="grid gap-4">
          {form.sharedAxes.map((axis, index) => (
            <AxisEditorCard
              key={`${formPrefix}-axis-${index}`}
              axis={axis}
              canRemove={form.sharedAxes.length > 1}
              formPrefix={formPrefix}
              index={index}
              onChange={(nextAxis) =>
                onChange({
                  ...form,
                  sharedAxes: form.sharedAxes.map((item, itemIndex) =>
                    itemIndex === index ? nextAxis : item,
                  ),
                })
              }
              onRemove={() =>
                onChange({
                  ...form,
                  sharedAxes: form.sharedAxes.filter(
                    (_axis, axisIndex) => axisIndex !== index,
                  ),
                })
              }
            />
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button disabled={disabled} type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}

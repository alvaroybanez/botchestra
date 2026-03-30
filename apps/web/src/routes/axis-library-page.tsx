import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type AxisDefinition = Doc<"axisDefinitions">;

type ViewerAccess = {
  role: "researcher" | "reviewer" | "admin";
  permissions: {
    canManagePersonaPacks: boolean;
  };
} | null;

type AxisFormState = {
  key: string;
  label: string;
  description: string;
  lowAnchor: string;
  midAnchor: string;
  highAnchor: string;
  weight: string;
  tags: string;
};

type AxisFormErrors = Partial<Record<keyof AxisFormState, string>>;

type AxisPayload = {
  key: string;
  label: string;
  description: string;
  lowAnchor: string;
  midAnchor: string;
  highAnchor: string;
  weight: number;
  tags: string[];
};

type AxisDialogState =
  | {
      mode: "create";
    }
  | {
      mode: "edit";
      axis: AxisDefinition;
    }
  | null;

const AXIS_KEY_PATTERN = /^[a-z0-9_]+$/;

const emptyAxisForm = (): AxisFormState => ({
  key: "",
  label: "",
  description: "",
  lowAnchor: "",
  midAnchor: "",
  highAnchor: "",
  weight: "1",
  tags: "",
});

export function AxisLibraryPage() {
  const axisDefinitionsQuery = useQuery((api as any).axisLibrary.listAxisDefinitions, {}) as
    | AxisDefinition[]
    | undefined;
  const viewerAccess = useQuery((api as any).rbac.getViewerAccess, {}) as
    | ViewerAccess
    | undefined;
  const createAxisDefinition = useMutation((api as any).axisLibrary.createAxisDefinition);
  const updateAxisDefinition = useMutation((api as any).axisLibrary.updateAxisDefinition);
  const deleteAxisDefinition = useMutation((api as any).axisLibrary.deleteAxisDefinition);

  const [axisDefinitions, setAxisDefinitions] = useState<AxisDefinition[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [dialogState, setDialogState] = useState<AxisDialogState>(null);
  const [formState, setFormState] = useState<AxisFormState>(emptyAxisForm());
  const [formErrors, setFormErrors] = useState<AxisFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<AxisDefinition | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (axisDefinitionsQuery !== undefined) {
      setAxisDefinitions(axisDefinitionsQuery);
    }
  }, [axisDefinitionsQuery]);

  useEffect(() => {
    if (dialogState === null) {
      setFormState(emptyAxisForm());
      setFormErrors({});
      setFormError(null);
      return;
    }

    if (dialogState.mode === "create") {
      setFormState(emptyAxisForm());
      setFormErrors({});
      setFormError(null);
      return;
    }

    setFormState(axisDefinitionToFormState(dialogState.axis));
    setFormErrors({});
    setFormError(null);
  }, [dialogState]);

  const canManageAxes = viewerAccess?.permissions.canManagePersonaPacks === true;

  const tagOptions = useMemo(
    () =>
      Array.from(
        new Set(axisDefinitions.flatMap((axisDefinition) => axisDefinition.tags)),
      ).sort((left, right) => left.localeCompare(right)),
    [axisDefinitions],
  );

  const filteredAxisDefinitions = useMemo(() => {
    const normalizedSearchText = searchText.trim().toLowerCase();

    return axisDefinitions.filter((axisDefinition) => {
      const matchesSearch =
        normalizedSearchText.length === 0
        || [axisDefinition.key, axisDefinition.label, axisDefinition.description]
          .some((value) => value.toLowerCase().includes(normalizedSearchText));
      const matchesTag =
        selectedTag.length === 0 || axisDefinition.tags.includes(selectedTag);

      return matchesSearch && matchesTag;
    });
  }, [axisDefinitions, searchText, selectedTag]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateAxisForm(formState);
    const payload = validation.payload;
    setFormErrors(validation.errors);

    if (payload === null) {
      setFormError(null);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (dialogState?.mode === "edit") {
        const updatedAxisDefinition = await updateAxisDefinition({
          axisDefinitionId: dialogState.axis._id,
          patch: {
            label: payload.label,
            description: payload.description,
            lowAnchor: payload.lowAnchor,
            midAnchor: payload.midAnchor,
            highAnchor: payload.highAnchor,
            weight: payload.weight,
            tags: payload.tags,
          },
        }) as AxisDefinition;

        setAxisDefinitions((current) =>
          current.map((axisDefinition) =>
            axisDefinition._id === updatedAxisDefinition._id
              ? updatedAxisDefinition
              : axisDefinition
          ),
        );
      } else {
        const axisDefinitionId = await createAxisDefinition({
          axis: payload,
        }) as Id<"axisDefinitions">;

        setAxisDefinitions((current) => [
          buildCreatedAxisDefinition(axisDefinitionId, payload),
          ...current,
        ]);
      }

      setDialogState(null);
    } catch (error) {
      setFormError(
        getErrorMessage(error, "Could not save the axis definition."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (deleteCandidate === null) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteAxisDefinition({
        axisDefinitionId: deleteCandidate._id,
      });

      setAxisDefinitions((current) =>
        current.filter((axisDefinition) => axisDefinition._id !== deleteCandidate._id),
      );
      setDeleteCandidate(null);
    } catch (error) {
      setFormError(
        getErrorMessage(error, "Could not delete the axis definition."),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  if (axisDefinitionsQuery === undefined || viewerAccess === undefined) {
    return <AxisLibraryLoadingState />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Persona Library
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">Axis Library</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Reuse shared persona axes across packs, search by metadata, and manage
            org-specific definitions in one place.
          </p>
        </div>

        {canManageAxes ? (
          <Button onClick={() => setDialogState({ mode: "create" })}>
            Create axis
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Browse axes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="grid gap-2">
            <Label htmlFor="axis-library-search">Search</Label>
            <Input
              id="axis-library-search"
              placeholder="Search by key, label, or description"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="axis-library-tag-filter">Tag filter</Label>
            <select
              className={selectClassName}
              id="axis-library-tag-filter"
              value={selectedTag}
              onChange={(event) => setSelectedTag(event.target.value)}
            >
              <option value="">All tags</option>
              {tagOptions.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {axisDefinitions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No axis definitions yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Save reusable axes here to seed future persona packs and review what
              has been published into the shared library.
            </p>
            {canManageAxes ? (
              <Button onClick={() => setDialogState({ mode: "create" })}>
                Create axis
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : filteredAxisDefinitions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No axes match your filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Try adjusting the search text or clearing the selected tag filter.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchText("");
                setSelectedTag("");
              }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Saved definitions ({filteredAxisDefinitions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Low Anchor</TableHead>
                  <TableHead>Mid Anchor</TableHead>
                  <TableHead>High Anchor</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Usage Count</TableHead>
                  <TableHead>Creation Source</TableHead>
                  {canManageAxes ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAxisDefinitions.map((axisDefinition) => (
                  <TableRow key={axisDefinition._id}>
                    <TableCell className="font-medium">{axisDefinition.key}</TableCell>
                    <TableCell>{axisDefinition.label}</TableCell>
                    <TableCell title={axisDefinition.description}>
                      {truncateText(axisDefinition.description)}
                    </TableCell>
                    <TableCell>{axisDefinition.lowAnchor}</TableCell>
                    <TableCell>{axisDefinition.midAnchor}</TableCell>
                    <TableCell>{axisDefinition.highAnchor}</TableCell>
                    <TableCell>{formatWeight(axisDefinition.weight)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {axisDefinition.tags.length === 0 ? (
                          <span className="text-sm text-muted-foreground">No tags</span>
                        ) : (
                          axisDefinition.tags.map((tag) => (
                            <Badge key={`${axisDefinition._id}-${tag}`} variant="outline">
                              {tag}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{axisDefinition.usageCount}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          axisDefinition.creationSource === "manual"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {formatCreationSource(axisDefinition.creationSource)}
                      </Badge>
                    </TableCell>
                    {canManageAxes ? (
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() =>
                              setDialogState({
                                mode: "edit",
                                axis: axisDefinition,
                              })
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => setDeleteCandidate(axisDefinition)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogState !== null} onOpenChange={(open) => !open && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState?.mode === "edit" ? "Edit axis definition" : "Create axis"}
            </DialogTitle>
            <DialogDescription>
              Capture the reusable metadata, anchors, weight, and tags for this
              axis definition.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <AxisField
                error={formErrors.key}
                id="axis-form-key"
                label="Key"
              >
                <Input
                  aria-invalid={formErrors.key ? true : undefined}
                  disabled={dialogState?.mode === "edit"}
                  id="axis-form-key"
                  required
                  value={formState.key}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      key: event.target.value,
                    }))
                  }
                />
              </AxisField>

              <AxisField
                error={formErrors.label}
                id="axis-form-label"
                label="Label"
              >
                <Input
                  aria-invalid={formErrors.label ? true : undefined}
                  id="axis-form-label"
                  required
                  value={formState.label}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                />
              </AxisField>
            </div>

            <AxisField
              error={formErrors.description}
              id="axis-form-description"
              label="Description"
            >
              <Textarea
                aria-invalid={formErrors.description ? true : undefined}
                id="axis-form-description"
                required
                value={formState.description}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </AxisField>

            <div className="grid gap-4 md:grid-cols-3">
              <AxisField
                error={formErrors.lowAnchor}
                id="axis-form-low-anchor"
                label="Low anchor"
              >
                <Input
                  aria-invalid={formErrors.lowAnchor ? true : undefined}
                  id="axis-form-low-anchor"
                  required
                  value={formState.lowAnchor}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      lowAnchor: event.target.value,
                    }))
                  }
                />
              </AxisField>

              <AxisField
                error={formErrors.midAnchor}
                id="axis-form-mid-anchor"
                label="Mid anchor"
              >
                <Input
                  aria-invalid={formErrors.midAnchor ? true : undefined}
                  id="axis-form-mid-anchor"
                  required
                  value={formState.midAnchor}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      midAnchor: event.target.value,
                    }))
                  }
                />
              </AxisField>

              <AxisField
                error={formErrors.highAnchor}
                id="axis-form-high-anchor"
                label="High anchor"
              >
                <Input
                  aria-invalid={formErrors.highAnchor ? true : undefined}
                  id="axis-form-high-anchor"
                  required
                  value={formState.highAnchor}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      highAnchor: event.target.value,
                    }))
                  }
                />
              </AxisField>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <AxisField
                error={formErrors.weight}
                id="axis-form-weight"
                label="Weight"
              >
                <Input
                  aria-invalid={formErrors.weight ? true : undefined}
                  id="axis-form-weight"
                  min="0.01"
                  required
                  step="0.01"
                  type="number"
                  value={formState.weight}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      weight: event.target.value,
                    }))
                  }
                />
              </AxisField>

              <AxisField
                error={formErrors.tags}
                id="axis-form-tags"
                label="Tags"
              >
                <Input
                  aria-invalid={formErrors.tags ? true : undefined}
                  id="axis-form-tags"
                  placeholder="support, onboarding, fintech"
                  value={formState.tags}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      tags: event.target.value,
                    }))
                  }
                />
              </AxisField>
            </div>

            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogState(null)}>
                Cancel
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting
                  ? dialogState?.mode === "edit"
                    ? "Saving..."
                    : "Creating..."
                  : dialogState?.mode === "edit"
                    ? "Save changes"
                    : "Create axis"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteCandidate !== null} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete axis definition?</DialogTitle>
            <DialogDescription>
              This permanently removes the axis from your shared library.
            </DialogDescription>
          </DialogHeader>

          {deleteCandidate ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="font-medium">{deleteCandidate.label}</p>
                <p className="text-sm text-muted-foreground">{deleteCandidate.key}</p>
              </div>

              {deleteCandidate.usageCount > 0 ? (
                <p className="text-sm text-amber-700">
                  Warning: this axis is currently in use {deleteCandidate.usageCount}
                  {" "}
                  time{deleteCandidate.usageCount === 1 ? "" : "s"} across published packs.
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteCandidate(null)}>
              Cancel
            </Button>
            <Button disabled={isDeleting} variant="destructive" onClick={() => void handleDelete()}>
              {isDeleting ? "Deleting..." : "Delete axis"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AxisField({
  children,
  error,
  id,
  label,
}: {
  children: ReactNode;
  error?: string;
  id: string;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AxisLibraryLoadingState() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="h-10 w-56 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full max-w-3xl animate-pulse rounded bg-muted" />
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-10 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function axisDefinitionToFormState(axisDefinition: AxisDefinition): AxisFormState {
  return {
    key: axisDefinition.key,
    label: axisDefinition.label,
    description: axisDefinition.description,
    lowAnchor: axisDefinition.lowAnchor,
    midAnchor: axisDefinition.midAnchor,
    highAnchor: axisDefinition.highAnchor,
    weight: String(axisDefinition.weight),
    tags: axisDefinition.tags.join(", "),
  };
}

function validateAxisForm(formState: AxisFormState): {
  errors: AxisFormErrors;
  payload: AxisPayload | null;
} {
  const errors: AxisFormErrors = {};
  const key = formState.key.trim();
  const label = formState.label.trim();
  const description = formState.description.trim();
  const lowAnchor = formState.lowAnchor.trim();
  const midAnchor = formState.midAnchor.trim();
  const highAnchor = formState.highAnchor.trim();
  const weight = Number(formState.weight);
  const tags = parseTags(formState.tags);

  if (key.length === 0) {
    errors.key = "Axis key is required.";
  } else if (!AXIS_KEY_PATTERN.test(key)) {
    errors.key =
      "Axis key must be snake_case (lowercase letters, numbers, and underscores only).";
  }

  if (label.length === 0) {
    errors.label = "Axis label is required.";
  }

  if (description.length === 0) {
    errors.description = "Axis description is required.";
  }

  if (lowAnchor.length === 0) {
    errors.lowAnchor = "Axis low anchor is required.";
  }

  if (midAnchor.length === 0) {
    errors.midAnchor = "Axis mid anchor is required.";
  }

  if (highAnchor.length === 0) {
    errors.highAnchor = "Axis high anchor is required.";
  }

  if (formState.weight.trim().length === 0) {
    errors.weight = "Axis weight is required.";
  } else if (!Number.isFinite(weight) || weight <= 0) {
    errors.weight = "Axis weight must be a positive number.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      payload: null,
    };
  }

  return {
    errors,
    payload: {
      key,
      label,
      description,
      lowAnchor,
      midAnchor,
      highAnchor,
      weight,
      tags,
    },
  };
}

function buildCreatedAxisDefinition(
  axisDefinitionId: Id<"axisDefinitions">,
  payload: AxisPayload,
): AxisDefinition {
  const now = Date.now();

  return {
    _creationTime: now,
    _id: axisDefinitionId,
    key: payload.key,
    label: payload.label,
    description: payload.description,
    lowAnchor: payload.lowAnchor,
    midAnchor: payload.midAnchor,
    highAnchor: payload.highAnchor,
    weight: payload.weight,
    tags: payload.tags,
    usageCount: 0,
    creationSource: "manual",
    orgId: "",
    createdBy: "",
    updatedBy: "",
    createdAt: now,
    updatedAt: now,
  };
}

function parseTags(tags: string) {
  return Array.from(
    new Set(
      tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function formatCreationSource(creationSource: AxisDefinition["creationSource"]) {
  return creationSource === "manual" ? "Manual" : "Pack publish";
}

function formatWeight(weight: number) {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(2);
}

function truncateText(value: string) {
  return value.length > 96 ? `${value.slice(0, 93)}...` : value;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (
    typeof error === "object"
    && error !== null
    && "data" in error
    && typeof error.data === "string"
  ) {
    return error.data;
  }

  return fallback;
}

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

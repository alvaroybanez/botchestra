import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  emptyStudyDetailSearch,
} from "@/routes/study-shared";
import { SummaryValue } from "@/components/summary-value";
import { selectClassName } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

const DEFAULT_ALLOWED_ACTIONS = ["goto", "click", "type", "select", "scroll", "wait", "back", "finish"] as const;
const DEFAULT_FORBIDDEN_ACTIONS = ["payment_submission", "external_download"] as const;

type PersonaConfigListItem = Doc<"personaConfigs">;

type StudyFormValue = {
  personaConfigId: string;
  name: string;
  description: string;
  scenario: string;
  goal: string;
  startingUrl: string;
  allowedDomains: string;
  successCriteria: string;
  stopConditions: string;
  postTaskQuestions: string;
  runBudget: string;
  activeConcurrency: string;
  environmentLabel: string;
  maxSteps: string;
  maxDurationSec: string;
};

const emptyStudyForm = (): StudyFormValue => ({
  personaConfigId: "",
  name: "",
  description: "",
  scenario: "",
  goal: "",
  startingUrl: "",
  allowedDomains: "example.com",
  successCriteria: "Reach the intended success state",
  stopConditions: "Leave the allowed domain",
  postTaskQuestions: [
    "Do you think you completed the task?",
    "What was the hardest part?",
    "What confused or frustrated you?",
    "How confident are you that you did the right thing?",
    "What would you change?",
  ].join("\n"),
  runBudget: "64",
  activeConcurrency: "8",
  environmentLabel: "staging",
  maxSteps: "25",
  maxDurationSec: "420",
});

export function StudyCreationWizardPage() {
  const personaConfigs = useQuery(api.personaConfigs.list, {});
  const createStudy = useMutation(api.studies.createStudy);
  const navigate = useNavigate({ from: "/studies/new" });
  const [form, setForm] = useState<StudyFormValue>(emptyStudyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availablePacks = useMemo<PersonaConfigListItem[]>(
    () =>
      (personaConfigs ?? []).filter(
        (config: PersonaConfigListItem) => config.status !== "archived",
      ),
    [personaConfigs],
  );

  useEffect(() => {
    if (availablePacks.length === 0) {
      return;
    }

    setForm((current) =>
      current.personaConfigId
        ? current
        : { ...current, personaConfigId: availablePacks[0]!._id },
    );
  }, [availablePacks]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const createdStudy = await createStudy({
        study: {
          personaConfigId: form.personaConfigId as Id<"personaConfigs">,
          name: form.name,
          ...(form.description.trim()
            ? { description: form.description.trim() }
            : {}),
          taskSpec: studyFormToTaskSpec(form),
          runBudget: Number(form.runBudget),
          activeConcurrency: Number(form.activeConcurrency),
        },
      });

      await navigate({
        params: { studyId: createdStudy._id },
        search: emptyStudyDetailSearch,
        to: "/studies/$studyId/overview",
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Could not create study."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (personaConfigs === undefined) {
    return (
      <EmptyState
        title="New study"
        description="Loading persona configurations and creation controls..."
      />
    );
  }

  if (availablePacks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No persona configurations available</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Create or publish a persona configuration before launching a new study. The
            creation wizard needs a persona configuration to supply persona coverage.
          </p>
          <Button asChild variant="outline">
            <Link to="/persona-configs">Open Persona Configurations</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="font-label text-xs text-muted-foreground">
          Study Setup
        </p>
        <div className="space-y-2">
          <h2 className="font-heading text-3xl tracking-tight">
            Create a new study
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Configure the persona configuration, task specification, run budget,
            concurrency, and guardrails for the study launch workflow.
          </p>
        </div>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Creation wizard</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="study-persona-config">Persona configuration selector</Label>
                <select
                  id="study-persona-config"
                  className={selectClassName}
                  value={form.personaConfigId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      personaConfigId: event.target.value,
                    }))
                  }
                >
                  {availablePacks.map((config: PersonaConfigListItem) => (
                    <option key={config._id} value={config._id}>
                      {config.name} ({config.status})
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <Label htmlFor="study-name">Study name</Label>
                <Input
                  id="study-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </Field>
            </div>

            <Field>
              <Label htmlFor="study-description">Description</Label>
              <textarea
                id="study-description"
                className={textareaClassName}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="study-scenario">Scenario</Label>
                <textarea
                  id="study-scenario"
                  className={textareaClassName}
                  value={form.scenario}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scenario: event.target.value,
                    }))
                  }
                  required
                />
              </Field>

              <Field>
                <Label htmlFor="study-goal">Goal</Label>
                <textarea
                  id="study-goal"
                  className={textareaClassName}
                  value={form.goal}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, goal: event.target.value }))
                  }
                  required
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="study-starting-url">Starting URL</Label>
                <Input
                  id="study-starting-url"
                  type="url"
                  value={form.startingUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startingUrl: event.target.value,
                    }))
                  }
                  required
                />
              </Field>

              <Field>
                <Label htmlFor="study-allowed-domains">Allowed domains</Label>
                <textarea
                  id="study-allowed-domains"
                  className={textareaClassName}
                  value={form.allowedDomains}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      allowedDomains: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="study-run-budget">Run budget</Label>
                <Input
                  id="study-run-budget"
                  min="1"
                  step="1"
                  type="number"
                  value={form.runBudget}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      runBudget: event.target.value,
                    }))
                  }
                  required
                />
              </Field>

              <Field>
                <Label htmlFor="study-active-concurrency">Active concurrency</Label>
                <Input
                  id="study-active-concurrency"
                  min="1"
                  step="1"
                  type="number"
                  value={form.activeConcurrency}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      activeConcurrency: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="study-environment-label">Environment label</Label>
                <select
                  id="study-environment-label"
                  className={selectClassName}
                  value={form.environmentLabel}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      environmentLabel: event.target.value,
                    }))
                  }
                >
                  <option value="staging">staging</option>
                  <option value="qa">qa</option>
                  <option value="production">production</option>
                </select>
              </Field>

              <Field>
                <Label htmlFor="study-max-steps">Max steps</Label>
                <Input
                  id="study-max-steps"
                  min="1"
                  step="1"
                  type="number"
                  value={form.maxSteps}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      maxSteps: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="study-success-criteria">Success criteria</Label>
                <textarea
                  id="study-success-criteria"
                  className={textareaClassName}
                  value={form.successCriteria}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      successCriteria: event.target.value,
                    }))
                  }
                  required
                />
              </Field>

              <Field>
                <Label htmlFor="study-stop-conditions">Stop conditions</Label>
                <textarea
                  id="study-stop-conditions"
                  className={textareaClassName}
                  value={form.stopConditions}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      stopConditions: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="study-post-task-questions">
                  Post-task questions
                </Label>
                <textarea
                  id="study-post-task-questions"
                  className={textareaClassName}
                  value={form.postTaskQuestions}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      postTaskQuestions: event.target.value,
                    }))
                  }
                  required
                />
              </Field>

              <Field>
                <Label htmlFor="study-max-duration">
                  Max duration (seconds)
                </Label>
                <Input
                  id="study-max-duration"
                  min="1"
                  step="1"
                  type="number"
                  value={form.maxDurationSec}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      maxDurationSec: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guardrail review</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <SummaryValue
              label="Allowed actions"
              value={DEFAULT_ALLOWED_ACTIONS.join(", ")}
            />
            <SummaryValue
              label="Forbidden actions"
              value={DEFAULT_FORBIDDEN_ACTIONS.join(", ")}
            />
            <SummaryValue label="Locale" value="en-US" />
            <SummaryValue label="Viewport" value="1440 × 900" />
          </CardContent>
        </Card>

        {errorMessage ? (
          <p className="text-sm text-destructive">{errorMessage}</p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Saving study..." : "Save study draft"}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/studies">Cancel</Link>
          </Button>
        </div>
      </form>
    </section>
  );
}

function Field({ children }: { children: ReactNode }) {
  return <div className="grid gap-2">{children}</div>;
}

function parseLineSeparatedList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "string"
  ) {
    return error.data;
  }

  return fallback;
}

function studyFormToTaskSpec(form: StudyFormValue) {
  return {
    scenario: form.scenario,
    goal: form.goal,
    startingUrl: form.startingUrl,
    allowedDomains: parseLineSeparatedList(form.allowedDomains),
    allowedActions: [...DEFAULT_ALLOWED_ACTIONS],
    forbiddenActions: [...DEFAULT_FORBIDDEN_ACTIONS],
    successCriteria: parseLineSeparatedList(form.successCriteria),
    stopConditions: parseLineSeparatedList(form.stopConditions),
    postTaskQuestions: parseLineSeparatedList(form.postTaskQuestions),
    maxSteps: Number(form.maxSteps),
    maxDurationSec: Number(form.maxDurationSec),
    environmentLabel: form.environmentLabel,
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
  };
}

const textareaClassName =
  "min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

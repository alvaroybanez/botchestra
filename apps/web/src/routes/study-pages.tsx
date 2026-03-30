import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DEMO_STUDY_ID } from "@/routes/skeleton-pages";
import {
  demoRunSummary,
  demoRuns,
  demoStudyOverview,
} from "@/routes/study-demo-data";
import {
  RunStatusBadge,
  StudyStatusBadge,
  StudyTabsNav,
  emptyStudyDetailSearch,
  formatTimestamp,
  type StudyDetailSearch,
} from "@/routes/study-shared";

const DEFAULT_ALLOWED_ACTIONS = ["goto", "click", "type", "select", "scroll", "wait", "back", "finish"] as const;
const DEFAULT_FORBIDDEN_ACTIONS = ["payment_submission", "external_download"] as const;
const ACTIVE_RUN_STATUSES = new Set(["dispatching", "running"]);
const TERMINAL_OUTCOME_LABELS = [
  { key: "success", label: "Success" },
  { key: "hard_fail", label: "Hard fail" },
  { key: "soft_fail", label: "Soft fail" },
  { key: "gave_up", label: "Gave up" },
  { key: "timeout", label: "Timeout" },
  { key: "blocked_by_guardrail", label: "Guardrail blocked" },
  { key: "infra_error", label: "Infra error" },
  { key: "cancelled", label: "Cancelled" },
] as const;

type PersonaPackListItem = Doc<"personaPacks">;
type ActiveRunListItem = {
  _id: string;
  status: string;
  stepCount?: number;
  syntheticUserName: string;
  firstPersonBio: string;
};

type StudyFormValue = {
  personaPackId: string;
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

type StudyActionConfirmationState = {
  kind: "launch" | "cancel";
  title: string;
  description: string;
  confirmLabel: string;
  productionAck?: boolean;
};

const emptyStudyForm = (): StudyFormValue => ({
  personaPackId: "",
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

export function StudiesListPage() {
  const studies = useQuery(api.studies.listStudies, {});

  if (studies === undefined) {
    return (
      <StateCard
        body="Loading studies and run progress..."
        title="Studies"
      />
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Study Console
          </p>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">Studies</h2>
            <p className="max-w-3xl text-base text-muted-foreground">
              Browse every validation study, track orchestration progress, and
              jump into the overview, personas, runs, findings, and report tabs.
            </p>
          </div>
        </div>

        <Button asChild>
          <Link to="/studies/new">Create Study</Link>
        </Button>
      </div>

      {studies.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No studies yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              New workspaces start empty. Create your first study to define the
              task, persona coverage, and replay criteria for your next
              validation run.
            </p>
            <Button asChild>
              <Link to="/studies/new">Create your first study</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {studies.map((study: Doc<"studies">) => (
            <StudyListCard key={study._id} study={study} />
          ))}
        </div>
      )}
    </section>
  );
}

export function StudyCreationWizardPage() {
  const personaPacks = useQuery(api.personaPacks.list, {});
  const createStudy = useMutation(api.studies.createStudy);
  const navigate = useNavigate({ from: "/studies/new" });
  const [form, setForm] = useState<StudyFormValue>(emptyStudyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availablePacks = useMemo<PersonaPackListItem[]>(
    () =>
      (personaPacks ?? []).filter(
        (pack: PersonaPackListItem) => pack.status !== "archived",
      ),
    [personaPacks],
  );

  useEffect(() => {
    if (availablePacks.length === 0) {
      return;
    }

    setForm((current) =>
      current.personaPackId
        ? current
        : { ...current, personaPackId: availablePacks[0]!._id },
    );
  }, [availablePacks]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const createdStudy = await createStudy({
        study: {
          personaPackId: form.personaPackId as Id<"personaPacks">,
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

  if (personaPacks === undefined) {
    return (
      <StateCard
        body="Loading persona packs and creation controls..."
        title="New study"
      />
    );
  }

  if (availablePacks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No persona packs available</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Create or publish a persona pack before launching a new study. The
            creation wizard needs a pack to supply persona coverage.
          </p>
          <Button asChild variant="outline">
            <Link to="/persona-packs">Open Persona Packs</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Study Setup
        </p>
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight">
            Create a new study
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Configure the persona pack, task specification, run budget,
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
                <Label htmlFor="study-persona-pack">Persona pack selector</Label>
                <select
                  id="study-persona-pack"
                  className={selectClassName}
                  value={form.personaPackId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      personaPackId: event.target.value,
                    }))
                  }
                >
                  {availablePacks.map((pack: PersonaPackListItem) => (
                    <option key={pack._id} value={pack._id}>
                      {pack.name} ({pack.status})
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

export function StudyOverviewPage({
  detailSearch,
  studyId,
}: {
  detailSearch: StudyDetailSearch;
  studyId: string;
}) {
  if (studyId === DEMO_STUDY_ID) {
    return <DemoStudyOverviewPage detailSearch={detailSearch} />;
  }

  const study = useQuery(api.studies.getStudy, {
    studyId: studyId as Id<"studies">,
  });

  if (study === undefined) {
    return (
      <StateCard
        body="Loading study overview..."
        title="Study overview"
      />
    );
  }

  if (study === null) {
    return (
      <StateCard
        body="This study could not be found in the current organization."
        title="Study not found"
      />
    );
  }

  return (
    <StudyOverviewResolved
      detailSearch={detailSearch}
      study={study}
    />
  );
}

function DemoStudyOverviewPage({
  detailSearch,
}: {
  detailSearch: StudyDetailSearch;
}) {
  const overallCompletion = getCompletionPercentage(
    demoRunSummary.terminalCount,
    demoRunSummary.totalRuns,
  );
  const replayStatus = getReplayChipStatus(demoStudyOverview.status);
  const analysisStatus = getAnalysisChipStatus(demoStudyOverview.status);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-semibold tracking-tight">
              {demoStudyOverview.name}
            </h2>
            <StudyStatusBadge status={demoStudyOverview.status} />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {demoStudyOverview.description}
          </p>
        </div>

        <Button asChild variant="outline">
          <Link to="/studies">Back to Studies</Link>
        </Button>
      </div>

      <StudyTabsNav
        activeTab="overview"
        detailSearch={detailSearch}
        studyId={demoStudyOverview._id}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Task specification</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <SummaryValue
                label="Scenario"
                value={demoStudyOverview.taskSpec.scenario}
              />
              <SummaryValue
                label="Goal"
                value={demoStudyOverview.taskSpec.goal}
              />
              <SummaryValue
                label="Starting URL"
                value={demoStudyOverview.taskSpec.startingUrl}
              />
              <SummaryValue
                label="Allowed domains"
                value={demoStudyOverview.taskSpec.allowedDomains.join(", ")}
              />
              <SummaryValue
                label="Success criteria"
                value={demoStudyOverview.taskSpec.successCriteria.join(", ")}
              />
              <SummaryValue
                label="Stop conditions"
                value={demoStudyOverview.taskSpec.stopConditions.join(", ")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guardrails and questionnaire</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <SummaryValue
                label="Allowed actions"
                value={demoStudyOverview.taskSpec.allowedActions.join(", ")}
              />
              <SummaryValue
                label="Forbidden actions"
                value={demoStudyOverview.taskSpec.forbiddenActions.join(", ")}
              />
              <SummaryValue
                label="Locale"
                value={demoStudyOverview.taskSpec.locale}
              />
              <SummaryValue
                label="Viewport"
                value={`${demoStudyOverview.taskSpec.viewport.width} × ${demoStudyOverview.taskSpec.viewport.height}`}
              />
              <SummaryValue
                label="Post-task questions"
                value={demoStudyOverview.taskSpec.postTaskQuestions.join(", ")}
              />
              <SummaryValue
                label="Persona pack"
                value={demoStudyOverview.personaPackId}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Study summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <SummaryValue
                label="Run budget"
                value={String(demoStudyOverview.runBudget)}
              />
              <SummaryValue
                label="Active concurrency"
                value={String(demoStudyOverview.activeConcurrency)}
              />
              <SummaryValue
                label="Environment"
                value={demoStudyOverview.taskSpec.environmentLabel}
              />
              <SummaryValue
                label="Last updated"
                value={formatTimestamp(demoStudyOverview.updatedAt)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live monitor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <PhaseStatusChip
                    label="Replay"
                    tone={replayStatus.tone}
                    value={replayStatus.label}
                  />
                  <PhaseStatusChip
                    label="Analysis"
                    tone={analysisStatus.tone}
                    value={analysisStatus.label}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Completion progress
                      </p>
                      <p className="text-2xl font-semibold tracking-tight">
                        {overallCompletion}% complete
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {demoRunSummary.terminalCount} of {demoRunSummary.totalRuns} runs
                      {" "}
                      reached a terminal outcome
                    </p>
                  </div>
                  <ProgressBar
                    value={overallCompletion}
                    valueText={`${overallCompletion}% complete`}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SummaryValue
                  label="Completed"
                  value={`${demoRunSummary.terminalCount} / ${demoRunSummary.totalRuns}`}
                />
                <SummaryValue
                  label="Running"
                  value={String(demoRunSummary.runningCount)}
                />
                <SummaryValue
                  label="Queued / dispatching"
                  value={String(demoRunSummary.queuedCount)}
                />
                <SummaryValue
                  label="Active variants"
                  value="0"
                />
              </div>

              <Button asChild variant="outline">
                <Link
                  params={{ studyId: demoStudyOverview._id }}
                  search={detailSearch}
                  to="/studies/$studyId/runs"
                >
                  Open runs tab
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outcome breakdown</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {TERMINAL_OUTCOME_LABELS.map((outcome) => (
                <SummaryValue
                  key={outcome.key}
                  label={outcome.label}
                  value={String(demoRunSummary.outcomeCounts[outcome.key])}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active persona variants</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-dashed bg-background p-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  Demo runs are complete, so there are no persona variants
                  actively dispatching or running right now.
                </p>
              </div>

              <div className="grid gap-3">
                {demoRuns.map((run) => (
                  <div
                    className="rounded-lg border bg-background p-4"
                    key={run._id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">{run.syntheticUserName}</p>
                        <p className="text-sm text-muted-foreground">
                          {run.finalOutcome ?? run.status}
                        </p>
                      </div>
                      <RunStatusBadge status={run.status} />
                    </div>

                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {run.firstPersonBio}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

export function StudyFindingsPage({
  detailSearch,
  studyId,
}: {
  detailSearch: StudyDetailSearch;
  studyId: string;
}) {
  return (
    <StudyStatusPage
      activeTab="findings"
      detailSearch={detailSearch}
      studyId={studyId}
      title="Findings"
      description="Finding clusters appear here after replay verification and analysis complete for the selected study."
    />
  );
}

export function StudyReportPage({
  detailSearch,
  studyId,
}: {
  detailSearch: StudyDetailSearch;
  studyId: string;
}) {
  return (
    <StudyStatusPage
      activeTab="report"
      detailSearch={detailSearch}
      studyId={studyId}
      title="Report"
      description="The ranked report appears here once the analysis pipeline produces a study report artifact."
    />
  );
}

function StudyListCard({ study }: { study: Doc<"studies"> }) {
  const runSummary = useQuery(api.runs.getRunSummary, { studyId: study._id });

  return (
    <Link
      className="block rounded-xl border bg-card p-6 shadow-sm transition-colors hover:border-primary hover:bg-muted/30"
      params={{ studyId: study._id }}
      search={emptyStudyDetailSearch}
      to="/studies/$studyId/overview"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold tracking-tight">{study.name}</h3>
            <StudyStatusBadge status={study.status} />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {study.description ?? "No description provided yet."}
          </p>
        </div>

        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:min-w-80">
          <SummaryValue
            label="Run progress"
            value={
              runSummary === undefined
                ? "Loading..."
                : `${runSummary.terminalCount}/${runSummary.totalRuns} terminal · ${runSummary.runningCount} running · ${runSummary.queuedCount} queued`
            }
          />
          <SummaryValue
            label="Run budget"
            value={String(study.runBudget ?? 0)}
          />
          <SummaryValue
            label="Environment"
            value={study.taskSpec.environmentLabel}
          />
          <SummaryValue
            label="Last updated"
            value={formatTimestamp(study.updatedAt)}
          />
        </div>
      </div>
    </Link>
  );
}

function StudyOverviewResolved({
  detailSearch,
  study,
}: {
  detailSearch: StudyDetailSearch;
  study: Doc<"studies">;
}) {
  const viewerAccess = useQuery((api as any).rbac.getViewerAccess, {});
  const updateStudy = useMutation(api.studies.updateStudy);
  const launchStudy = useMutation(api.studies.launchStudy);
  const cancelStudy = useMutation(api.studies.cancelStudy);
  const runSummary = useQuery(api.runs.getRunSummary, { studyId: study._id });
  const runs = useQuery(api.runs.listRuns, { studyId: study._id });
  const [form, setForm] = useState<StudyFormValue>(() => studyToFormValue(study));
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmationState, setConfirmationState] =
    useState<StudyActionConfirmationState | null>(null);

  useEffect(() => {
    setForm(studyToFormValue(study));
  }, [study._id, study.updatedAt]);

  const activeRuns = useMemo<ActiveRunListItem[]>(
    () =>
      (runs ?? [])
        .filter((run: ActiveRunListItem) => ACTIVE_RUN_STATUSES.has(run.status))
        .sort((left: ActiveRunListItem, right: ActiveRunListItem) => {
          if (left.status !== right.status) {
            return left.status === "running" ? -1 : 1;
          }

          return (right.stepCount ?? 0) - (left.stepCount ?? 0);
        }),
    [runs],
  );
  const overallCompletion =
    runSummary === undefined
      ? undefined
      : getCompletionPercentage(runSummary.terminalCount, runSummary.totalRuns);
  const replayStatus = getReplayChipStatus(study.status);
  const analysisStatus = getAnalysisChipStatus(study.status);
  const canManageStudies = viewerAccess?.permissions.canManageStudies === true;
  const canEditStudy = canManageStudies && study.status === "draft";
  const canLaunchStudy =
    canManageStudies &&
    (study.status === "draft" ||
      study.status === "persona_review" ||
      study.status === "ready");
  const canCancelStudy =
    canManageStudies &&
    (study.status === "persona_review" ||
      study.status === "queued" ||
      study.status === "running" ||
      study.status === "replaying");

  async function handleSaveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setActionError(null);
    setFeedbackMessage(null);
    setIsSavingDraft(true);

    try {
      await updateStudy({
        studyId: study._id,
        patch: {
          name: form.name,
          ...(form.description.trim()
            ? { description: form.description.trim() }
            : {}),
          taskSpec: studyFormToTaskSpec(form),
          runBudget: Number(form.runBudget),
          activeConcurrency: Number(form.activeConcurrency),
        },
      });

      setFeedbackMessage("Study draft saved.");
      setIsEditing(false);
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not update study."));
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function handleConfirmAction() {
    if (!confirmationState) {
      return;
    }

    setActionError(null);
    setFeedbackMessage(null);
    setIsSubmittingAction(true);

    try {
      if (confirmationState.kind === "launch") {
        await launchStudy({
          studyId: study._id,
          ...(confirmationState.productionAck ? { productionAck: true } : {}),
        });
        setFeedbackMessage("Study launch started.");
        setIsEditing(false);
      } else {
        await cancelStudy({ studyId: study._id });
        setFeedbackMessage("Study cancellation requested.");
      }

      setConfirmationState(null);
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not update study status."));
    } finally {
      setIsSubmittingAction(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-semibold tracking-tight">{study.name}</h2>
            <StudyStatusBadge status={study.status} />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {study.description ?? "No study description has been added yet."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {canEditStudy ? (
            <Button
              onClick={() => {
                setActionError(null);
                setFeedbackMessage(null);
                setForm(studyToFormValue(study));
                setIsEditing((current) => !current);
              }}
              variant={isEditing ? "secondary" : "default"}
            >
              {isEditing ? "Close Editor" : "Edit Study"}
            </Button>
          ) : null}

          {canLaunchStudy ? (
            <Button
              onClick={() =>
                setConfirmationState({
                  kind: "launch",
                  title: "Launch study?",
                  description:
                    study.taskSpec.environmentLabel === "production"
                      ? "Launching against production requires acknowledgement. Confirm to generate any missing variants, queue the study, and start execution."
                      : "Confirm to generate any missing variants, queue the study, and start execution.",
                  confirmLabel: "Confirm Launch",
                  productionAck: study.taskSpec.environmentLabel === "production",
                })
              }
            >
              Launch Study
            </Button>
          ) : null}

          {canCancelStudy ? (
            <Button
              onClick={() =>
                setConfirmationState({
                  kind: "cancel",
                  title: "Cancel study?",
                  description:
                    "Cancel the remaining queued or active runs for this study. This cannot be undone.",
                  confirmLabel: "Confirm Cancellation",
                })
              }
              variant="outline"
            >
              Cancel Study
            </Button>
          ) : null}

          <Button asChild variant="outline">
            <Link to="/studies">Back to Studies</Link>
          </Button>
        </div>
      </div>

      {feedbackMessage ? (
        <p className="text-sm text-emerald-700">{feedbackMessage}</p>
      ) : null}
      {actionError ? (
        <p className="text-sm text-destructive">{actionError}</p>
      ) : null}

      <StudyTabsNav
        activeTab="overview"
        detailSearch={detailSearch}
        studyId={study._id}
      />

      {isEditing ? (
        <StudyDraftEditor
          form={form}
          isSubmitting={isSavingDraft}
          onCancel={() => {
            setForm(studyToFormValue(study));
            setIsEditing(false);
            setActionError(null);
            setFeedbackMessage(null);
          }}
          onChange={setForm}
          onSubmit={handleSaveDraft}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Task specification</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <SummaryValue label="Scenario" value={study.taskSpec.scenario} />
              <SummaryValue label="Goal" value={study.taskSpec.goal} />
              <SummaryValue
                label="Starting URL"
                value={study.taskSpec.startingUrl}
              />
              <SummaryValue
                label="Allowed domains"
                value={study.taskSpec.allowedDomains.join(", ")}
              />
              <SummaryValue
                label="Success criteria"
                value={study.taskSpec.successCriteria.join(", ")}
              />
              <SummaryValue
                label="Stop conditions"
                value={study.taskSpec.stopConditions.join(", ")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guardrails and questionnaire</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <SummaryValue
                label="Allowed actions"
                value={study.taskSpec.allowedActions.join(", ")}
              />
              <SummaryValue
                label="Forbidden actions"
                value={study.taskSpec.forbiddenActions.join(", ")}
              />
              <SummaryValue label="Locale" value={study.taskSpec.locale} />
              <SummaryValue
                label="Viewport"
                value={`${study.taskSpec.viewport.width} × ${study.taskSpec.viewport.height}`}
              />
              <SummaryValue
                label="Post-task questions"
                value={study.taskSpec.postTaskQuestions.join(", ")}
              />
              <SummaryValue
                label="Persona pack"
                value={study.personaPackId}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Study summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <SummaryValue
                label="Run budget"
                value={String(study.runBudget ?? 0)}
              />
              <SummaryValue
                label="Active concurrency"
                value={String(study.activeConcurrency)}
              />
              <SummaryValue
                label="Environment"
                value={study.taskSpec.environmentLabel}
              />
              <SummaryValue
                label="Last updated"
                value={formatTimestamp(study.updatedAt)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live monitor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <PhaseStatusChip
                    label="Replay"
                    tone={replayStatus.tone}
                    value={replayStatus.label}
                  />
                  <PhaseStatusChip
                    label="Analysis"
                    tone={analysisStatus.tone}
                    value={analysisStatus.label}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Completion progress
                      </p>
                      <p className="text-2xl font-semibold tracking-tight">
                        {overallCompletion === undefined
                          ? "Loading..."
                          : `${overallCompletion}% complete`}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {runSummary === undefined
                        ? "Waiting for run updates..."
                        : `${runSummary.terminalCount} of ${runSummary.totalRuns} runs reached a terminal outcome`}
                    </p>
                  </div>
                  <ProgressBar
                    value={overallCompletion ?? 0}
                    valueText={
                      overallCompletion === undefined
                        ? "Loading overall completion"
                        : `${overallCompletion}% complete`
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SummaryValue
                  label="Completed"
                  value={
                    runSummary === undefined
                      ? "Loading..."
                      : `${runSummary.terminalCount} / ${runSummary.totalRuns}`
                  }
                />
                <SummaryValue
                  label="Running"
                  value={
                    runSummary === undefined
                      ? "Loading..."
                      : String(runSummary.runningCount)
                  }
                />
                <SummaryValue
                  label="Queued / dispatching"
                  value={
                    runSummary === undefined
                      ? "Loading..."
                      : String(runSummary.queuedCount)
                  }
                />
                <SummaryValue
                  label="Active variants"
                  value={
                    runs === undefined
                      ? "Loading..."
                      : String(activeRuns.length)
                  }
                />
              </div>

              <Button asChild variant="outline">
                <Link
                  params={{ studyId: study._id }}
                  search={detailSearch}
                  to="/studies/$studyId/runs"
                >
                  Open runs tab
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outcome breakdown</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {TERMINAL_OUTCOME_LABELS.map((outcome) => (
                <SummaryValue
                  key={outcome.key}
                  label={outcome.label}
                  value={
                    runSummary === undefined
                      ? "Loading..."
                      : String(runSummary.outcomeCounts[outcome.key])
                  }
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active persona variants</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {runs === undefined ? (
                <p className="text-sm text-muted-foreground">
                  Loading currently dispatching and running variants...
                </p>
              ) : activeRuns.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-background p-4">
                  <p className="text-sm leading-6 text-muted-foreground">
                    No persona variants are actively dispatching or running for
                    this study right now.
                  </p>
                </div>
              ) : (
                activeRuns.map((run: ActiveRunListItem) => {
                  const stepProgress = getCompletionPercentage(
                    run.stepCount ?? 0,
                    study.taskSpec.maxSteps,
                  );

                  return (
                    <div
                      key={run._id}
                      className="rounded-lg border bg-background p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{run.syntheticUserName}</p>
                          <p className="text-sm text-muted-foreground">
                            {run._id}
                          </p>
                        </div>
                        <RunStatusBadge status={run.status} />
                      </div>

                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {run.firstPersonBio}
                      </p>

                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                          <span>Step {(run.stepCount ?? 0).toString()}</span>
                          <span>{stepProgress}% of step budget</span>
                        </div>
                        <ProgressBar
                          value={stepProgress}
                          valueText={`${stepProgress}% of step budget`}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <StudyConfirmationDialog
        confirmLabel={confirmationState?.confirmLabel ?? "Confirm"}
        description={confirmationState?.description ?? ""}
        isOpen={confirmationState !== null}
        isSubmitting={isSubmittingAction}
        title={confirmationState?.title ?? ""}
        onCancel={() => setConfirmationState(null)}
        onConfirm={() => void handleConfirmAction()}
      />
    </section>
  );
}

function StudyStatusPage({
  activeTab,
  detailSearch,
  studyId,
  title,
  description,
}: {
  activeTab: "findings" | "report";
  detailSearch: StudyDetailSearch;
  studyId: string;
  title: string;
  description: string;
}) {
  const study = useQuery(api.studies.getStudy, {
    studyId: studyId as Id<"studies">,
  });

  if (study === undefined) {
    return <StateCard body={`Loading ${title.toLowerCase()}...`} title={title} />;
  }

  if (study === null) {
    return (
      <StateCard
        body="This study could not be found in the current organization."
        title="Study not found"
      />
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
            <StudyStatusBadge status={study.status} />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>

        <Button asChild variant="outline">
          <Link to="/studies">Back to Studies</Link>
        </Button>
      </div>

      <StudyTabsNav
        activeTab={activeTab}
        detailSearch={detailSearch}
        studyId={study._id}
      />

      <Card>
        <CardHeader>
          <CardTitle>{title} status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            {study.status === "completed" || study.status === "analyzing"
              ? `The study is ${study.status}. This tab is ready for analysis outputs once the dedicated findings and report surfaces land.`
              : `The study is currently ${study.status}. Findings and report artifacts will populate after the orchestration pipeline reaches analysis.`}
          </p>
          <SummaryValue label="Study ID" value={study._id} />
          <SummaryValue
            label="Last updated"
            value={formatTimestamp(study.updatedAt)}
          />
        </CardContent>
      </Card>
    </section>
  );
}

function StudyDraftEditor({
  form,
  isSubmitting,
  onCancel,
  onChange,
  onSubmit,
}: {
  form: StudyFormValue;
  isSubmitting: boolean;
  onCancel: () => void;
  onChange: React.Dispatch<React.SetStateAction<StudyFormValue>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Edit study draft</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <Label htmlFor="study-name">Study name</Label>
              <Input
                id="study-name"
                value={form.name}
                onChange={(event) =>
                  onChange((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </Field>

            <Field>
              <Label htmlFor="study-starting-url">Starting URL</Label>
              <Input
                id="study-starting-url"
                type="url"
                value={form.startingUrl}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    startingUrl: event.target.value,
                  }))
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
                onChange((current) => ({
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
                  onChange((current) => ({
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
                  onChange((current) => ({ ...current, goal: event.target.value }))
                }
                required
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <Label htmlFor="study-allowed-domains">Allowed domains</Label>
              <textarea
                id="study-allowed-domains"
                className={textareaClassName}
                value={form.allowedDomains}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    allowedDomains: event.target.value,
                  }))
                }
                required
              />
            </Field>

            <Field>
              <Label htmlFor="study-environment-label">Environment label</Label>
              <select
                id="study-environment-label"
                className={selectClassName}
                value={form.environmentLabel}
                onChange={(event) =>
                  onChange((current) => ({
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
                  onChange((current) => ({
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
                  onChange((current) => ({
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
              <Label htmlFor="study-success-criteria">Success criteria</Label>
              <textarea
                id="study-success-criteria"
                className={textareaClassName}
                value={form.successCriteria}
                onChange={(event) =>
                  onChange((current) => ({
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
                  onChange((current) => ({
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
                  onChange((current) => ({
                    ...current,
                    postTaskQuestions: event.target.value,
                  }))
                }
                required
              />
            </Field>

            <div className="grid gap-4">
              <Field>
                <Label htmlFor="study-max-steps">Max steps</Label>
                <Input
                  id="study-max-steps"
                  min="1"
                  step="1"
                  type="number"
                  value={form.maxSteps}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      maxSteps: event.target.value,
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
                    onChange((current) => ({
                      ...current,
                      maxDurationSec: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving study..." : "Save Study"}
        </Button>
        <Button onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
      </div>
    </form>
  );
}

function StudyConfirmationDialog({
  confirmLabel,
  description,
  isOpen,
  isSubmitting,
  title,
  onCancel,
  onConfirm,
}: {
  confirmLabel: string;
  description: string;
  isOpen: boolean;
  isSubmitting: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>

          <div className="flex flex-wrap justify-end gap-3">
            <Button disabled={isSubmitting} onClick={onCancel} variant="outline">
              Cancel
            </Button>
            <Button disabled={isSubmitting} onClick={onConfirm}>
              {isSubmitting ? "Working..." : confirmLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StateCard({ title, body }: { title: string; body: string }) {
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

function Field({ children }: { children: ReactNode }) {
  return <div className="grid gap-2">{children}</div>;
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function ProgressBar({
  value,
  valueText,
}: {
  value: number;
  valueText: string;
}) {
  return (
    <div
      aria-label={valueText}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={value}
      className="h-2 rounded-full bg-muted"
      role="progressbar"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
}

function PhaseStatusChip({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "idle" | "active" | "complete";
  value: string;
}) {
  return (
    <div
      aria-label={`${label}: ${value}`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
        tone === "idle" && "bg-muted text-muted-foreground",
        tone === "active" && "bg-primary/10 text-primary",
        tone === "complete" && "bg-emerald-100 text-emerald-800",
      )}
    >
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function getCompletionPercentage(count: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((count / total) * 100);
}

function getReplayChipStatus(studyStatus: Doc<"studies">["status"]) {
  if (studyStatus === "replaying") {
    return { label: "Replaying", tone: "active" as const };
  }

  if (studyStatus === "analyzing" || studyStatus === "completed") {
    return { label: "Complete", tone: "complete" as const };
  }

  return { label: "Waiting", tone: "idle" as const };
}

function getAnalysisChipStatus(studyStatus: Doc<"studies">["status"]) {
  if (studyStatus === "analyzing") {
    return { label: "Analyzing", tone: "active" as const };
  }

  if (studyStatus === "completed") {
    return { label: "Complete", tone: "complete" as const };
  }

  return { label: "Waiting", tone: "idle" as const };
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

function studyToFormValue(study: Doc<"studies">): StudyFormValue {
  return {
    personaPackId: study.personaPackId,
    name: study.name,
    description: study.description ?? "",
    scenario: study.taskSpec.scenario,
    goal: study.taskSpec.goal,
    startingUrl: study.taskSpec.startingUrl,
    allowedDomains: study.taskSpec.allowedDomains.join("\n"),
    successCriteria: study.taskSpec.successCriteria.join("\n"),
    stopConditions: study.taskSpec.stopConditions.join("\n"),
    postTaskQuestions: study.taskSpec.postTaskQuestions.join("\n"),
    runBudget: String(study.runBudget ?? 0),
    activeConcurrency: String(study.activeConcurrency),
    environmentLabel: study.taskSpec.environmentLabel,
    maxSteps: String(study.taskSpec.maxSteps),
    maxDurationSec: String(study.taskSpec.maxDurationSec),
  };
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

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

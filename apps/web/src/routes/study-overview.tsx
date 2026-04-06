import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { motion } from "motion/react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StudyDraftEditor, type StudyFormValue } from "@/routes/study-draft-editor";
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
import { SummaryValue } from "@/components/summary-value";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AnimatedList } from "@/components/animated-list";

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

type PersonaConfigListItem = Doc<"personaConfigs">;
type ActiveRunListItem = {
  _id: string;
  status: string;
  stepCount?: number;
  syntheticUserName: string;
  firstPersonBio: string;
};

type StudyActionConfirmationState = {
  kind: "launch" | "cancel";
  title: string;
  description: string;
  confirmLabel: string;
  productionAck?: boolean;
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
      <EmptyState
        title="Study overview"
        description="Loading study overview..."
      />
    );
  }

  if (study === null) {
    return (
      <EmptyState
        title="Study not found"
        description="This study could not be found in the current organization."
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
      <PageHeader
        title={demoStudyOverview.name}
        badge={<StudyStatusBadge status={demoStudyOverview.status} />}
        description={demoStudyOverview.description}
        actions={
          <Button asChild variant="outline">
            <Link to="/studies">Back to Studies</Link>
          </Button>
        }
      />

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
                label="Persona configuration"
                value={demoStudyOverview.personaConfigId}
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
                      <p className="font-heading text-2xl tracking-tight">
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
              <div className="rounded-xl border border-dashed border-border/50 bg-card/30 p-6">
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
      <PageHeader
        title={study.name}
        badge={<StudyStatusBadge status={study.status} />}
        description={study.description ?? "No study description has been added yet."}
        actions={
          <>
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
          </>
        }
      />

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
                label="Persona configuration"
                value={study.personaConfigId}
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
                      <p className="font-heading text-2xl tracking-tight">
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
                <div className="rounded-xl border border-dashed border-border/50 bg-card/30 p-6">
                  <p className="text-sm leading-6 text-muted-foreground">
                    No persona variants are actively dispatching or running for
                    this study right now.
                  </p>
                </div>
              ) : (
                <AnimatedList
                  items={activeRuns}
                  keyExtractor={(run: ActiveRunListItem) => run._id}
                  renderItem={(run: ActiveRunListItem) => {
                    const stepProgress = getCompletionPercentage(
                      run.stepCount ?? 0,
                      study.taskSpec.maxSteps,
                    );

                    return (
                      <div
                        className={cn(
                          "rounded-lg border bg-background p-4",
                          run.status === "running" && "ring-1 ring-blue-300/50",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-medium">{run.syntheticUserName}</p>
                            <p className="text-sm text-muted-foreground">
                              {run._id}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {run.status === "running" && (
                              <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
                              </span>
                            )}
                            <RunStatusBadge status={run.status} />
                          </div>
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
                  }}
                  staggerDelay={0.05}
                  initialY={8}
                  className="space-y-3"
                />
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
      className="h-1.5 overflow-hidden rounded-full bg-accent"
      role="progressbar"
    >
      <motion.div
        className="h-full rounded-full bg-foreground"
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
        transition={{ type: "spring", visualDuration: 0.6, bounce: 0.1 }}
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
    personaConfigId: study.personaConfigId,
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

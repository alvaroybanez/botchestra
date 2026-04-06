import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClassName } from "@/components/filter-bar";

export type StudyFormValue = {
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

export function StudyDraftEditor({
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

function Field({ children }: { children: ReactNode }) {
  return <div className="grid gap-2">{children}</div>;
}

const textareaClassName =
  "min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

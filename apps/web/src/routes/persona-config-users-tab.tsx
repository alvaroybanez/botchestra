import { Link } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  PersonaGenerationSection,
  type BatchGenerationRunView,
} from "@/components/persona-generation-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type PersonaConfigDoc,
  type SyntheticUserDoc,
  type SyntheticUserFormValue,
  type TranscriptId,
  type ViewerAccess,
  textareaClassName,
} from "@/routes/persona-config-shared";

export type UsersTabContentProps = {
  config: PersonaConfigDoc;
  isDraft: boolean;
  resolvedStatus: PersonaConfigDoc["status"] | null | undefined;
  syntheticUserList: SyntheticUserDoc[];
  syntheticUserForm: SyntheticUserFormValue;
  setSyntheticUserForm: (value: SyntheticUserFormValue | ((current: SyntheticUserFormValue) => SyntheticUserFormValue)) => void;
  isProtoFormOpen: boolean;
  setIsProtoFormOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  isSavingSyntheticUser: boolean;
  handleCreateSyntheticUser: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  batchGenerationRun: BatchGenerationRunView | null;
  viewerAccess: ViewerAccess;
  onRegenerateUser: (syntheticUserId: Id<"syntheticUsers">) => Promise<unknown>;
  onStartGeneration: (levelsPerAxis: Record<string, number>) => Promise<unknown>;
};

export function UsersTabContent({
  config,
  isDraft,
  resolvedStatus,
  syntheticUserList,
  syntheticUserForm,
  setSyntheticUserForm,
  isProtoFormOpen,
  setIsProtoFormOpen,
  isSavingSyntheticUser,
  handleCreateSyntheticUser,
  batchGenerationRun,
  viewerAccess,
  onRegenerateUser,
  onStartGeneration,
}: UsersTabContentProps) {
  return (
    <div className="space-y-4">
              <PersonaGenerationSection
                axes={config.sharedAxes}
                batchGenerationRun={batchGenerationRun ?? null}
                canManageGeneration={viewerAccess?.permissions.canManagePersonaConfigs === true}
                configStatus={resolvedStatus ?? config.status}
                syntheticUsers={syntheticUserList}
                onRegenerateUser={onRegenerateUser}
                onStartGeneration={onStartGeneration}
              />

              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>Synthetic Users</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Review the persona configuration&apos;s source synthetic users and the evidence
                      used to anchor them.
                    </p>
                  </div>
                  {isDraft ? (
                    <Button
                      variant="outline"
                      onClick={() => setIsProtoFormOpen((current) => !current)}
                    >
                      {isProtoFormOpen ? "Close form" : "Add synthetic user"}
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-4">
                  {isProtoFormOpen ? (
                    <form
                      className="space-y-4 rounded-xl border bg-background p-4"
                      onSubmit={handleCreateSyntheticUser}
                    >
                      <div className="grid gap-2">
                        <Label htmlFor="create-proto-name">Name</Label>
                        <Input
                          id="create-proto-name"
                          value={syntheticUserForm.name}
                          onChange={(event) =>
                            setSyntheticUserForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="create-proto-summary">Summary</Label>
                        <textarea
                          id="create-proto-summary"
                          className={textareaClassName}
                          value={syntheticUserForm.summary}
                          onChange={(event) =>
                            setSyntheticUserForm((current) => ({
                              ...current,
                              summary: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="create-proto-evidence">
                          Evidence snippets
                        </Label>
                        <textarea
                          id="create-proto-evidence"
                          className={textareaClassName}
                          value={syntheticUserForm.evidenceText}
                          onChange={(event) =>
                            setSyntheticUserForm((current) => ({
                              ...current,
                              evidenceText: event.target.value,
                            }))
                          }
                          placeholder="One snippet per line"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="create-proto-notes">Notes</Label>
                        <textarea
                          id="create-proto-notes"
                          className={textareaClassName}
                          value={syntheticUserForm.notes}
                          onChange={(event) =>
                            setSyntheticUserForm((current) => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <p className="text-xs leading-5 text-muted-foreground">
                        New synthetic users inherit the current shared axes so you
                        can quickly draft content before publishing.
                      </p>

                      <Button disabled={isSavingSyntheticUser} type="submit">
                        {isSavingSyntheticUser ? "Saving..." : "Save synthetic user"}
                      </Button>
                    </form>
                  ) : null}

                  {syntheticUserList.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-background p-6">
                      <p className="text-sm leading-6 text-muted-foreground">
                        No synthetic users yet. Add the first synthetic user to make
                        this draft persona configuration publishable.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {syntheticUserList.map((syntheticUser) => (
                        <SyntheticUserCard
                          key={syntheticUser._id}
                          syntheticUser={syntheticUser}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
    </div>
  );
}

export function SyntheticUserCard({ syntheticUser }: { syntheticUser: SyntheticUserDoc }) {
  const isTranscriptDerived = syntheticUser.sourceType === "transcript_derived";

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-lg font-semibold">{syntheticUser.name}</h4>
          <p className="text-sm text-muted-foreground">Source: {syntheticUser.sourceType}</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {syntheticUser.axes.length} axes
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {syntheticUser.summary}
      </p>

      {syntheticUser.evidenceSnippets.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Evidence snippets</p>
          <ul className="space-y-2">
            {syntheticUser.evidenceSnippets.map((snippet, index) => (
              <li
                key={`${syntheticUser._id}-${index}`}
              >
                {isTranscriptDerived && syntheticUser.sourceRefs[index] ? (
                  <Link
                    className="block rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                    params={{
                      transcriptId: syntheticUser.sourceRefs[index] as TranscriptId,
                    }}
                    search={{ highlightSnippet: snippet }}
                    to="/transcripts/$transcriptId"
                  >
                    {snippet}
                  </Link>
                ) : (
                  <div className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
                    {snippet}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {syntheticUser.notes ? (
        <div className="mt-4">
          <p className="text-sm font-medium">Notes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {syntheticUser.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}

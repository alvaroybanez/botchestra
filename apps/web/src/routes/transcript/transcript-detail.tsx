import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { NotFoundPlaceholder } from "@/routes/placeholders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/domain/page-header";
import { ConfigStatusBadge } from "@/components/domain/status-badge";
import { SummaryValue } from "@/components/domain/summary-value";
import type {
  PersonaConfigDoc,
  TranscriptContent,
  TranscriptDoc,
  TranscriptMetadataFormState,
  ViewerAccess,
} from "./types";
import {
  emptyTranscriptMetadataForm,
  formatTimestamp,
  formatTranscriptStatus,
  getErrorMessage,
  parseTags,
  statusBadgeVariant,
} from "./helpers";
import { TranscriptContentCard } from "./transcript-viewer";
import { MetadataPanel } from "./metadata-panel";

export function TranscriptDetailPage({
  transcriptId,
  highlightSnippet = "",
}: {
  transcriptId: string;
  highlightSnippet?: string;
}) {
  const navigate = useNavigate();
  const normalizedTranscriptId = useQuery((api as any).transcripts.normalizeTranscriptId, {
    transcriptId,
  }) as TranscriptDoc["_id"] | null | undefined;
  const transcriptQuery = useQuery(
    (api as any).transcripts.getTranscript,
    normalizedTranscriptId ? { transcriptId: normalizedTranscriptId } : "skip",
  ) as TranscriptDoc | null | undefined;
  const viewerAccess = useQuery((api as any).rbac.getViewerAccess, {}) as
    | ViewerAccess
    | undefined;
  const configs = useQuery(api.personaConfigs.list, {}) as PersonaConfigDoc[] | undefined;
  const transcriptPacks = useQuery(
    (api as any).configTranscripts.listTranscriptConfigs,
    normalizedTranscriptId ? { transcriptId: normalizedTranscriptId } : "skip",
  ) as
    | Array<{
        configId: Id<"personaConfigs">;
        config: PersonaConfigDoc;
      }>
    | undefined;
  const getTranscriptContent = useAction((api as any).transcripts.getTranscriptContent);
  const updateTranscriptMetadata = useMutation((api as any).transcripts.updateTranscriptMetadata);
  const deleteTranscript = useMutation((api as any).transcripts.deleteTranscript);
  const attachTranscript = useMutation((api as any).configTranscripts.attachTranscript);
  const detachTranscript = useMutation((api as any).configTranscripts.detachTranscript);

  const [transcript, setTranscript] = useState<TranscriptDoc | null>(null);
  const [content, setContent] = useState<TranscriptContent>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [metadataForm, setMetadataForm] = useState<TranscriptMetadataFormState>(
    emptyTranscriptMetadataForm(),
  );
  const [isAttachDialogOpen, setIsAttachDialogOpen] = useState(false);
  const [configSearchText, setPackSearchText] = useState("");
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [detachingPackId, setDetachingPackId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);

  useEffect(() => {
    if (normalizedTranscriptId === null) {
      setTranscript(null);
      return;
    }

    if (transcriptQuery !== undefined) {
      setTranscript(transcriptQuery);
    }
  }, [normalizedTranscriptId, transcriptQuery]);

  useEffect(() => {
    if (transcript === null) {
      setMetadataForm(emptyTranscriptMetadataForm());
      return;
    }

    setMetadataForm({
      participantId: transcript.metadata.participantId ?? "",
      tags: transcript.metadata.tags.join(", "),
      notes: transcript.metadata.notes ?? "",
    });
  }, [transcript?._id, transcript?.updatedAt]);

  useEffect(() => {
    if (transcript === null) {
      setContent(null);
      setContentError(null);
      return;
    }

    const transcriptId = transcript._id;
    let cancelled = false;

    async function loadTranscriptContent() {
      setIsContentLoading(true);
      setContentError(null);

      try {
        const nextContent = await getTranscriptContent({
          transcriptId,
        }) as TranscriptContent;

        if (!cancelled) {
          setContent(nextContent);
        }
      } catch (error) {
        if (!cancelled) {
          setContent(null);
          setContentError(
            getErrorMessage(error, "Could not load transcript content."),
          );
        }
      } finally {
        if (!cancelled) {
          setIsContentLoading(false);
        }
      }
    }

    void loadTranscriptContent();

    return () => {
      cancelled = true;
    };
  }, [getTranscriptContent, transcript?._id]);

  useEffect(() => {
    if (highlightSnippet.trim().length === 0 || isContentLoading) {
      return;
    }

    const timeout = window.setTimeout(() => {
      document
        .querySelector<HTMLElement>("[data-highlighted-snippet='true']")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 50);

    return () => window.clearTimeout(timeout);
  }, [content, highlightSnippet, isContentLoading]);

  const canManageTranscripts =
    viewerAccess?.permissions.canManagePersonaConfigs === true;
  const isLoading =
    normalizedTranscriptId === undefined
    || viewerAccess === undefined
    || configs === undefined
    || (normalizedTranscriptId !== null && transcriptQuery === undefined)
    || (normalizedTranscriptId !== null && transcriptPacks === undefined);
  const attachedPackIds = new Set(
    (transcriptPacks ?? []).map((configTranscript) => String(configTranscript.configId)),
  );
  const attachablePacks = (configs ?? []).filter(
    (config) =>
      config.status === "draft" && !attachedPackIds.has(String(config._id)),
  );
  const filteredAttachablePacks = useMemo(() => {
    const normalizedSearch = configSearchText.trim().toLowerCase();

    if (normalizedSearch.length === 0) {
      return attachablePacks;
    }

    return attachablePacks.filter((config) =>
      [config.name, config.description, config.context]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [attachablePacks, configSearchText]);

  async function handleSaveMetadata(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (transcript === null) {
      return;
    }

    setIsSavingMetadata(true);
    setPageError(null);
    setPageNotice(null);

    try {
      await updateTranscriptMetadata({
        metadata: {
          ...(metadataForm.participantId.trim().length > 0
            ? { participantId: metadataForm.participantId.trim() }
            : {}),
          tags: parseTags(metadataForm.tags),
          ...(metadataForm.notes.trim().length > 0
            ? { notes: metadataForm.notes.trim() }
            : {}),
        },
        transcriptId: transcript._id,
      });

      setTranscript((current) =>
        current === null
          ? current
          : {
              ...current,
              metadata: {
                ...current.metadata,
                ...(metadataForm.participantId.trim().length > 0
                  ? { participantId: metadataForm.participantId.trim() }
                  : {}),
                ...(metadataForm.participantId.trim().length === 0
                  ? { participantId: undefined }
                  : {}),
                tags: parseTags(metadataForm.tags),
                ...(metadataForm.notes.trim().length > 0
                  ? { notes: metadataForm.notes.trim() }
                  : {}),
                ...(metadataForm.notes.trim().length === 0
                  ? { notes: undefined }
                  : {}),
              },
              updatedAt: Date.now(),
            },
      );
      setPageNotice("Transcript metadata saved.");
    } catch (error) {
      setPageError(getErrorMessage(error, "Could not save transcript metadata."));
    } finally {
      setIsSavingMetadata(false);
    }
  }

  function resetAttachDialog() {
    setIsAttachDialogOpen(false);
    setPackSearchText("");
    setSelectedPackIds([]);
  }

  function handlePackSelectionToggle(configId: string) {
    setSelectedPackIds((current) =>
      current.includes(configId)
        ? current.filter((id) => id !== configId)
        : [...current, configId],
    );
  }

  async function handleAttachToPacks() {
    if (transcript === null || selectedPackIds.length === 0) {
      return;
    }

    const selectedCount = selectedPackIds.length;
    setIsAttaching(true);
    setPageError(null);
    setPageNotice(null);

    try {
      for (const configId of selectedPackIds) {
        await attachTranscript({
          configId: configId as Id<"personaConfigs">,
          transcriptId: transcript._id,
        });
      }

      resetAttachDialog();
      setPageNotice(
        selectedCount === 1
          ? "Transcript attached to 1 draft persona configuration."
          : `Transcript attached to ${selectedCount} draft persona configurations.`,
      );
    } catch (error) {
      setPageError(getErrorMessage(error, "Could not attach transcript to the persona configuration."));
    } finally {
      setIsAttaching(false);
    }
  }

  async function handleDetachFromPack(configId: Id<"personaConfigs">) {
    if (transcript === null) {
      return;
    }

    setDetachingPackId(String(configId));
    setPageError(null);
    setPageNotice(null);

    try {
      await detachTranscript({
        configId,
        transcriptId: transcript._id,
      });
      setPageNotice("Transcript detached from the persona configuration.");
    } catch (error) {
      setPageError(getErrorMessage(error, "Could not detach transcript from the persona configuration."));
    } finally {
      setDetachingPackId(null);
    }
  }

  async function handleDeleteTranscript() {
    if (transcript === null) {
      return;
    }

    setIsDeleting(true);
    setPageError(null);

    try {
      await deleteTranscript({ transcriptId: transcript._id });
      setDeleteDialogOpen(false);
      await navigate({ to: "/transcripts" });
    } catch (error) {
      setPageError(getErrorMessage(error, "Could not delete transcript."));
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <section className="space-y-6">
        <PageHeader
          title="Transcript"
          description="Loading transcript detail..."
        />
      </section>
    );
  }

  if (normalizedTranscriptId === null || transcript === null) {
    return <NotFoundPlaceholder />;
  }

  return (
    <>
      <section className="space-y-6">
        <PageHeader
          title={transcript.originalFilename}
          badge={
            <>
              <Badge variant="secondary">{transcript.format}</Badge>
              <Badge variant={statusBadgeVariant(transcript.processingStatus)}>
                {formatTranscriptStatus(transcript.processingStatus)}
              </Badge>
            </>
          }
          description="Review transcript content, update metadata, and connect the transcript to draft persona configurations."
          actions={
            <>
              <Button asChild type="button" variant="outline">
                <Link to="/transcripts">Back to transcripts</Link>
              </Button>
              {canManageTranscripts ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  Delete transcript
                </Button>
              ) : null}
            </>
          }
        />

        {pageNotice ? (
          <p className="text-sm text-emerald-700" role="status">
            {pageNotice}
          </p>
        ) : null}
        {pageError ? (
          <p className="text-sm text-destructive" role="alert">
            {pageError}
          </p>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-6">
            <TranscriptContentCard
              content={content}
              contentError={contentError}
              highlightSnippet={highlightSnippet}
              isContentLoading={isContentLoading}
            />
          </div>

          <div className="space-y-6">
            <MetadataPanel
              canManage={canManageTranscripts}
              isSaving={isSavingMetadata}
              metadataForm={metadataForm}
              onFormChange={setMetadataForm}
              onSubmit={handleSaveMetadata}
              transcript={transcript}
            />

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>Linked Persona Configurations</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Review every persona configuration this transcript is attached to and
                    open each persona configuration detail view.
                  </p>
                </div>
                {canManageTranscripts ? (
                  <Button
                    disabled={attachablePacks.length === 0}
                    type="button"
                    variant="outline"
                    onClick={() => setIsAttachDialogOpen(true)}
                  >
                    Attach to persona configuration
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {canManageTranscripts ? (
                  attachablePacks.length === 0 ? (
                    <p className="text-sm leading-6 text-muted-foreground">
                      No additional draft persona configurations are available to attach right now.
                    </p>
                  ) : null
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    Reviewers can view linked persona configurations but cannot attach or detach
                    transcript relationships.
                  </p>
                )}

                {transcriptPacks?.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-background p-6">
                    <p className="text-sm leading-6 text-muted-foreground">
                      This transcript is not linked to any persona configurations yet.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {(transcriptPacks ?? []).map((configTranscript) => (
                      <div
                        key={`${configTranscript.configId}`}
                        className="rounded-xl border bg-background p-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                className="font-medium text-primary underline-offset-4 hover:underline"
                                params={{ configId: configTranscript.config._id }}
                                to="/persona-configs/$configId"
                              >
                                {configTranscript.config.name}
                              </Link>
                              <ConfigStatusBadge status={configTranscript.config.status} />
                            </div>
                            <p className="text-sm leading-6 text-muted-foreground">
                              {configTranscript.config.context}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button asChild type="button" variant="outline">
                              <Link
                                params={{ configId: configTranscript.config._id }}
                                to="/persona-configs/$configId"
                              >
                                Open persona configuration
                              </Link>
                            </Button>
                            {canManageTranscripts
                            && configTranscript.config.status === "draft" ? (
                              <Button
                                disabled={
                                  detachingPackId
                                  === String(configTranscript.configId)
                                }
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  void handleDetachFromPack(
                                    configTranscript.configId,
                                  )
                                }
                              >
                                {detachingPackId === String(configTranscript.configId)
                                  ? "Detaching..."
                                  : "Detach"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Transcript summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <SummaryValue label="Character count" variant="inline" value={String(transcript.characterCount)} />
                <SummaryValue label="Created" variant="inline" value={formatTimestamp(transcript.createdAt)} />
                <SummaryValue label="Updated" variant="inline" value={formatTimestamp(transcript.updatedAt)} />
                {transcript.processingError ? (
                  <SummaryValue
                    label="Processing error"
                    variant="inline"
                    value={transcript.processingError}
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Dialog
        open={isAttachDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetAttachDialog();
            return;
          }

          setIsAttachDialogOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Attach to persona configuration</DialogTitle>
            <DialogDescription>
              Select one or more draft persona configurations from your organization to link with
              this transcript.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="transcript-attach-config-search">
                Search draft persona configurations
              </Label>
              <Input
                id="transcript-attach-config-search"
                placeholder="Search by persona configuration name, description, or context"
                value={configSearchText}
                onChange={(event) => setPackSearchText(event.target.value)}
              />
            </div>

            {attachablePacks.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  No draft persona configurations are currently available to attach.
                </p>
              </div>
            ) : filteredAttachablePacks.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  No draft persona configurations match the current search.
                </p>
              </div>
            ) : (
              <div className="max-h-[24rem] overflow-y-auto rounded-xl border">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-4 border-b bg-muted/40 px-4 py-3 text-sm font-medium">
                  <span>Select</span>
                  <span>Config</span>
                  <span>Status</span>
                </div>

                <div className="divide-y">
                  {filteredAttachablePacks.map((config) => {
                    const isSelected = selectedPackIds.includes(String(config._id));

                    return (
                      <label
                        key={config._id}
                        className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-4 px-4 py-3 text-sm"
                        htmlFor={`transcript-attach-config-${config._id}`}
                      >
                        <input
                          checked={isSelected}
                          className="mt-1 h-4 w-4 rounded border-input"
                          id={`transcript-attach-config-${config._id}`}
                          onChange={() => handlePackSelectionToggle(String(config._id))}
                          type="checkbox"
                        />
                        <div className="space-y-1">
                          <p className="font-medium">{config.name}</p>
                          <p className="text-muted-foreground">
                            {config.context}
                          </p>
                        </div>
                        <div className="text-right">
                          <ConfigStatusBadge status={config.status} />
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetAttachDialog}>
              Cancel
            </Button>
            <Button
              disabled={selectedPackIds.length === 0 || isAttaching}
              type="button"
              onClick={() => void handleAttachToPacks()}
            >
              {isAttaching ? "Attaching..." : "Attach selected persona configurations"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete transcript?</DialogTitle>
            <DialogDescription>
              This permanently removes the transcript record, its uploaded file,
              and any draft persona configuration attachments.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="font-medium">{transcript.originalFilename}</p>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={isDeleting}
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteTranscript()}
            >
              {isDeleting ? "Deleting..." : "Confirm delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

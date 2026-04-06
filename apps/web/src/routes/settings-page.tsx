import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { selectClassName } from "@/components/filter-bar";

const taskCategories = [
  "expansion",
  "action",
  "summarization",
  "clustering",
  "recommendation",
] as const;

type TaskCategory = (typeof taskCategories)[number];

type CredentialSummary = {
  _id: string;
  ref: string;
  label: string;
  description: string;
  allowedStudyIds: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};

type SettingsView = {
  orgId: string;
  domainAllowlist: string[];
  maxConcurrency: number;
  modelConfig: Array<{
    taskCategory: TaskCategory;
    modelId: string;
  }>;
  runBudgetCap: number;
  budgetLimits: {
    maxTokensPerStudy?: number;
    maxBrowserSecPerStudy?: number;
  };
  browserPolicy: {
    blockAnalytics: boolean;
    blockHeavyMedia: boolean;
    screenshotFormat: string;
    screenshotMode: string;
  };
  signedUrlExpirySeconds: number;
  updatedBy: string | null;
  updatedAt: number | null;
  credentials: CredentialSummary[];
};

type SettingsMutationResult = Omit<SettingsView, "credentials">;

type SettingsFormState = {
  maxConcurrency: string;
  modelConfig: Record<TaskCategory, string>;
  runBudgetCap: string;
  maxTokensPerStudy: string;
  maxBrowserSecPerStudy: string;
  blockAnalytics: boolean;
  blockHeavyMedia: boolean;
  screenshotFormat: string;
  screenshotMode: string;
};

type CredentialPayloadRow = {
  key: string;
  value: string;
};

type CredentialFormState = {
  mode: "create" | "edit";
  credentialId: string | null;
  ref: string;
  label: string;
  description: string;
  allowedStudyIds: string;
  payloadRows: CredentialPayloadRow[];
};

const emptyCredentialPayloadRow = (): CredentialPayloadRow => ({
  key: "",
  value: "",
});

const emptyCredentialForm = (): CredentialFormState => ({
  mode: "create",
  credentialId: null,
  ref: "",
  label: "",
  description: "",
  allowedStudyIds: "",
  payloadRows: [emptyCredentialPayloadRow()],
});

const emptySettingsForm = (): SettingsFormState => ({
  maxConcurrency: "",
  modelConfig: {
    expansion: "",
    action: "",
    summarization: "",
    clustering: "",
    recommendation: "",
  },
  runBudgetCap: "",
  maxTokensPerStudy: "",
  maxBrowserSecPerStudy: "",
  blockAnalytics: false,
  blockHeavyMedia: false,
  screenshotFormat: "jpeg",
  screenshotMode: "milestones",
});

export function SettingsPage() {
  const settings = useQuery((api as any).settings.getSettings, {}) as
    | SettingsView
    | undefined;
  const updateSettings = useMutation((api as any).settings.updateSettings);
  const addDomainToAllowlist = useMutation(
    (api as any).settings.addDomainToAllowlist,
  );
  const removeDomainFromAllowlist = useMutation(
    (api as any).settings.removeDomainFromAllowlist,
  );
  const createCredential = useMutation((api as any).credentials.createCredential);
  const updateCredential = useMutation((api as any).credentials.updateCredential);
  const deleteCredential = useMutation((api as any).credentials.deleteCredential);

  const [settingsForm, setSettingsForm] = useState<SettingsFormState>(
    emptySettingsForm(),
  );
  const [domainAllowlist, setDomainAllowlist] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [credentialForm, setCredentialForm] =
    useState<CredentialFormState>(emptyCredentialForm);
  const [isCredentialFormOpen, setIsCredentialFormOpen] = useState(false);
  const [configurationFeedback, setConfigurationFeedback] = useState<string | null>(
    null,
  );
  const [domainFeedback, setDomainFeedback] = useState<string | null>(null);
  const [credentialFeedback, setCredentialFeedback] = useState<string | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [isSavingConfiguration, setIsSavingConfiguration] = useState(false);
  const [isAddingDomain, setIsAddingDomain] = useState(false);
  const [removingDomain, setRemovingDomain] = useState<string | null>(null);
  const [isSavingCredential, setIsSavingCredential] = useState(false);
  const [deletingCredentialId, setDeletingCredentialId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (settings === undefined) {
      return;
    }

    setSettingsForm(toSettingsFormState(settings));
    setDomainAllowlist(settings.domainAllowlist);
    setCredentials(settings.credentials);
  }, [settings]);

  const settingsSummary = useMemo(
    () => ({
      credentialCount: credentials.length,
      domainCount: domainAllowlist.length,
      updatedAt: settings?.updatedAt ?? null,
      updatedBy: settings?.updatedBy ?? null,
    }),
    [credentials.length, domainAllowlist.length, settings?.updatedAt, settings?.updatedBy],
  );

  if (settings === undefined) {
    return (
      <EmptyState
        title="Workspace settings"
        description="Loading workspace configuration, guardrails, and credentials..."
      />
    );
  }

  async function handleSaveConfiguration(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setConfigurationFeedback(null);
    setConfigurationError(null);
    setIsSavingConfiguration(true);

    try {
      const updated = (await updateSettings({
        patch: buildSettingsPatch(settingsForm),
      })) as SettingsMutationResult;

      applyReturnedSettings(updated);
      setConfigurationFeedback("Workspace configuration saved.");
    } catch (error) {
      setConfigurationError(
        getErrorMessage(error, "Could not save workspace configuration."),
      );
    } finally {
      setIsSavingConfiguration(false);
    }
  }

  async function handleAddDomain(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDomainFeedback(null);
    setDomainError(null);
    setIsAddingDomain(true);

    try {
      const updated = (await addDomainToAllowlist({
        domain: newDomain,
      })) as SettingsMutationResult;

      applyReturnedSettings(updated);
      setNewDomain("");
      setDomainFeedback("Domain allowlist updated.");
    } catch (error) {
      setDomainError(getErrorMessage(error, "Could not add domain to allowlist."));
    } finally {
      setIsAddingDomain(false);
    }
  }

  async function handleRemoveDomain(domain: string) {
    setDomainFeedback(null);
    setDomainError(null);
    setRemovingDomain(domain);

    try {
      const updated = (await removeDomainFromAllowlist({
        domain,
      })) as SettingsMutationResult;

      applyReturnedSettings(updated);
      setDomainFeedback(`Removed ${domain} from the allowlist.`);
    } catch (error) {
      setDomainError(
        getErrorMessage(error, `Could not remove ${domain} from the allowlist.`),
      );
    } finally {
      setRemovingDomain(null);
    }
  }

  async function handleSaveCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCredentialFeedback(null);
    setCredentialError(null);
    setIsSavingCredential(true);

    try {
      const allowedStudyIds = parseAllowedStudyIds(credentialForm.allowedStudyIds);
      const payload = parseCredentialPayloadRows(
        credentialForm.payloadRows,
        credentialForm.mode === "create",
      );

      if (credentialForm.mode === "create") {
        const created = (await createCredential({
          credential: {
            ref: credentialForm.ref,
            label: credentialForm.label,
            description: credentialForm.description || undefined,
            ...(allowedStudyIds.length > 0 ? { allowedStudyIds } : {}),
            payload,
          },
        })) as CredentialSummary;

        setCredentials((current) => [created, ...current]);
        setCredentialFeedback("Credential saved.");
      } else if (credentialForm.credentialId !== null) {
        const updated = (await updateCredential({
          credentialId: credentialForm.credentialId,
          patch: {
            ref: credentialForm.ref,
            label: credentialForm.label,
            description: credentialForm.description,
            allowedStudyIds: allowedStudyIds.length > 0 ? allowedStudyIds : null,
            ...(payload.length > 0 ? { payload } : {}),
          },
        })) as CredentialSummary;

        setCredentials((current) =>
          current.map((credential) =>
            credential._id === updated._id ? updated : credential,
          ),
        );
        setCredentialFeedback("Credential updated.");
      }

      setCredentialForm(emptyCredentialForm());
      setIsCredentialFormOpen(false);
    } catch (error) {
      setCredentialError(
        getErrorMessage(error, "Could not save credential changes."),
      );
    } finally {
      setIsSavingCredential(false);
    }
  }

  async function handleDeleteCredential(credential: CredentialSummary) {
    setCredentialFeedback(null);
    setCredentialError(null);
    setDeletingCredentialId(credential._id);

    try {
      await deleteCredential({ credentialId: credential._id });
      setCredentials((current) =>
        current.filter((item) => item._id !== credential._id),
      );
      setCredentialFeedback(`Deleted credential ${credential.ref}.`);
      if (credentialForm.credentialId === credential._id) {
        setCredentialForm(emptyCredentialForm());
        setIsCredentialFormOpen(false);
      }
    } catch (error) {
      setCredentialError(
        getErrorMessage(error, `Could not delete credential ${credential.ref}.`),
      );
    } finally {
      setDeletingCredentialId(null);
    }
  }

  function applyReturnedSettings(updated: SettingsMutationResult) {
    setDomainAllowlist(updated.domainAllowlist);
    setSettingsForm((current) => ({
      ...current,
      ...toSettingsFormState({
        ...updated,
        credentials,
      }),
    }));
  }

  function openCreateCredentialForm() {
    setCredentialError(null);
    setCredentialFeedback(null);
    setCredentialForm(emptyCredentialForm());
    setIsCredentialFormOpen(true);
  }

  function openEditCredentialForm(credential: CredentialSummary) {
    setCredentialError(null);
    setCredentialFeedback(null);
    setCredentialForm({
      mode: "edit",
      credentialId: credential._id,
      ref: credential.ref,
      label: credential.label,
      description: credential.description,
      allowedStudyIds: credential.allowedStudyIds.join(", "),
      payloadRows: [emptyCredentialPayloadRow()],
    });
    setIsCredentialFormOpen(true);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Admin Console"
        title="Workspace settings"
        description="Configure workspace guardrails, AI models, study limits, browser defaults, and encrypted credentials from one admin-only page."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Allowlisted domains" value={String(settingsSummary.domainCount)} />
        <SummaryCard
          label="Stored credentials"
          value={String(settingsSummary.credentialCount)}
        />
        <SummaryCard
          label="Last updated by"
          value={settingsSummary.updatedBy ?? "Not yet updated"}
        />
        <SummaryCard
          label="Last updated at"
          value={
            settingsSummary.updatedAt === null
              ? "Not yet updated"
              : formatTimestamp(settingsSummary.updatedAt)
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Domain allowlist</CardTitle>
          <CardDescription>
            Restrict study execution to approved hostnames. Add or remove domains
            without touching the rest of the workspace configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleAddDomain}>
            <Input
              id="settings-domain-input"
              placeholder="checkout.example.com"
              value={newDomain}
              onChange={(event) => setNewDomain(event.target.value)}
            />
            <Button disabled={isAddingDomain} type="submit">
              {isAddingDomain ? "Adding..." : "Add domain"}
            </Button>
          </form>

          {domainError ? (
            <FeedbackMessage tone="error">{domainError}</FeedbackMessage>
          ) : null}
          {domainFeedback ? (
            <FeedbackMessage tone="success">{domainFeedback}</FeedbackMessage>
          ) : null}

          {domainAllowlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No domains are allowlisted yet.
            </p>
          ) : (
            <div className="grid gap-3">
              {domainAllowlist.map((domain) => (
                <div
                  key={domain}
                  className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{domain}</p>
                    <p className="text-sm text-muted-foreground">
                      Browser runs must stay within this hostname.
                    </p>
                  </div>
                  <Button
                    aria-label={`Remove ${domain}`}
                    disabled={removingDomain === domain}
                    type="button"
                    variant="outline"
                    onClick={() => void handleRemoveDomain(domain)}
                  >
                    {removingDomain === domain ? "Removing..." : "Remove"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <form className="space-y-6" onSubmit={handleSaveConfiguration}>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Concurrency</CardTitle>
              <CardDescription>
                Cap how many active runs this workspace may execute at once.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Label htmlFor="settings-max-concurrency">Maximum active concurrency</Label>
              <Input
                id="settings-max-concurrency"
                min="1"
                required
                type="number"
                value={settingsForm.maxConcurrency}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    maxConcurrency: event.target.value,
                  }))
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Budget caps</CardTitle>
              <CardDescription>
                Set study-level run, token, and browser-time limits for the workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FieldGroup>
                <Label htmlFor="settings-run-budget-cap">Run budget cap</Label>
                <Input
                  id="settings-run-budget-cap"
                  min="1"
                  required
                  type="number"
                  value={settingsForm.runBudgetCap}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      runBudgetCap: event.target.value,
                    }))
                  }
                />
              </FieldGroup>

              <FieldGroup>
                <Label htmlFor="settings-max-tokens">Max tokens per study</Label>
                <Input
                  id="settings-max-tokens"
                  min="1"
                  placeholder="Optional"
                  type="number"
                  value={settingsForm.maxTokensPerStudy}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      maxTokensPerStudy: event.target.value,
                    }))
                  }
                />
              </FieldGroup>

              <FieldGroup>
                <Label htmlFor="settings-max-browser-sec">
                  Max browser seconds per study
                </Label>
                <Input
                  id="settings-max-browser-sec"
                  min="1"
                  placeholder="Optional"
                  type="number"
                  value={settingsForm.maxBrowserSecPerStudy}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      maxBrowserSecPerStudy: event.target.value,
                    }))
                  }
                />
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI model configuration</CardTitle>
              <CardDescription>
                Assign model IDs to each task category used across the platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {taskCategories.map((taskCategory) => (
                <FieldGroup key={taskCategory}>
                  <Label htmlFor={`settings-model-${taskCategory}`}>
                    {formatTaskCategory(taskCategory)}
                  </Label>
                  <Input
                    id={`settings-model-${taskCategory}`}
                    placeholder="gpt-5.4-nano"
                    value={settingsForm.modelConfig[taskCategory]}
                    onChange={(event) =>
                      setSettingsForm((current) => ({
                        ...current,
                        modelConfig: {
                          ...current.modelConfig,
                          [taskCategory]: event.target.value,
                        },
                      }))
                    }
                  />
                </FieldGroup>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Browser policy</CardTitle>
              <CardDescription>
                Configure screenshot capture defaults and lightweight browser guardrails.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <CheckboxField
                checked={settingsForm.blockAnalytics}
                id="settings-browser-block-analytics"
                label="Block analytics requests"
                onCheckedChange={(checked) =>
                  setSettingsForm((current) => ({
                    ...current,
                    blockAnalytics: checked,
                  }))
                }
              />
              <CheckboxField
                checked={settingsForm.blockHeavyMedia}
                id="settings-browser-block-heavy-media"
                label="Block heavy media"
                onCheckedChange={(checked) =>
                  setSettingsForm((current) => ({
                    ...current,
                    blockHeavyMedia: checked,
                  }))
                }
              />

              <FieldGroup>
                <Label htmlFor="settings-browser-screenshot-format">
                  Screenshot format
                </Label>
                <select
                  className={selectClassName}
                  id="settings-browser-screenshot-format"
                  value={settingsForm.screenshotFormat}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      screenshotFormat: event.target.value,
                    }))
                  }
                >
                  <option value="jpeg">jpeg</option>
                  <option value="png">png</option>
                </select>
              </FieldGroup>

              <FieldGroup>
                <Label htmlFor="settings-browser-screenshot-mode">
                  Screenshot mode
                </Label>
                <select
                  className={selectClassName}
                  id="settings-browser-screenshot-mode"
                  value={settingsForm.screenshotMode}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      screenshotMode: event.target.value,
                    }))
                  }
                >
                  <option value="milestones">milestones</option>
                  <option value="all">all</option>
                </select>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>

        {configurationError ? (
          <FeedbackMessage tone="error">{configurationError}</FeedbackMessage>
        ) : null}
        {configurationFeedback ? (
          <FeedbackMessage tone="success">{configurationFeedback}</FeedbackMessage>
        ) : null}

        <div className="flex justify-end">
          <Button disabled={isSavingConfiguration} type="submit">
            {isSavingConfiguration ? "Saving..." : "Save configuration"}
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Credentials</CardTitle>
            <CardDescription>
              Create, rotate, and remove encrypted credentials without exposing
              secret values back to the frontend.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={openCreateCredentialForm}>
            Add credential
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {credentialError ? (
            <FeedbackMessage tone="error">{credentialError}</FeedbackMessage>
          ) : null}
          {credentialFeedback ? (
            <FeedbackMessage tone="success">{credentialFeedback}</FeedbackMessage>
          ) : null}

          {isCredentialFormOpen ? (
            <form
              className="space-y-4 rounded-xl border bg-background p-4"
              onSubmit={handleSaveCredential}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FieldGroup>
                  <Label htmlFor="credential-ref">Reference</Label>
                  <Input
                    id="credential-ref"
                    required
                    value={credentialForm.ref}
                    onChange={(event) =>
                      setCredentialForm((current) => ({
                        ...current,
                        ref: event.target.value,
                      }))
                    }
                  />
                </FieldGroup>

                <FieldGroup>
                  <Label htmlFor="credential-label">Label</Label>
                  <Input
                    id="credential-label"
                    required
                    value={credentialForm.label}
                    onChange={(event) =>
                      setCredentialForm((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </FieldGroup>
              </div>

              <FieldGroup>
                <Label htmlFor="credential-description">Description</Label>
                <textarea
                  className={textareaClassName}
                  id="credential-description"
                  value={credentialForm.description}
                  onChange={(event) =>
                    setCredentialForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </FieldGroup>

              <FieldGroup>
                <Label htmlFor="credential-study-ids">
                  Allowed study IDs (comma-separated)
                </Label>
                <Input
                  id="credential-study-ids"
                  placeholder="study-a, study-b"
                  value={credentialForm.allowedStudyIds}
                  onChange={(event) =>
                    setCredentialForm((current) => ({
                      ...current,
                      allowedStudyIds: event.target.value,
                    }))
                  }
                />
              </FieldGroup>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Secret fields</h3>
                    <p className="text-sm text-muted-foreground">
                      {credentialForm.mode === "create"
                        ? "Provide at least one key/value pair to encrypt."
                        : "Leave secret fields blank to keep the existing encrypted payload."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setCredentialForm((current) => ({
                        ...current,
                        payloadRows: [...current.payloadRows, emptyCredentialPayloadRow()],
                      }))
                    }
                  >
                    Add field
                  </Button>
                </div>

                <div className="grid gap-3">
                  {credentialForm.payloadRows.map((row, index) => (
                    <div
                      key={`credential-field-${index}`}
                      className="grid gap-3 rounded-lg border bg-card p-3 md:grid-cols-[1fr_1fr_auto]"
                    >
                      <Input
                        aria-label={`Credential key ${index + 1}`}
                        placeholder="email"
                        value={row.key}
                        onChange={(event) =>
                          setCredentialForm((current) => ({
                            ...current,
                            payloadRows: current.payloadRows.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, key: event.target.value }
                                : item,
                            ),
                          }))
                        }
                      />
                      <Input
                        aria-label={`Credential value ${index + 1}`}
                        placeholder="alice@example.com"
                        value={row.value}
                        onChange={(event) =>
                          setCredentialForm((current) => ({
                            ...current,
                            payloadRows: current.payloadRows.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, value: event.target.value }
                                : item,
                            ),
                          }))
                        }
                      />
                      <Button
                        disabled={credentialForm.payloadRows.length === 1}
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setCredentialForm((current) => ({
                            ...current,
                            payloadRows: current.payloadRows.filter(
                              (_item, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCredentialForm(emptyCredentialForm());
                    setIsCredentialFormOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={isSavingCredential} type="submit">
                  {isSavingCredential
                    ? credentialForm.mode === "create"
                      ? "Saving..."
                      : "Updating..."
                    : credentialForm.mode === "create"
                      ? "Save credential"
                      : "Update credential"}
                </Button>
              </div>
            </form>
          ) : null}

          {credentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No encrypted credentials have been added yet.
            </p>
          ) : (
            <div className="grid gap-3">
              {credentials.map((credential) => (
                <div
                  key={credential._id}
                  className="rounded-lg border bg-background p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{credential.label}</p>
                      <p className="text-sm text-muted-foreground">
                        Ref {credential.ref}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {credential.description || "No description provided."}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        aria-label={`Edit credential ${credential.ref}`}
                        type="button"
                        variant="outline"
                        onClick={() => openEditCredentialForm(credential)}
                      >
                        Edit
                      </Button>
                      <Button
                        aria-label={`Delete credential ${credential.ref}`}
                        disabled={deletingCredentialId === credential._id}
                        type="button"
                        variant="destructive"
                        onClick={() => void handleDeleteCredential(credential)}
                      >
                        {deletingCredentialId === credential._id
                          ? "Deleting..."
                          : "Delete"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                    <p>
                      Scope{" "}
                      {credential.allowedStudyIds.length === 0
                        ? "All studies"
                        : `${credential.allowedStudyIds.length} linked study${credential.allowedStudyIds.length === 1 ? "" : "ies"}`}
                    </p>
                    <p>Created {formatTimestamp(credential.createdAt)}</p>
                    <p>Updated {formatTimestamp(credential.updatedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="grid gap-2">{children}</div>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="break-words text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function FeedbackMessage({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "success";
}) {
  return (
    <p
      className={
        tone === "error"
          ? "text-sm text-destructive"
          : "text-sm text-emerald-700"
      }
      role="status"
    >
      {children}
    </p>
  );
}

function CheckboxField({
  checked,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3" htmlFor={id}>
      <input
        checked={checked}
        className="h-4 w-4"
        id={id}
        type="checkbox"
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );
}

function toSettingsFormState(settings: SettingsMutationResult | SettingsView): SettingsFormState {
  const form = emptySettingsForm();

  for (const entry of settings.modelConfig) {
    form.modelConfig[entry.taskCategory] = entry.modelId;
  }

  form.maxConcurrency = String(settings.maxConcurrency);
  form.runBudgetCap = String(settings.runBudgetCap);
  form.maxTokensPerStudy =
    settings.budgetLimits.maxTokensPerStudy === undefined
      ? ""
      : String(settings.budgetLimits.maxTokensPerStudy);
  form.maxBrowserSecPerStudy =
    settings.budgetLimits.maxBrowserSecPerStudy === undefined
      ? ""
      : String(settings.budgetLimits.maxBrowserSecPerStudy);
  form.blockAnalytics = settings.browserPolicy.blockAnalytics;
  form.blockHeavyMedia = settings.browserPolicy.blockHeavyMedia;
  form.screenshotFormat = settings.browserPolicy.screenshotFormat;
  form.screenshotMode = settings.browserPolicy.screenshotMode;

  return form;
}

function buildSettingsPatch(settingsForm: SettingsFormState) {
  return {
    maxConcurrency: Number(settingsForm.maxConcurrency),
    modelConfig: taskCategories.flatMap((taskCategory) => {
      const modelId = settingsForm.modelConfig[taskCategory].trim();
      return modelId.length === 0 ? [] : [{ taskCategory, modelId }];
    }),
    runBudgetCap: Number(settingsForm.runBudgetCap),
    budgetLimits: {
      ...(settingsForm.maxTokensPerStudy.trim().length > 0
        ? { maxTokensPerStudy: Number(settingsForm.maxTokensPerStudy) }
        : {}),
      ...(settingsForm.maxBrowserSecPerStudy.trim().length > 0
        ? { maxBrowserSecPerStudy: Number(settingsForm.maxBrowserSecPerStudy) }
        : {}),
    },
    browserPolicy: {
      blockAnalytics: settingsForm.blockAnalytics,
      blockHeavyMedia: settingsForm.blockHeavyMedia,
      screenshotFormat: settingsForm.screenshotFormat,
      screenshotMode: settingsForm.screenshotMode,
    },
  };
}

function parseAllowedStudyIds(value: string) {
  return value
    .split(/[,\n]/)
    .map((studyId) => studyId.trim())
    .filter(Boolean);
}

function parseCredentialPayloadRows(
  rows: CredentialPayloadRow[],
  required: boolean,
) {
  const populatedRows = rows.filter(
    (row) => row.key.trim().length > 0 || row.value.trim().length > 0,
  );

  if (required && populatedRows.length === 0) {
    throw new Error("Add at least one credential field before saving.");
  }

  for (const row of populatedRows) {
    if (row.key.trim().length === 0 || row.value.trim().length === 0) {
      throw new Error("Credential fields need both a key and a value.");
    }
  }

  return populatedRows.map((row) => ({
    key: row.key.trim(),
    value: row.value.trim(),
  }));
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

function formatTaskCategory(taskCategory: TaskCategory) {
  return taskCategory
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export const textareaClassName =
  "min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";


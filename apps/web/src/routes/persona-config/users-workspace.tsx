import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PersonaConfigDetailSearch } from "@/router";
import type {
  PersonaConfigDoc,
  SyntheticUserDoc,
  SyntheticUserFormValue,
  TranscriptId,
} from "./types";
import { emptySyntheticUserForm, textareaClassName } from "./helpers";

// ---------------------------------------------------------------------------
// Source-type metadata
// ---------------------------------------------------------------------------

const sourceTypeLabels: Record<SyntheticUserDoc["sourceType"], string> = {
  manual: "Manual",
  generated: "Generated",
  json_import: "JSON import",
  transcript_derived: "Transcript",
};

const sourceTypeFilterOptions: Array<{
  value: SyntheticUserDoc["sourceType"];
  label: string;
}> = [
  { value: "manual", label: "Manual" },
  { value: "generated", label: "Generated" },
  { value: "json_import", label: "JSON import" },
  { value: "transcript_derived", label: "Transcript" },
];

const sortOptions = [
  { value: "source", label: "Source first" },
  { value: "name", label: "Name A-Z" },
] as const;

type SortKey = (typeof sortOptions)[number]["value"];

const sourceTypeOrder: Record<SyntheticUserDoc["sourceType"], number> = {
  manual: 0,
  json_import: 1,
  transcript_derived: 2,
  generated: 3,
};

// ---------------------------------------------------------------------------
// Filtering + sorting
// ---------------------------------------------------------------------------

function filterAndSortUsers(
  users: SyntheticUserDoc[],
  searchText: string,
  sourceFilter: SyntheticUserDoc["sourceType"] | "",
  sortKey: SortKey,
): SyntheticUserDoc[] {
  const normalizedSearch = searchText.trim().toLowerCase();

  let filtered = users;

  if (sourceFilter) {
    filtered = filtered.filter((u) => u.sourceType === sourceFilter);
  }

  if (normalizedSearch) {
    filtered = filtered.filter(
      (u) =>
        u.name.toLowerCase().includes(normalizedSearch) ||
        u.summary.toLowerCase().includes(normalizedSearch),
    );
  }

  const sorted = [...filtered];
  if (sortKey === "source") {
    sorted.sort(
      (a, b) =>
        sourceTypeOrder[a.sourceType] - sourceTypeOrder[b.sourceType] ||
        a.name.localeCompare(b.name),
    );
  } else {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// selectClassName for native <select>
// ---------------------------------------------------------------------------

const nativeSelectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

// ---------------------------------------------------------------------------
// Master list row
// ---------------------------------------------------------------------------

function UserListRow({
  user,
  isSelected,
  onSelect,
}: {
  user: SyntheticUserDoc;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-selected={isSelected}
      role="option"
      className={cn(
        "w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors",
        "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected
          ? "border-primary/40 bg-accent"
          : "border-transparent bg-background",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{user.name}</span>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {sourceTypeLabels[user.sourceType]}
        </Badge>
      </div>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
        {user.summary}
      </p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inspector panel
// ---------------------------------------------------------------------------

function UserInspector({
  user,
  config,
  isDraft,
}: {
  user: SyntheticUserDoc;
  config: PersonaConfigDoc;
  isDraft: boolean;
}) {
  const isTranscriptDerived = user.sourceType === "transcript_derived";
  const axisValues = user.axisValues ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">{user.name}</h3>
          <Badge variant="outline" className="shrink-0">
            {sourceTypeLabels[user.sourceType]}
          </Badge>
        </div>
        {user.generationStatus ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Generation status: {user.generationStatus}
          </p>
        ) : null}
      </div>

      {/* Bio / Summary */}
      <div>
        <h4 className="text-sm font-medium">Summary</h4>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {user.summary}
        </p>
      </div>

      {user.firstPersonBio ? (
        <div>
          <h4 className="text-sm font-medium">First-person bio</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {user.firstPersonBio}
          </p>
        </div>
      ) : null}

      {/* Axis values */}
      {user.axes.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium">
            Axes{" "}
            <span className="font-normal text-muted-foreground">
              ({user.axes.length})
            </span>
          </h4>
          <div className="mt-2 space-y-2">
            {user.axes.map((axis) => {
              const value = axisValues.find((av) => av.key === axis.key);
              return (
                <div
                  key={axis.key}
                  className="rounded-md border bg-card px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{axis.label}</span>
                    {value !== undefined ? (
                      <span className="text-xs font-mono text-muted-foreground">
                        {value.value.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                    <span>{axis.lowAnchor}</span>
                    <span>{axis.midAnchor}</span>
                    <span>{axis.highAnchor}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Evidence snippets */}
      {user.evidenceSnippets.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium">
            Evidence{" "}
            <span className="font-normal text-muted-foreground">
              ({user.evidenceSnippets.length})
            </span>
          </h4>
          <ul className="mt-2 space-y-2">
            {user.evidenceSnippets.map((snippet, index) => (
              <li key={`${user._id}-ev-${index}`}>
                {isTranscriptDerived && user.sourceRefs[index] ? (
                  <Link
                    className="block rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                    params={{
                      transcriptId: user.sourceRefs[index] as TranscriptId,
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

      {/* Behavior rules (generated users) */}
      {user.behaviorRules && user.behaviorRules.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium">Behavior rules</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {user.behaviorRules.map((rule, index) => (
              <li key={`${user._id}-br-${index}`}>{rule}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Tension seed */}
      {user.tensionSeed ? (
        <div>
          <h4 className="text-sm font-medium">Tension seed</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.tensionSeed}
          </p>
        </div>
      ) : null}

      {/* Notes */}
      {user.notes ? (
        <div>
          <h4 className="text-sm font-medium">Notes</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {user.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create form (inline)
// ---------------------------------------------------------------------------

function InlineCreateForm({
  form,
  isSaving,
  onSubmit,
  onChange,
  onClose,
}: {
  form: SyntheticUserFormValue;
  isSaving: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onChange: (form: SyntheticUserFormValue) => void;
  onClose: () => void;
}) {
  return (
    <form
      className="space-y-4 rounded-xl border bg-background p-4"
      onSubmit={onSubmit}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">New synthetic user</h4>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="create-user-name">Name</Label>
        <Input
          id="create-user-name"
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="create-user-summary">Summary</Label>
        <textarea
          id="create-user-summary"
          className={textareaClassName}
          value={form.summary}
          onChange={(event) =>
            onChange({ ...form, summary: event.target.value })
          }
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="create-user-evidence">Evidence snippets</Label>
        <textarea
          id="create-user-evidence"
          className={textareaClassName}
          value={form.evidenceText}
          onChange={(event) =>
            onChange({ ...form, evidenceText: event.target.value })
          }
          placeholder="One snippet per line"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="create-user-notes">Notes</Label>
        <textarea
          id="create-user-notes"
          className={textareaClassName}
          value={form.notes}
          onChange={(event) => onChange({ ...form, notes: event.target.value })}
        />
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        New synthetic users inherit the current shared axes.
      </p>

      <Button disabled={isSaving} type="submit">
        {isSaving ? "Saving..." : "Save synthetic user"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// UsersWorkspace (main export)
// ---------------------------------------------------------------------------

interface UsersWorkspaceProps {
  config: PersonaConfigDoc;
  isDraft: boolean;
  syntheticUserList: SyntheticUserDoc[];
  syntheticUserForm: SyntheticUserFormValue;
  isProtoFormOpen: boolean;
  isSavingSyntheticUser: boolean;
  selectedUserId: string | undefined;
  onToggleProtoForm: () => void;
  onCreateSyntheticUser: (event: React.FormEvent<HTMLFormElement>) => void;
  onSyntheticUserFormChange: (form: SyntheticUserFormValue) => void;
  onSearchChange: (patch: Partial<PersonaConfigDetailSearch>) => void;
}

function UsersWorkspace({
  config,
  isDraft,
  syntheticUserList,
  syntheticUserForm,
  isProtoFormOpen,
  isSavingSyntheticUser,
  selectedUserId,
  onToggleProtoForm,
  onCreateSyntheticUser,
  onSyntheticUserFormChange,
  onSearchChange,
}: UsersWorkspaceProps) {
  const [searchText, setSearchText] = useState("");
  const [sourceFilter, setSourceFilter] = useState<
    SyntheticUserDoc["sourceType"] | ""
  >("");
  const [sortKey, setSortKey] = useState<SortKey>("source");

  const filteredUsers = useMemo(
    () =>
      filterAndSortUsers(syntheticUserList, searchText, sourceFilter, sortKey),
    [syntheticUserList, searchText, sourceFilter, sortKey],
  );

  // ---------------------------------------------------------------------------
  // Auto-select: pick first row when selection is missing or filtered out
  // ---------------------------------------------------------------------------

  const selectedUser = useMemo(
    () => filteredUsers.find((u) => u._id === selectedUserId) ?? null,
    [filteredUsers, selectedUserId],
  );

  useEffect(() => {
    if (filteredUsers.length === 0) {
      if (selectedUserId) {
        onSearchChange({ selectedUserId: undefined });
      }
      return;
    }

    const firstUser = filteredUsers[0];
    if (!selectedUser && firstUser) {
      onSearchChange({ selectedUserId: firstUser._id });
    }
  }, [filteredUsers, selectedUser, selectedUserId, onSearchChange]);

  // ---------------------------------------------------------------------------
  // Keyboard navigation on list
  // ---------------------------------------------------------------------------

  const listRef = useRef<HTMLDivElement>(null);

  const handleListKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (filteredUsers.length === 0) return;

      const currentIndex = selectedUser
        ? filteredUsers.indexOf(selectedUser)
        : -1;

      let nextIndex: number | null = null;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        nextIndex =
          currentIndex < filteredUsers.length - 1 ? currentIndex + 1 : 0;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nextIndex =
          currentIndex > 0 ? currentIndex - 1 : filteredUsers.length - 1;
      } else if (event.key === "Home") {
        event.preventDefault();
        nextIndex = 0;
      } else if (event.key === "End") {
        event.preventDefault();
        nextIndex = filteredUsers.length - 1;
      }

      if (nextIndex !== null) {
        const nextUser = filteredUsers[nextIndex];
        if (nextUser) {
          onSearchChange({ selectedUserId: nextUser._id });
          const buttons = listRef.current?.querySelectorAll('[role="option"]');
          buttons?.[nextIndex]?.scrollIntoView({ block: "nearest" });
        }
      }
    },
    [filteredUsers, selectedUser, onSearchChange],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex gap-4" style={{ minHeight: 480 }}>
      {/* Master pane */}
      <div className="flex w-72 shrink-0 flex-col rounded-xl border bg-card">
        {/* Controls */}
        <div className="space-y-3 border-b p-3">
          <Input
            placeholder="Search users..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            aria-label="Search synthetic users"
          />
          <div className="flex gap-2">
            <select
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(
                  e.target.value as SyntheticUserDoc["sourceType"] | "",
                )
              }
              className={cn(nativeSelectClassName, "flex-1")}
              aria-label="Filter by source"
            >
              <option value="">All sources</option>
              {sourceTypeFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className={cn(nativeSelectClassName, "flex-1")}
              aria-label="Sort order"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {isDraft ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onToggleProtoForm}
            >
              {isProtoFormOpen ? "Close form" : "Add user"}
            </Button>
          ) : null}
        </div>

        {/* List */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Synthetic users"
          tabIndex={0}
          className="flex-1 space-y-1 overflow-y-auto p-2 focus-visible:outline-none"
          onKeyDown={handleListKeyDown}
        >
          {filteredUsers.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">
              {syntheticUserList.length === 0
                ? "No synthetic users yet."
                : "No users match the current filters."}
            </p>
          ) : (
            filteredUsers.map((user) => (
              <UserListRow
                key={user._id}
                user={user}
                isSelected={user._id === selectedUserId}
                onSelect={() =>
                  onSearchChange({ selectedUserId: user._id })
                }
              />
            ))
          )}
        </div>

        {/* Count footer */}
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          {filteredUsers.length} of {syntheticUserList.length} users
        </div>
      </div>

      {/* Inspector pane */}
      <div className="min-w-0 flex-1 overflow-y-auto rounded-xl border bg-card p-5">
        {isProtoFormOpen && isDraft ? (
          <InlineCreateForm
            form={syntheticUserForm}
            isSaving={isSavingSyntheticUser}
            onSubmit={onCreateSyntheticUser}
            onChange={onSyntheticUserFormChange}
            onClose={onToggleProtoForm}
          />
        ) : selectedUser ? (
          <UserInspector
            user={selectedUser}
            config={config}
            isDraft={isDraft}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {syntheticUserList.length === 0
                ? "Add a synthetic user to get started."
                : "Select a user from the list."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export { UsersWorkspace };

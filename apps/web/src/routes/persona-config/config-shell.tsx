import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/domain/page-header";
import { ConfigStatusBadge } from "@/components/domain/status-badge";
import { SummaryValue, SummaryGrid } from "@/components/domain/summary-value";
import { Button } from "@/components/ui/button";
import type { PersonaConfigDetailSearch } from "@/router";
import { ConfigTabs } from "./config-tabs";
import type { PersonaConfigDoc } from "./types";

interface ConfigShellProps {
  config: PersonaConfigDoc;
  resolvedStatus: PersonaConfigDoc["status"];
  syntheticUserCount: number;
  transcriptCount: number;
  activeTab: PersonaConfigDetailSearch["tab"];
  hasActiveBatchRun: boolean;
  actionError: string | null;
  saveMessage: string | null;
  publishedStatusHelp: string | null;
  onTabChange: (patch: Partial<PersonaConfigDetailSearch>) => void;
  onPublish: () => void;
  onArchive: () => void;
  children: ReactNode;
}

function ConfigShell({
  config,
  resolvedStatus,
  syntheticUserCount,
  transcriptCount,
  activeTab,
  hasActiveBatchRun,
  actionError,
  saveMessage,
  publishedStatusHelp,
  onTabChange,
  onPublish,
  onArchive,
  children,
}: ConfigShellProps) {
  const isDraft = resolvedStatus === "draft";

  return (
    <section className="space-y-6">
      <PageHeader
        title={config.name}
        badge={<ConfigStatusBadge status={resolvedStatus} />}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/persona-configs">Back to list</Link>
            </Button>
            {isDraft ? (
              <Button
                disabled={syntheticUserCount === 0 || hasActiveBatchRun}
                onClick={onPublish}
              >
                Publish
              </Button>
            ) : null}
            {resolvedStatus === "published" ? (
              <Button variant="destructive" onClick={onArchive}>
                Archive
              </Button>
            ) : null}
          </>
        }
      />

      <div className="sticky top-0 z-30 -mx-1 rounded-xl border bg-card px-5 py-4 shadow-sm">
        <SummaryGrid columns="grid-cols-2 sm:grid-cols-4 lg:grid-cols-5">
          <SummaryValue label="Status" value={resolvedStatus} />
          <SummaryValue label="Version" value={`v${config.version}`} />
          <SummaryValue
            label="Shared axes"
            value={String(config.sharedAxes.length)}
          />
          <SummaryValue label="Users" value={String(syntheticUserCount)} />
          <SummaryValue label="Transcripts" value={String(transcriptCount)} />
        </SummaryGrid>
      </div>

      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      {saveMessage ? (
        <p className="text-sm text-emerald-700">{saveMessage}</p>
      ) : null}
      {publishedStatusHelp ? (
        <p className="text-sm text-muted-foreground">{publishedStatusHelp}</p>
      ) : null}

      <ConfigTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div role="tabpanel" aria-label={`${activeTab} workspace`}>
        {children}
      </div>
    </section>
  );
}

export { ConfigShell };

import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
export {
  RunStatusBadge,
  StudyStatusBadge,
} from "@/components/domain/status-badge";
import { StudyTabs, type StudyTabKey } from "@/routes/study/study-tabs";

export type StudyDetailSearch = {
  outcome: string | undefined;
  personaName: string | undefined;
  syntheticUserId: string | undefined;
  finalUrlContains: string | undefined;
  severity: string | undefined;
  axisKey: string | undefined;
  axisMin: number | undefined;
  axisMax: number | undefined;
  urlPrefix: string | undefined;
  runId: string | undefined;
};

export const emptyStudyDetailSearch: StudyDetailSearch = {
  outcome: undefined,
  personaName: undefined,
  syntheticUserId: undefined,
  finalUrlContains: undefined,
  severity: undefined,
  axisKey: undefined,
  axisMin: undefined,
  axisMax: undefined,
  urlPrefix: undefined,
  runId: undefined,
};

export { studyTabs } from "@/routes/study/study-tabs";

export function validateStudyDetailSearch(search: Record<string, unknown>) {
  return {
    outcome: normalizeOptionalString(search.outcome),
    personaName: normalizeOptionalString(search.personaName),
    syntheticUserId: normalizeOptionalString(search.syntheticUserId),
    finalUrlContains: normalizeOptionalString(search.finalUrlContains),
    severity: normalizeOptionalString(search.severity),
    axisKey: normalizeOptionalString(search.axisKey),
    axisMin: normalizeOptionalNumber(search.axisMin),
    axisMax: normalizeOptionalNumber(search.axisMax),
    urlPrefix: normalizeOptionalString(search.urlPrefix),
    runId: normalizeOptionalString(search.runId),
  };
}


export function StudyTabsNav({
  activeTab,
  detailSearch,
  studyId,
}: {
  activeTab: StudyTabKey;
  detailSearch: StudyDetailSearch;
  studyId: string;
}) {
  return (
    <StudyTabs
      activeTab={activeTab}
      detailSearch={detailSearch}
      studyId={studyId}
    />
  );
}

export function StudyOverviewLinkButton({
  detailSearch,
  studyId,
}: {
  detailSearch: StudyDetailSearch;
  studyId: string;
}) {
  return (
    <Button asChild variant="outline">
      <Link
        params={{ studyId }}
        search={detailSearch}
        to="/studies/$studyId/overview"
      >
        Go to Overview
      </Link>
    </Button>
  );
}

export { formatDuration, formatTimestamp } from "@/lib/utils";

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return undefined;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}


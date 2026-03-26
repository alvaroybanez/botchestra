import type { Doc, Id } from "../_generated/dataModel";

export type StudyReportArtifactKeys = {
  segmentBreakdownKey: string;
  htmlReportKey: string;
  jsonReportKey: string;
};

export type StudyReportExportReport = Pick<
  Doc<"studyReports">,
  | "studyId"
  | "headlineMetrics"
  | "issueClusterIds"
  | "segmentBreakdownKey"
  | "limitations"
  | "htmlReportKey"
  | "jsonReportKey"
  | "createdAt"
>;

export type StudyReportExportCluster = Pick<
  Doc<"issueClusters">,
  | "_id"
  | "title"
  | "summary"
  | "severity"
  | "affectedRunCount"
  | "affectedRunRate"
  | "affectedProtoPersonaIds"
  | "affectedAxisRanges"
  | "representativeRunIds"
  | "replayConfidence"
  | "evidenceKeys"
  | "recommendation"
  | "confidenceNote"
  | "score"
>;

export function buildStudyReportArtifactKeys(
  studyId: Id<"studies">,
): StudyReportArtifactKeys {
  return {
    segmentBreakdownKey: `study-reports/${studyId}/segment-breakdown.json`,
    htmlReportKey: `study-reports/${studyId}/report.html`,
    jsonReportKey: `study-reports/${studyId}/report.json`,
  };
}

export function buildStudyReportArtifacts({
  report,
  issueClusters,
  resolvedArtifactUrls = {},
}: {
  report: StudyReportExportReport;
  issueClusters: readonly StudyReportExportCluster[];
  resolvedArtifactUrls?: Record<string, string>;
}) {
  const artifactKeys = buildStudyReportArtifactKeys(report.studyId);
  const orderedIssueClusters = orderIssueClusters(report.issueClusterIds, issueClusters);
  const normalizedReport = {
    ...report,
    htmlReportKey: report.htmlReportKey ?? artifactKeys.htmlReportKey,
    jsonReportKey: report.jsonReportKey ?? artifactKeys.jsonReportKey,
  };

  return {
    ...artifactKeys,
    htmlReportKey: normalizedReport.htmlReportKey,
    jsonReportKey: normalizedReport.jsonReportKey,
    html: renderStudyReportHtml(
      normalizedReport,
      orderedIssueClusters,
      resolvedArtifactUrls,
    ),
    json: JSON.stringify(
      {
        ...normalizedReport,
        issueClusters: orderedIssueClusters,
      },
      null,
      2,
    ),
    issueClusters: orderedIssueClusters,
  };
}

function renderStudyReportHtml(
  report: StudyReportExportReport & {
    htmlReportKey: string;
    jsonReportKey: string;
  },
  issueClusters: readonly StudyReportExportCluster[],
  resolvedArtifactUrls: Record<string, string>,
) {
  const headlineMetricCards = [
    {
      label: "Completion rate",
      value: formatPercent(report.headlineMetrics.completionRate),
    },
    {
      label: "Abandonment rate",
      value: formatPercent(report.headlineMetrics.abandonmentRate),
    },
    {
      label: "Median steps",
      value: formatNumber(report.headlineMetrics.medianSteps),
    },
    {
      label: "Median duration",
      value: `${formatNumber(report.headlineMetrics.medianDurationSec)} sec`,
    },
  ]
    .map(
      (metric) => `
        <article class="metric-card">
          <dt>${escapeHtml(metric.label)}</dt>
          <dd>${escapeHtml(metric.value)}</dd>
        </article>
      `,
    )
    .join("");

  const issueClusterMarkup =
    issueClusters.length === 0
      ? `
        <section class="empty-state">
          <h2>No replay-backed issue clusters</h2>
          <p>This study produced no clusterable failures. Headline metrics and limitations are still included for review.</p>
        </section>
      `
      : issueClusters
          .map(
            (cluster, index) => `
              <article class="issue-card">
                <div class="issue-card__header">
                  <span class="issue-rank">#${index + 1}</span>
                  <div>
                    <h2>${escapeHtml(cluster.title)}</h2>
                    <p class="issue-summary">${escapeHtml(cluster.summary)}</p>
                  </div>
                </div>
                <dl class="issue-metadata">
                  <div><dt>Severity</dt><dd>${escapeHtml(cluster.severity)}</dd></div>
                  <div><dt>Impact score</dt><dd>${escapeHtml(cluster.score.toFixed(3))}</dd></div>
                  <div><dt>Affected runs</dt><dd>${escapeHtml(String(cluster.affectedRunCount))}</dd></div>
                  <div><dt>Affected rate</dt><dd>${escapeHtml(formatPercent(cluster.affectedRunRate))}</dd></div>
                  <div><dt>Replay confidence</dt><dd>${escapeHtml(formatPercent(cluster.replayConfidence))}</dd></div>
                </dl>
                <section>
                  <h3>Recommendation</h3>
                  <p>${escapeHtml(cluster.recommendation)}</p>
                </section>
                <section>
                  <h3>Confidence note</h3>
                  <p>${escapeHtml(cluster.confidenceNote)}</p>
                </section>
                <section>
                  <h3>Affected segments</h3>
                  <ul>
                    <li>${escapeHtml(`${cluster.affectedProtoPersonaIds.length} proto-persona segment(s)`)}</li>
                    ${cluster.affectedAxisRanges
                      .map(
                        (range) =>
                          `<li>${escapeHtml(`${range.key}: ${range.min} to ${range.max}`)}</li>`,
                      )
                      .join("")}
                  </ul>
                </section>
                <section>
                  <h3>Evidence</h3>
                  ${
                    cluster.evidenceKeys.length === 0
                      ? "<p>No evidence artifacts were attached to this cluster.</p>"
                      : `<div class="evidence-grid">
                    ${cluster.evidenceKeys
                      .map((key, evidenceIndex) =>
                        renderEvidenceCard(
                          key,
                          evidenceIndex,
                          resolvedArtifactUrls[key] ?? null,
                        ),
                      )
                      .join("")}
                  </div>`
                  }
                </section>
              </article>
            `,
          )
          .join("");

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "  <title>Botchestra Study Report</title>",
    "  <style>",
    "    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }",
    "    body { margin: 0; background: #f8fafc; color: #0f172a; }",
    "    main { max-width: 960px; margin: 0 auto; padding: 32px 20px 64px; }",
    "    h1, h2, h3 { margin: 0 0 12px; }",
    "    p, li, dd { line-height: 1.6; }",
    "    .report-meta { color: #475569; margin-bottom: 24px; }",
    "    .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 24px 0 32px; }",
    "    .metric-card, .issue-card, .limitations, .empty-state { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06); }",
    "    .metric-card dt { font-size: 0.875rem; color: #475569; }",
    "    .metric-card dd { margin: 8px 0 0; font-size: 1.5rem; font-weight: 700; }",
    "    .issue-card { margin-top: 16px; }",
    "    .issue-card__header { display: flex; gap: 16px; align-items: flex-start; }",
    "    .issue-rank { display: inline-flex; align-items: center; justify-content: center; min-width: 40px; height: 40px; border-radius: 999px; background: #0f172a; color: #f8fafc; font-weight: 700; }",
    "    .issue-summary { color: #334155; margin-top: 4px; }",
    "    .issue-metadata { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 20px 0; }",
    "    .issue-metadata dt { color: #475569; font-size: 0.875rem; }",
    "    .issue-metadata dd { margin: 4px 0 0; font-weight: 600; }",
    "    .limitations { margin-top: 32px; }",
    "    .evidence-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }",
    "    .evidence-card { overflow: hidden; text-decoration: none; color: inherit; }",
    "    .evidence-card img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: #e2e8f0; }",
    "    .evidence-card__meta { padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }",
    "    .evidence-card__label { font-weight: 600; }",
    "    .evidence-card__detail { color: #475569; font-size: 0.875rem; }",
    "    code { font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 6px; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <header>",
    "      <h1>Study Report</h1>",
    `      <p class="report-meta">Study ID: <code>${escapeHtml(report.studyId)}</code> · Generated ${escapeHtml(
      new Date(report.createdAt).toISOString(),
    )}</p>`,
    "      <p>This HTML report is self-contained and can be reviewed without Botchestra app access.</p>",
    "    </header>",
    "    <section>",
    "      <h2>Headline metrics</h2>",
    `      <dl class="metric-grid">${headlineMetricCards}</dl>`,
    "    </section>",
    "    <section>",
    "      <h2>Ranked issue clusters</h2>",
    issueClusterMarkup,
    "    </section>",
    '    <section class="limitations">',
    "      <h2>Limitations</h2>",
    "      <ul>",
    ...report.limitations.map((limitation) => `        <li>${escapeHtml(limitation)}</li>`),
    "      </ul>",
    "    </section>",
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function orderIssueClusters(
  issueClusterIds: readonly Id<"issueClusters">[],
  issueClusters: readonly StudyReportExportCluster[],
) {
  const clustersById = new Map(issueClusters.map((cluster) => [cluster._id, cluster]));

  return issueClusterIds.map((issueClusterId) => {
    const issueCluster = clustersById.get(issueClusterId);

    if (issueCluster === undefined) {
      throw new Error(`Issue cluster ${issueClusterId} referenced by report but missing.`);
    }

    return issueCluster;
  });
}

function formatPercent(value: number) {
  return `${Math.round(sanitizeNumber(value) * 100)}%`;
}

function formatNumber(value: number) {
  return sanitizeNumber(value).toFixed(Number.isInteger(value) ? 0 : 1);
}

function sanitizeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderEvidenceCard(
  key: string,
  evidenceIndex: number,
  resolvedUrl: string | null,
) {
  if (resolvedUrl === null) {
    return `
      <article class="metric-card">
        <p class="evidence-card__label">Evidence ${evidenceIndex + 1}</p>
        <p class="evidence-card__detail">Artifact unavailable for key <code>${escapeHtml(
          key,
        )}</code></p>
      </article>
    `;
  }

  const safeUrl = escapeHtml(resolvedUrl);
  const label = `Evidence ${evidenceIndex + 1}`;

  if (isImageArtifact(key, resolvedUrl)) {
    return `
      <a class="metric-card evidence-card" href="${safeUrl}" rel="noreferrer" target="_blank">
        <img alt="${escapeHtml(label)}" src="${safeUrl}" />
        <div class="evidence-card__meta">
          <span class="evidence-card__label">${escapeHtml(label)}</span>
          <span class="evidence-card__detail">View full resolution</span>
        </div>
      </a>
    `;
  }

  return `
    <a class="metric-card evidence-card" href="${safeUrl}" rel="noreferrer" target="_blank">
      <div class="evidence-card__meta">
        <span class="evidence-card__label">${escapeHtml(label)}</span>
        <span class="evidence-card__detail">Open artifact</span>
      </div>
    </a>
  `;
}

function isImageArtifact(key: string, resolvedUrl: string) {
  const normalizedKey = key.toLowerCase();
  const normalizedUrl = resolvedUrl.toLowerCase();

  return (
    normalizedUrl.startsWith("data:image/") ||
    normalizedKey.endsWith(".png") ||
    normalizedKey.endsWith(".jpg") ||
    normalizedKey.endsWith(".jpeg") ||
    normalizedKey.endsWith(".gif") ||
    normalizedKey.endsWith(".webp") ||
    normalizedUrl.includes(".png") ||
    normalizedUrl.includes(".jpg") ||
    normalizedUrl.includes(".jpeg") ||
    normalizedUrl.includes(".gif") ||
    normalizedUrl.includes(".webp")
  );
}

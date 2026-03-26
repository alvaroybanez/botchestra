import { DEMO_STUDY_ID } from "@/routes/skeleton-pages";

export type DemoStudySummary = {
  _id: string;
  name: string;
  status: string;
  runBudget: number;
  updatedAt: number;
};

export type DemoStudyReport = {
  _id: string;
  studyId: string;
  headlineMetrics: {
    completionRate: number;
    abandonmentRate: number;
    medianSteps: number;
    medianDurationSec: number;
  };
  issueClusterIds: string[];
  limitations: string[];
  htmlReportKey?: string;
  jsonReportKey?: string;
  createdAt: number;
};

export type DemoRunListItem = {
  _id: string;
  status: string;
  protoPersonaId: string;
  protoPersonaName: string;
  protoPersonaSummary: string;
  firstPersonBio: string;
  axisValues: { key: string; value: number }[];
  finalUrl?: string;
  finalOutcome?: string;
  durationSec?: number;
  stepCount?: number;
};

export type DemoRunDetail = {
  run: {
    _id: string;
    status: string;
    finalUrl?: string;
    finalOutcome?: string;
    durationSec?: number;
    stepCount?: number;
    selfReport?: {
      perceivedSuccess: boolean;
      hardestPart?: string;
      confusion?: string;
      confidence?: number;
      suggestedChange?: string;
    };
    artifactManifestKey?: string;
    summaryKey?: string;
  };
  personaVariant: {
    _id: string;
    firstPersonBio: string;
    axisValues: { key: string; value: number }[];
  };
  protoPersona: {
    _id: string;
    name: string;
  };
  milestones: Array<{
    _id: string;
    stepIndex: number;
    timestamp: number;
    url: string;
    title: string;
    actionType: string;
    rationaleShort: string;
    screenshotKey?: string;
  }>;
};

export type DemoFinding = {
  _id: string;
  title: string;
  summary: string;
  severity: "blocker" | "major" | "minor" | "cosmetic";
  affectedRunCount: number;
  affectedRunRate: number;
  affectedAxisRanges: Array<{ key: string; min: number; max: number }>;
  recommendation: string;
  confidenceNote: string;
  replayConfidence: number;
  affectedProtoPersonas: Array<{ _id: string; name: string }>;
  evidence: Array<{
    key: string;
    thumbnailKey: string;
    fullResolutionKey: string;
  }>;
  notes: Array<{
    _id: string;
    authorId: string;
    note: string;
    createdAt: number;
  }>;
  representativeRuns: Array<{
    _id: string;
    protoPersonaId: string;
    protoPersonaName: string | null;
    status: string;
    finalUrl: string | null;
    finalOutcome: string | null;
    representativeQuote: string | null;
    evidence: Array<{
      key: string;
      thumbnailKey: string;
      fullResolutionKey: string;
    }>;
  }>;
};

const demoTimestamp = new Date("2026-03-26T10:30:00Z").getTime();

export const demoStudySummary: DemoStudySummary = {
  _id: DEMO_STUDY_ID,
  name: "Checkout usability benchmark",
  status: "completed",
  runBudget: 64,
  updatedAt: demoTimestamp,
};

const demoIssueClusterIds = [
  "finding-demo-address",
  "finding-demo-payment",
] as const;

export const demoStudyReport: DemoStudyReport = {
  _id: "report-demo-study",
  studyId: DEMO_STUDY_ID,
  headlineMetrics: {
    completionRate: 0.68,
    abandonmentRate: 0.19,
    medianSteps: 7,
    medianDurationSec: 188,
  },
  issueClusterIds: [...demoIssueClusterIds],
  limitations: [
    "Findings are synthetic and directional, not a replacement for human usability testing.",
    "High-confidence issues should still be confirmed with replay review and human follow-up.",
  ],
  htmlReportKey: "study-reports/demo-study/report.html",
  jsonReportKey: "study-reports/demo-study/report.json",
  createdAt: demoTimestamp,
};

export const demoRuns: DemoRunListItem[] = [
  {
    _id: "run-demo-address",
    status: "hard_fail",
    protoPersonaId: "proto-demo-careful",
    protoPersonaName: "Careful shopper",
    protoPersonaSummary: "Moves slowly and checks totals before advancing.",
    firstPersonBio:
      "I move carefully through checkout and need reassurance before I commit to payment.",
    axisValues: [
      { key: "digital_confidence", value: -0.58 },
      { key: "support_needs", value: 0.72 },
    ],
    finalUrl: "https://example.com/checkout/address",
    finalOutcome: "address_validation_failed",
    durationSec: 185,
    stepCount: 7,
  },
  {
    _id: "run-demo-payment",
    status: "soft_fail",
    protoPersonaId: "proto-demo-busy",
    protoPersonaName: "Busy parent",
    protoPersonaSummary: "Moves quickly and reacts strongly to unexpected price changes.",
    firstPersonBio:
      "I am juggling a busy schedule and expect totals to stay stable once I start checkout.",
    axisValues: [
      { key: "digital_confidence", value: 0.41 },
      { key: "support_needs", value: 0.18 },
    ],
    finalUrl: "https://example.com/checkout/payment",
    finalOutcome: "payment_total_unclear",
    durationSec: 143,
    stepCount: 6,
  },
];

export const demoRunDetailsById: Record<string, DemoRunDetail> = {
  "run-demo-address": {
    run: {
      _id: "run-demo-address",
      status: "hard_fail",
      finalUrl: "https://example.com/checkout/address",
      finalOutcome: "address_validation_failed",
      durationSec: 185,
      stepCount: 7,
      selfReport: {
        perceivedSuccess: false,
        hardestPart: "The shipping address step",
        confusion: "I could not find a visible continue button after entering the address.",
        confidence: 0.24,
        suggestedChange: "Keep the continue button pinned under the form fields.",
      },
      artifactManifestKey: createDemoImageDataUrl(
        "Artifact manifest preview",
        "#F59E0B",
      ),
      summaryKey: createDemoImageDataUrl("Run summary preview", "#2563EB"),
    },
    personaVariant: {
      _id: "variant-demo-careful",
      firstPersonBio:
        "I move carefully through checkout and need reassurance before I commit to payment.",
      axisValues: [
        { key: "digital_confidence", value: -0.58 },
        { key: "support_needs", value: 0.72 },
      ],
    },
    protoPersona: {
      _id: "proto-demo-careful",
      name: "Careful shopper",
    },
    milestones: [
      {
        _id: "milestone-demo-address-1",
        stepIndex: 1,
        timestamp: demoTimestamp - 300_000,
        url: "https://example.com/checkout/cart",
        title: "Cart",
        actionType: "click",
        rationaleShort: "Started checkout from the cart page.",
        screenshotKey: createDemoImageDataUrl("Cart milestone", "#0F766E"),
      },
      {
        _id: "milestone-demo-address-2",
        stepIndex: 2,
        timestamp: demoTimestamp - 240_000,
        url: "https://example.com/checkout/address",
        title: "Address",
        actionType: "type",
        rationaleShort: "Completed the address form, but the next step affordance disappeared.",
        screenshotKey: createDemoImageDataUrl("Address milestone", "#DC2626"),
      },
    ],
  },
  "run-demo-payment": {
    run: {
      _id: "run-demo-payment",
      status: "soft_fail",
      finalUrl: "https://example.com/checkout/payment",
      finalOutcome: "payment_total_unclear",
      durationSec: 143,
      stepCount: 6,
      selfReport: {
        perceivedSuccess: false,
        hardestPart: "The payment step",
        confusion: "The total changed after I had already committed to the purchase.",
        confidence: 0.41,
        suggestedChange: "Explain taxes and shipping before the payment step.",
      },
      artifactManifestKey: createDemoImageDataUrl(
        "Payment artifact preview",
        "#9333EA",
      ),
      summaryKey: createDemoImageDataUrl("Payment summary preview", "#1D4ED8"),
    },
    personaVariant: {
      _id: "variant-demo-busy",
      firstPersonBio:
        "I am juggling a busy schedule and expect totals to stay stable once I start checkout.",
      axisValues: [
        { key: "digital_confidence", value: 0.41 },
        { key: "support_needs", value: 0.18 },
      ],
    },
    protoPersona: {
      _id: "proto-demo-busy",
      name: "Busy parent",
    },
    milestones: [
      {
        _id: "milestone-demo-payment-1",
        stepIndex: 1,
        timestamp: demoTimestamp - 200_000,
        url: "https://example.com/checkout/address",
        title: "Address",
        actionType: "click",
        rationaleShort: "Saved the address and continued to payment.",
        screenshotKey: createDemoImageDataUrl("Address complete", "#16A34A"),
      },
      {
        _id: "milestone-demo-payment-2",
        stepIndex: 2,
        timestamp: demoTimestamp - 170_000,
        url: "https://example.com/checkout/payment",
        title: "Payment",
        actionType: "wait",
        rationaleShort: "Paused after noticing taxes and shipping changed at the last moment.",
        screenshotKey: createDemoImageDataUrl("Payment totals", "#EA580C"),
      },
    ],
  },
};

export const demoFindings: DemoFinding[] = [
  {
    _id: "finding-demo-address",
    title: "Checkout continue button hidden on the address step",
    summary:
      "A blocker cluster where the primary continue action disappears after the address form validates.",
    severity: "blocker",
    affectedRunCount: 3,
    affectedRunRate: 0.5,
    affectedAxisRanges: [
      { key: "digital_confidence", min: -0.9, max: -0.3 },
      { key: "support_needs", min: 0.4, max: 0.9 },
    ],
    recommendation:
      "Pin the continue action below the form and keep it visible after validation messages appear.",
    confidenceNote: "Replay reproduced the missing button twice with the same CSS overlap.",
    replayConfidence: 0.82,
    affectedProtoPersonas: [
      { _id: "proto-demo-careful", name: "Careful shopper" },
    ],
    evidence: [
      {
        key: "demo-address-evidence",
        thumbnailKey: createDemoImageDataUrl("Address issue thumbnail", "#DC2626"),
        fullResolutionKey: createDemoImageDataUrl("Address issue full resolution", "#991B1B"),
      },
    ],
    notes: [
      {
        _id: "note-demo-address-1",
        authorId: "analyst-a",
        note: "Replay evidence confirms the continue button is clipped below the fold.",
        createdAt: demoTimestamp - 120_000,
      },
      {
        _id: "note-demo-address-2",
        authorId: "analyst-b",
        note: "The problem appears after the postal code field re-renders with validation copy.",
        createdAt: demoTimestamp - 90_000,
      },
    ],
    representativeRuns: [
      {
        _id: "run-demo-address",
        protoPersonaId: "proto-demo-careful",
        protoPersonaName: "Careful shopper",
        status: "hard_fail",
        finalUrl: "https://example.com/checkout/address",
        finalOutcome: "address_validation_failed",
        representativeQuote:
          "I could not figure out how to continue from the address step.",
        evidence: [
          {
            key: "demo-address-run-evidence",
            thumbnailKey: createDemoImageDataUrl("Run evidence", "#B91C1C"),
            fullResolutionKey: createDemoImageDataUrl("Run evidence full resolution", "#7F1D1D"),
          },
        ],
      },
    ],
  },
  {
    _id: "finding-demo-payment",
    title: "Payment totals shift late in checkout",
    summary:
      "A minor cluster where last-minute tax and shipping changes create hesitation on the payment step.",
    severity: "minor",
    affectedRunCount: 2,
    affectedRunRate: 0.33,
    affectedAxisRanges: [
      { key: "digital_confidence", min: 0.2, max: 0.8 },
    ],
    recommendation:
      "Explain taxes and shipping earlier so totals stay predictable by the time payment loads.",
    confidenceNote: "Observed once in replay and once in the source run.",
    replayConfidence: 0.44,
    affectedProtoPersonas: [
      { _id: "proto-demo-busy", name: "Busy parent" },
    ],
    evidence: [
      {
        key: "demo-payment-evidence",
        thumbnailKey: createDemoImageDataUrl("Payment issue thumbnail", "#EA580C"),
        fullResolutionKey: createDemoImageDataUrl("Payment issue full resolution", "#C2410C"),
      },
    ],
    notes: [
      {
        _id: "note-demo-payment-1",
        authorId: "analyst-c",
        note: "The pricing delta is subtle enough that fast-moving shoppers assume the site made an error.",
        createdAt: demoTimestamp - 70_000,
      },
    ],
    representativeRuns: [
      {
        _id: "run-demo-payment",
        protoPersonaId: "proto-demo-busy",
        protoPersonaName: "Busy parent",
        status: "soft_fail",
        finalUrl: "https://example.com/checkout/payment",
        finalOutcome: "payment_total_unclear",
        representativeQuote:
          "I was not sure why the total changed once I reached payment.",
        evidence: [
          {
            key: "demo-payment-run-evidence",
            thumbnailKey: createDemoImageDataUrl("Payment run evidence", "#FB923C"),
            fullResolutionKey: createDemoImageDataUrl("Payment run full resolution", "#9A3412"),
          },
        ],
      },
    ],
  },
];

function createDemoImageDataUrl(label: string, accentColor: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <rect width="1280" height="720" fill="#111827" />
      <rect x="48" y="48" width="1184" height="624" rx="28" fill="#F8FAFC" />
      <rect x="96" y="112" width="320" height="18" rx="9" fill="${accentColor}" opacity="0.9" />
      <rect x="96" y="164" width="1088" height="28" rx="14" fill="#E2E8F0" />
      <rect x="96" y="220" width="780" height="18" rx="9" fill="#CBD5E1" />
      <rect x="96" y="262" width="880" height="18" rx="9" fill="#CBD5E1" />
      <rect x="96" y="322" width="420" height="220" rx="18" fill="${accentColor}" opacity="0.18" />
      <rect x="560" y="322" width="624" height="220" rx="18" fill="#E2E8F0" />
      <text x="96" y="610" fill="#0F172A" font-family="system-ui, sans-serif" font-size="40" font-weight="700">
        ${escapeXml(label)}
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

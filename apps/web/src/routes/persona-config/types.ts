import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import type { VariantReviewData } from "@/components/persona-variant-review-grid";

export type PersonaConfigDoc = Doc<"personaConfigs">;
export type SyntheticUserDoc = Doc<"syntheticUsers">;
export type AxisDefinition = Doc<"axisDefinitions">;
export type PersonaConfigId = Id<"personaConfigs">;
export type TranscriptDoc = Doc<"transcripts">;
export type TranscriptId = Id<"transcripts">;
export type TranscriptSignalDoc = Doc<"transcriptSignals">;

export type ConfigTranscriptAttachment = {
  _id: Id<"configTranscripts">;
  configId: PersonaConfigId;
  transcriptId: TranscriptId;
  createdAt: number;
  transcript: TranscriptDoc;
};

export type ViewerAccess = {
  role: "researcher" | "reviewer" | "admin";
  permissions: {
    canManagePersonaConfigs: boolean;
  };
} | null;

export type AxisFormValue = {
  key: string;
  label: string;
  description: string;
  lowAnchor: string;
  midAnchor: string;
  highAnchor: string;
  weight: string;
};

export type ConfigFormValue = {
  name: string;
  description: string;
  context: string;
  sharedAxes: AxisFormValue[];
};

export type SuggestedAxisState = {
  id: string;
  axis: AxisFormValue;
  isEditing: boolean;
  isSelected: boolean;
};

export type InlineToastState = {
  message: string;
  tone: "error" | "success";
};

export type ExtractionMode = "auto_discover" | "guided";

export type TranscriptEvidenceSnippet = {
  transcriptId: TranscriptId;
  quote: string;
  startChar: number;
  endChar: number;
};

export type ExtractionArchetypeState = {
  id: string;
  name: string;
  summary: string;
  axisValues: Array<{ key: string; value: number }>;
  evidenceSnippets: TranscriptEvidenceSnippet[];
  contributingTranscriptIds: TranscriptId[];
  isSelected: boolean;
  isEditing: boolean;
};

export type ExtractionReviewAxisState = {
  id: string;
  axis: AxisFormValue;
  isEditing: boolean;
  isRemoved: boolean;
};

export type ExtractionStatus = {
  configId: PersonaConfigId;
  mode: ExtractionMode;
  status: "processing" | "completed" | "completed_with_failures" | "failed";
  guidedAxes: PersonaConfigDoc["sharedAxes"];
  proposedAxes: PersonaConfigDoc["sharedAxes"];
  archetypes: Array<{
    name: string;
    summary: string;
    axisValues: Array<{ key: string; value: number }>;
    evidenceSnippets: TranscriptEvidenceSnippet[];
    contributingTranscriptIds: TranscriptId[];
  }>;
  totalTranscripts: number;
  processedTranscriptCount: number;
  currentTranscriptId: TranscriptId | null;
  succeededTranscriptIds: TranscriptId[];
  failedTranscripts: Array<{
    transcriptId: TranscriptId;
    error: string;
  }>;
  errorMessage: string | null;
  startedBy: string;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  transcriptSignals: TranscriptSignalDoc[];
};

export type SyntheticUserFormValue = {
  name: string;
  summary: string;
  evidenceText: string;
  notes: string;
};

export type ConfirmationState =
  | {
      kind: "publish";
      title: string;
      description: string;
      confirmLabel: string;
    }
  | {
      kind: "archive";
      title: string;
      description: string;
      confirmLabel: string;
    };

export type ConfigVariantReviewData = VariantReviewData & {
  selectedStudy: VariantReviewData["study"];
  studies: Array<
    NonNullable<VariantReviewData["study"]> & {
      acceptedVariantCount: number;
    }
  >;
};

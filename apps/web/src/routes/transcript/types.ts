import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

export type TranscriptDoc = Doc<"transcripts">;
export type PersonaConfigDoc = Doc<"personaConfigs">;
export type TranscriptId = Id<"transcripts">;

export type ViewerAccess = {
  role: "researcher" | "reviewer" | "admin";
  permissions: {
    canManagePersonaConfigs: boolean;
  };
} | null;

export type TranscriptContent =
  | {
      format: "txt";
      text: string;
    }
  | {
      format: "json";
      turns: Array<{
        speaker: string;
        text: string;
        timestamp?: number;
      }>;
    }
  | null;

export type TranscriptMetadataFormState = {
  participantId: string;
  tags: string;
  notes: string;
};

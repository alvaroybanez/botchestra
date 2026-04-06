import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SummaryValue } from "@/components/domain/summary-value";
import type { TranscriptDoc, TranscriptMetadataFormState } from "./types";

export function MetadataPanel({
  canManage,
  isSaving,
  metadataForm,
  onFormChange,
  onSubmit,
  transcript,
}: {
  canManage: boolean;
  isSaving: boolean;
  metadataForm: TranscriptMetadataFormState;
  onFormChange: (next: TranscriptMetadataFormState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  transcript: TranscriptDoc;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Metadata</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage ? (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="transcript-participant-id">
                Participant ID
              </Label>
              <Input
                id="transcript-participant-id"
                value={metadataForm.participantId}
                onChange={(event) =>
                  onFormChange({
                    ...metadataForm,
                    participantId: event.target.value,
                  })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="transcript-tags">Tags</Label>
              <Input
                id="transcript-tags"
                placeholder="checkout, onboarding"
                value={metadataForm.tags}
                onChange={(event) =>
                  onFormChange({
                    ...metadataForm,
                    tags: event.target.value,
                  })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="transcript-notes">Notes</Label>
              <Textarea
                id="transcript-notes"
                value={metadataForm.notes}
                onChange={(event) =>
                  onFormChange({
                    ...metadataForm,
                    notes: event.target.value,
                  })
                }
              />
            </div>

            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save metadata"}
            </Button>
          </form>
        ) : (
          <dl className="grid gap-4">
            <SummaryValue
              label="Participant ID"
              variant="inline"
              value={transcript.metadata.participantId ?? "Not set"}
            />
            <SummaryValue
              label="Tags"
              variant="inline"
              value={
                transcript.metadata.tags.length > 0
                  ? transcript.metadata.tags.join(", ")
                  : "No tags"
              }
            />
            <SummaryValue
              label="Notes"
              variant="inline"
              value={transcript.metadata.notes ?? "No notes"}
            />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

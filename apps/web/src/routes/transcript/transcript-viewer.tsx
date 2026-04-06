import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TranscriptContent } from "./types";
import { highlightText } from "./helpers";

export function TranscriptContentCard({
  content,
  contentError,
  highlightSnippet,
  isContentLoading,
}: {
  content: TranscriptContent;
  contentError: string | null;
  highlightSnippet: string;
  isContentLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcript content</CardTitle>
      </CardHeader>
      <CardContent>
        {isContentLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading transcript content...
          </p>
        ) : contentError ? (
          <p className="text-sm text-destructive">{contentError}</p>
        ) : content?.format === "txt" ? (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm leading-6">
            <HighlightedTranscriptText
              highlightSnippet={highlightSnippet}
              text={content.text}
            />
          </pre>
        ) : content?.format === "json" ? (
          <div className="grid gap-3">
            {content.turns.map((turn, index) => (
              <div
                key={`${turn.speaker}-${index}`}
                className="rounded-xl border bg-background p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{turn.speaker}</p>
                  {turn.timestamp !== undefined ? (
                    <Badge variant="outline">{turn.timestamp}s</Badge>
                  ) : null}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  <HighlightedTranscriptText
                    highlightSnippet={highlightSnippet}
                    text={turn.text}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Content is not available yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HighlightedTranscriptText({
  highlightSnippet,
  text,
}: {
  highlightSnippet: string;
  text: string;
}) {
  const normalizedSnippet = highlightSnippet.trim();

  if (normalizedSnippet.length === 0) {
    return <>{text}</>;
  }

  const segments = highlightText(text, normalizedSnippet);

  return (
    <>
      {segments.map((segment, index) =>
        segment.isMatch ? (
          <mark
            key={`${segment.text}-${index}`}
            className="rounded bg-amber-200 px-0.5 text-foreground"
            data-highlighted-snippet="true"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={`${segment.text}-${index}`}>{segment.text}</span>
        ),
      )}
    </>
  );
}

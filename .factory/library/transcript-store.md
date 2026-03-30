# Transcript store backend notes

- `api.transcripts.uploadTranscript` is a two-phase mutation:
  1. call with `originalFilename` (+ optional `metadata`) and no `storageId` to get `{ uploadUrl, transcriptId: null }`
  2. POST the file to that URL, then call the same mutation again with the returned `storageId` to create the transcript row and queue processing
- `api.transcripts.getTranscriptContent` is a **public action**, not a query, because Convex storage byte reads require the action runtime.
- `api.packTranscripts.listPackTranscripts` returns junction rows with embedded `transcript`.
- `api.packTranscripts.listTranscriptPacks` returns junction rows with embedded `pack`.

# User Testing

Testing surface, required tools, and resource cost classification.

## Validation Surface

- **Primary surface:** Web browser at `http://localhost:5180`
- **Tool:** `agent-browser` for all UI validation flows
- **Auth:** Convex Auth password provider. Login via `/login` page. Create test users via `/signup` if needed.
- **New pages to test:**
  - `/axis-library` — Axis Library (browse, create, edit, delete axes)
  - `/transcripts` — Transcript Store (upload, browse, view, manage transcripts)
  - `/transcripts/:id` — Transcript detail (viewer, metadata, pack links)
  - `/persona-packs/:packId` — Enhanced pack detail (suggest axes, browse library, extract from transcripts)

## Validation Concurrency

- **Max concurrent validators:** 5
- **Rationale:** Dev server is lightweight (~55 MB RSS, 0.1% memory at idle). Machine has 36 GB RAM, 12 CPU cores, ~4 GB free pages at baseline. Each agent-browser instance uses ~300 MB. 5 instances = ~1.5 GB + 200 MB dev server = ~1.7 GB. Well within 70% of ~12 GB headroom = 8.4 GB budget.

## Testing Notes

- The dev server is usually already running on port 5180. Check before starting a new one.
- LLM-powered features (axis generation, transcript extraction) require OPENAI_API_KEY set in Convex env. init.sh handles this.
- For transcript extraction testing, use small test transcripts (< 1000 chars each) to minimize LLM cost during validation.
- Cross-area flows (VAL-CROSS-*) test the full pipeline and should be validated last, after all individual area flows pass.

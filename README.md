# Community Orchestrator

> "What does my community need right now?" — an AI community manager for WhatsApp communities, built on Claude.

Upload WhatsApp group exports → Claude builds a model of the people, topics and open threads → you get a prioritized, Hebrew, ready-to-execute weekly action plan (introductions, working groups, events, revivals, rituals), each grounded in real quotes from the chats.

## Run it

```bash
pnpm install
cp .env.local.example .env.local   # add ANTHROPIC_API_KEY
pnpm dev                           # http://localhost:3000
```

Flow: `/onboarding` (community + groups) → `/upload` (drop the `.zip`/`.txt` exports, pick a group per file, "נתח את הקהילה") → `/analysis/<run>` (live progress) → `/home`.

## CLI (faster for development)

```bash
pnpm tsx scripts/parse-check.ts "<export.zip>"                    # parser sanity check, counts only
pnpm tsx scripts/seed.ts --group "שאלות ועזרה" --kind help --file "<export.zip>"
pnpm tsx scripts/analyze.ts --dry-run                             # chunk plan + cost estimate, no API calls
pnpm tsx scripts/analyze.ts --days 90 --max-chunks 1 --stage A    # one chunk of Stage A
pnpm tsx scripts/analyze.ts --run 3 --stage B --effort xhigh      # re-run the orchestrator only (cache hit)
pnpm tsx scripts/analyze.ts --run 3                               # resume a crashed run
pnpm vitest run                                                   # parser tests
```

## How it works

1. **Parse** (`src/lib/parser`) — iOS and Android export formats, multi-line messages, bidi marks, media/system/deleted markers.
2. **Pseudonymize** (`src/lib/pseudonym`) — every sender becomes a stable `M0123`. Phones and known names inside message bodies are replaced too. The only file with real identifiers is `data/pseudonyms.json` (gitignored). The DB, the prompts and the logs never see a real name.
3. **Stage A** (`src/lib/analysis/stageA.ts`) — per group, per ~110K-token chunk: structured extraction of member profile fragments, topic signals and notable threads, every item citing message ids. Streams, `claude-opus-5`, 1-hour prompt cache on the group prefix.
4. **Merge** (`merge.ts`) — pure TypeScript: unions fragments per member, merges topics by alias, drops any id that is not in the database, adds facts only the DB knows (activity, group membership, who already interacts with whom).
5. **Stage B** (`stageB.ts`) — one orchestrator call over the compact community model (≤80K tokens, cached 1h) → 6–10 prioritized recommendations with evidence, people, tiers and a WhatsApp-ready Hebrew message.
6. **Home** — quotes are fetched from the DB by message id, never taken from the model. Names are resolved at render time; the eye icon in the header switches to pseudonyms for screenshots.

Data lives in `./data` (SQLite + pseudonym map). Delete the folder to start over.

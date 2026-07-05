# MS Teams Integration — connectivity and the impact of posts

How Etienne connects to Microsoft Teams, and — crucially — **what happens
where** when someone posts a message, in the internal chat (Etienne UI) versus
the external chat (a real Teams channel). Written around the
`teams-comms-observer` seed project (the "Hyperactive Hive Mind" analyst),
but the mechanics apply to any project.

## Architecture — two independent legs

```
                       ┌────────────────────────────────────────────────┐
   OBSERVE (inbound)   │  Microsoft Graph (delegated OAuth per project) │
   Teams channels ────▶│  TeamsChannelSyncService (backend, ms365/)     │
   full conversation   │  polls delta / high-water-mark every ~2 min    │
                       └───────────────┬────────────────────────────────┘
                                       ▼
                        workspace/<project>/data/teams/<channel-slug>/
                          messages.jsonl   (append-only event log)
                          YYYY-MM-DD.md    (regenerated daily transcripts)
                          assets/          (inline images)
                                       │
                                       ▼
                        nightly cron → unattended agent run → analysis
                        (wiki profiles, KG PatternOccurrences, reports,
                         hyperscreen dashboard data)

                       ┌────────────────────────────────────────────────┐
   ANSWER (outbound)   │  Azure Bot / Bot Framework                     │
   @mention in a  ────▶│  ms-teams service (:6360, ngrok-exposed)       │
   channel or personal │  → backend remote-sessions → unattended agent  │
   chat                │  → reply posted back in-thread by the bot      │
                       └────────────────────────────────────────────────┘
```

The two legs are deliberately separate:

- **Observation** uses **Microsoft Graph with delegated auth** (the
  per-project MS365 connection). The connected account acts as the observer's
  eyes and must be a **member of every observed team**. Bots cannot do this:
  in channels a bot only receives messages it is @-mentioned in.
- **Answering** uses the **Bot Framework**: the bot only ever *reacts* — it
  receives an activity when @-mentioned and replies into that thread. It has
  no visibility into the rest of the channel.

## Impact of posts — the matrix

| Someone posts… | Ingested for analysis? | Agent runs? | Externally visible output? |
|---|---|---|---|
| a message in an observed Teams channel (no mention) | ✅ next sync cycle → `data/teams/` | ❌ (analysis happens on the nightly cron / on demand) | ❌ nothing — silent observer |
| a channel message **@-mentioning the bot** | ✅ (via sync, like any message) | ✅ immediately via the bot leg | ✅ **the bot's in-thread reply — visible to the whole channel** |
| a message in the **Etienne chat UI** | n/a | ✅ normal interactive session | ❌ stays internal; nothing reaches Teams |
| an edit / delete / reaction in an observed channel | ✅ delta + hourly refresh window append the change to `messages.jsonl`; the daily `.md` is regenerated (deletions become `~~[message deleted]~~`) | ❌ | ❌ |
| the nightly cron fires | reads what sync collected | ✅ unattended run | ❌ — writes only to `wiki/`, `out/`, `reports/`, the KG, and dashboard data |

**The single externally visible output is the bot's in-thread answer to a
direct @mention.** Everything else the observer produces (profiles, pattern
occurrences, reports, the team-agreement draft) lives inside the project
workspace. That asymmetry is the "silent observer" contract: the team is
observed, but the observer never initiates contact. Because an @mention
answer is visible to the whole channel, the persona keeps such answers brief,
neutral, and evidence-based — safe to read for everyone mentioned in them.

## Internal chat ↔ external chat coupling

- **Remote → internal:** when the bot forwards an @mention to the backend
  (`remote-sessions`), both the user's message and the agent's reply are also
  emitted into the project's **internal chat pane** (tagged with a Teams chip
  via `sourceMetadata.provider = 'teams'`). The internal chat is therefore a
  superset: it shows internal conversations *plus* the remote @mention
  round-trips.
- **Internal → external: never.** Nothing typed in the Etienne UI is posted
  to Teams. There is no code path for the agent to write into a channel
  except the synchronous reply to an incoming bot activity.

## Connectivity setup

### Leg 1 — Graph observation (channel mirroring)

1. **Entra app registration**: add the delegated permissions
   `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`
   (admin consent required for the last). The default scope string lives in
   `backend/src/ms365/ms365-scopes.ts`; deployments overriding `MS365_SCOPES`
   must include these themselves.
2. **Connect MS365 for the project** (`/api/ms365/:project/connect`, or the
   Connectivity → MS Teams tab). Existing connections consented before the
   Teams scopes were added must **re-connect** (refresh-token grants fail
   with `AADSTS65001` otherwise). The account must be a member of the
   observed teams.
3. **Pick channels**: Connectivity → MS Teams tab, or
   `PUT /api/msteams-observer/:project/channels`. Config is stored at
   `workspace/<project>/.etienne/teams-observer.json`; sync state at
   `data/teams/.meta/state.json`.
4. **Sync mechanics**: primary mode is the Graph **delta** query per channel
   (`/teams/{tid}/channels/{cid}/messages/delta`). Stored delta tokens are
   known to occasionally start failing with HTTP 400 — the service then
   permanently switches that channel to a **high-water-mark** mode
   (newest-first paging until known territory). Reactions don't surface via
   delta, so an hourly **refresh window** re-reads the recent
   `refreshWindowHours` and diffs. Backoff on repeated failures is
   exponential up to 15 min; `MS365 not connected` is silently ignored.
   Channels are fetched sequentially and the default interval is 120 s —
   Graph throttling budgets for channel-message endpoints are small; keep
   the interval ≥ 120 s when observing more than ~3 channels.

### Leg 2 — Bot answering (@mention)

1. **Azure Bot** resource with the Teams channel enabled; `ms-teams/.env`
   needs `MICROSOFT_APP_ID` / `MICROSOFT_APP_PASSWORD`; expose
   `POST /api/messages` via HTTPS (ngrok for local dev). See
   `ms-teams/README.md`.
2. **Install the bot into the team** — channel @mentions only reach the
   webhook if the bot is installed via a Teams app package:
   `ms-teams/appPackage/` (manifest with `scopes: ["personal", "team"]`,
   packaging + sideload instructions in its README).
3. **Pairing**: the first @mention triggers a pairing request in the Etienne
   UI (admin approves), then `@Bot project 'teams-comms-observer'` binds the
   channel to the project. Channel thread suffixes (`;messageid=…`) are
   normalized away, so **one pairing covers the whole channel** and replies
   still land in the correct thread.

## Data formats (what the agent reads)

- `data/teams/<slug>/messages.jsonl` — canonical **append-only event log**;
  one normalized message per line (`id`, `replyToId`, `from`, timestamps,
  `deleted`/`edited`, markdown-converted `text`, `mentions`, aggregated
  `reactions`, `attachments`, `assets`, `webUrl`). Edits/deletes/reaction
  changes append a newer line with the same `id` — readers take the latest
  line per id. Message HTML is converted by `backend/src/ms365/teams-html.ts`
  (mentions → `@Name`, code blocks preserved, inline images → `assets/`).
- `data/teams/<slug>/YYYY-MM-DD.md` — regenerated, human/agent-readable daily
  transcripts with `webUrl` links for citations.
- Transcripts are **not** RAG-indexed (edit churn); reference material in
  `documents/` is.

## Privacy

Observing colleagues is sensitive. The observer persona enforces: findings
phrased as patterns-not-character ("the channel shows X", never "Y is bad at
Z"), every claim evidence-cited, the read-aloud test for anything written,
transcripts confined to the project workspace, and no proactive posting or
private messaging — see the seeded
`wiki/topics/privacy-and-ethics-guardrails.md`. The remedy framing is
systemic: hive-mind patterns are produced by missing team agreements, not by
individuals.

## Known limits

- Reactions reach transcripts with up to ~1 h lag (refresh window).
- Messages older than `backfillDays` (default 90) are never fetched.
- The bot cannot read the channel; the Graph observer cannot post. This is
  by design (see the matrix above).
- Application-permission (tenant-wide, accountless) reading of channel
  messages is a Microsoft **protected API** requiring an approval process —
  the delegated observer-account model deliberately avoids it.

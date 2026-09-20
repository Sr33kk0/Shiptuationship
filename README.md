## Front-end

- Webapp 

## Back-end
- n8n Cloud hosted

## Database
Firestore Google

---
## Frontend ↔ Firestore

Next.js route handlers (`app/api/emails`) read/write Firestore over REST using a Google OAuth2 refresh token — same model as the n8n credential. No service account, no Firebase SDK.

1. Copy `.env.example` to `.env.local`.
2. Google Cloud console → APIs & Services → Credentials: use the OAuth client n8n already uses (or create a Web client). Put its ID/secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
3. Get a refresh token for scope `https://www.googleapis.com/auth/datastore` (e.g. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) with "Use your own OAuth credentials", add `https://developers.google.com/oauthplayground` as an authorised redirect URI on the client). Put it in `GOOGLE_REFRESH_TOKEN`.
4. The consenting Google account needs the `Cloud Datastore User` IAM role on project `hokkien`.
5. `npm run dev` → `GET /api/emails` returns the `emails` collection mapped to the dashboard shape; `POST /api/emails/{id}/review` saves a manual override (`review`, `status`, `human_review_required`).

---
## Moderator actions

The app automatically uses the preset moderator `DanielHo`; there is no login screen. Everyone using this temporary setup is attributed to this identity.

- The first successful review or mark-read action creates `moderators/DanielHo` if missing. No manual Firestore setup is needed beyond the existing Google credentials above.
- `POST /api/emails/{id}/review` stores verified fields, `review.reviewed_by`, and `review.reviewed_at`.
- `POST /api/emails/{id}/read` stores `read_status.is_read`, `marked_by`, and `marked_at`, independently of comparison status. Repeated mark-read calls do not add duplicate events.
- Each action creates an `emails/{id}/activity/{eventId}` document with `moderator_id`, `action`, `occurred_at`, and before/after values. Review events include changed field values. History is available in Firestore; the dashboard displays the latest reviewer/read metadata.
- Email changes and activity entries use one atomic Firestore commit with database timestamps. Concurrent database changes reject the save; refresh and retry. The UI displays timestamps in Malaysia time.
- Existing records without attribution remain unknown; they are not retroactively assigned to DanielHo. n8n can still update comparison status during re-ingestion; moderator metadata and activity history remain separate.

Verification: `npx tsc --noEmit`, `npm run build`, and `node tests/moderator.cjs` (Node 24, mocked Firestore, no database writes).

## Ingestion pipeline (n8n)

Three workflows in `n8n/`. Import all three; in `ingestion-drain` re-select the `ingestion` workflow in the **Ingest Email** node (the export does not carry the workflow id). Activate `ingestion-trigger` and `ingestion-drain`.

```
Drive /inbox ◀── every 1 min, files.list pageSize=20, createdTime >= cursor ── ingestion-trigger
                                                                                     │
                                          Firestore ingestion_queue (status: queued) ◀┘
                                                          │
                              ingestion-drain ◀── every 1 min, next 20 rows ──┘
                                     │  gate: another drain running? stop. stale processing rows? re-queue.
                                     │  loop ×≤20: claim (status: processing) → ingestion sub-workflow → status: done | failed
                                     ▼
                              Firestore emails/{email_id}
```

| Workflow | Role | Per-execution memory |
| --- | --- | --- |
| `ingestion-trigger` | Schedule, not a Drive Trigger. Cursor = newest `created_time` in `ingestion_queue`; asks Drive for the 20 oldest files at/after it (`fields=files(id,name,createdTime)`), writes one small queue doc each. Never calls the sub-workflow. | ≤20 × 3 fields |
| `ingestion-drain` | Schedule every minute. Exits immediately if another drain is still running (a `processing` row claimed < 15 min ago). Otherwise re-queues rows a crashed drain left behind, reads ≤20 `queued` rows and loops them one at a time: claim → `ingestion` → mark `done`/`failed`. | ≤20 sub-results, one email in flight |
| `ingestion` | Unchanged. Expects `{ id, name }` of one Drive file. | one email |

Why two changes:
- The native Google Drive Trigger has no limit — one poll returns every new file with `fields=*`, so a 250-file drop lands in one execution. Replaced with a capped `files.list` call; 250 files enqueue over ~13 minutes.
- Previously the trigger also called `ingestion` for every file inside that same execution, holding 250 sub-workflow results in one heap. Now every drain run is its own execution capped at 20.

Throughput: enqueue 20 files/min; drain is serial (one email at a time, one drain at a time), so it runs at whatever `ingestion` + Ollama manage. Raise `pageSize` in **List 20 New Files** and `limit` in **Next 20 Queued** together if needed; the drain cap is the one bounded by heap.

Self-hosted n8n memory (Docker env): `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` keeps PDF/XLSX binaries out of the heap; `NODE_OPTIONS=--max-old-space-size=4096` raises the Node heap (give the container ≥ 5 GB). A drain that dies mid-email shows `ingestion` crashed at the LLM node with "n8n may have run out of memory".

### Queue rows — `ingestion_queue/{createdTime}_{driveFileId}`

| Field | Meaning |
| --- | --- |
| `file_id`, `name`, `created_time` | From Drive |
| `status` | `queued` → `processing` → `done` \| `failed` |
| `queued_at`, `claimed_at`, `finished_at` | Timestamps |
| `last_error` | Set on `failed` |

No composite index needed: the drain queries `status == queued` ordered by document name (starts with Drive `createdTime`, so rows process in upload order); the trigger queries `created_time desc limit 1` for its cursor.

### Re-uploaded / revised emails (same `email_id`, new file)

Dedupe key is the **Drive file id, not `email_id`**. Re-uploading `email_004.json` creates a new Drive id, so it gets its own queue row and is never skipped. Because rows sort by `createdTime`, the revision runs after the original; `ingestion` PATCHes `emails/email_004` with an `updateMask`, so the revision's fields overwrite the original's and `source_email_file_id` points at the newest Drive file.

- Enqueue is create-only (`currentDocument.exists=false`) with "Never Error" on. The Drive query is `createdTime >= cursor`, so the boundary file is re-listed once per run → Firestore answers `400 FAILED_PRECONDITION` → **Check Enqueue** skips it. Any other status fails the execution visibly. Stalls only if 20+ files share the identical `createdTime` millisecond; raise `pageSize` if that ever happens.
- Only one drain runs at a time (**Gate**). Claim is still atomic (`currentDocument.updateTime` precondition) as a second line of defence: a loser gets `400 FAILED_PRECONDITION` and skips to the next row.
- A drain that crashes leaves its current row in `processing`. Once that row is 15 min old the next drain re-queues it (`last_error: requeued: previous drain crashed`). If one email legitimately takes longer than 15 min, raise `STALE_MS` in **Gate**.
- `failed` rows stay put for inspection. To retry, set `status` back to `queued` in Firestore.
- An email with no attachments ends `ingestion` with 0 items; **Ingest Email** has *Always Output Data* on so **Mark Done** still runs. Without it the loop stalls on that row.
- "Stop" on a running drain only marks it cancelled in the DB — an `Execute Workflow` loop already in memory keeps spawning `ingestion` children until it runs out of items. If you see `ingestion` executions whose parent is a cancelled drain, restart the n8n container; nothing else kills them.
- Not covered: Drive "Upload new version" onto an existing file keeps the same id and fires `fileUpdated`, not `fileCreated`. Add a second trigger node for `fileUpdated` with doc id `{modifiedTime}_{fileId}` if that path is used.

---
## Dataset Google Drive file structure
```
/bundle
├─ /attachments - ( and SL information, may be in .txt .xlxs.pdf .docx)
└─ /inbox - (email in .json format)
```
---
## Database Fields layout:

|Email No.| Shipper | Consignee| Notify Party| Port of Loading| Port of Discharge| Container Count| Gross Weight (KG)|
|---|---|---|---|---|---|---|---|

---
- Might consider logging every email into database from classification in dashboard
- Change all attachment and email into PDF for easy viewing

1. Backend to fetch from Firestore and compare
    - Discrepency: Flag field proem - Toggle Human Review Status
    Else: Toggle Cleared Status
2. Frontend ( Dashboard Saas Style )
    - Human Review Section
	  - Allow full manual input to change field and save to database
	- Email + Attachment Viewing - in PDF standardized form
	
---
## Tech stack:
| Layer                 | Technology             | Responsibility                   |
| --------------------- | ---------------------- | -------------------------------- |
| Frontend              | [TBC - lightweight]    | SaaS dashboard                   |
| Styling               | [TBC]                  | UI                               |
| Workflow and Backend  | n8n Cloud              | Ingestion/orchestration          |
| AI                    | [Cloud LLM TBC]        | Classification + extraction      |
| Database              | Firebase Google        | Source of truth                  |
| File storage          | Google Drive           | Dataset/source files             |
| Comparison            | Python in n8n cloud    | Deterministic 7-field comparison |


<div align="center">

<img src="public/shiplogo.svg" alt="Shiptuationship logo" width="110" />

# Shiptuationship

### SI & BL Verification Desk

**From a noisy shipping inbox to a clear discrepancy report.**
Shiptuationship reads every incoming email, works out what it is, compares the Shipping Instruction (SI) against the draft Bill of Lading (BL) on seven fields, and hands anything uncertain to a human reviewer, with the evidence attached.

*Built for the **Averis Hackathon 2026**. Problem statement: [`Averis_Hackathon_2026_Problem_Statement.pdf`](Averis_Hackathon_2026_Problem_Statement.pdf)*

</div>

---

## Table of contents

1. [The problem](#1-the-problem)
2. [Our solution at a glance](#2-our-solution-at-a-glance)
3. [Technical architecture](#3-technical-architecture)
4. [Setup instructions](#4-setup-instructions)
5. [Implementation details](#5-implementation-details)
6. [Challenges faced](#6-challenges-faced)
7. [Known limitations](#7-known-limitations)
8. [Future roadmap](#8-future-roadmap)
9. [Project structure and scripts](#9-project-structure-and-scripts)

---

## 1. The problem

> Summarised from [`Averis_Hackathon_2026_Problem_Statement.pdf`](Averis_Hackathon_2026_Problem_Statement.pdf) ("Shipping document verification: from email inbox to discrepancy report").

### 1.1 Context

A shipping operations team receives very different messages in **one shared inbox**: requests to check documents, requests to prepare new shipping instructions, invoice questions and operational updates, with spam arriving alongside them.

For a **document-checking request**, the team compares a **Shipping Instruction (SI)**, which holds the intended shipment details, against a **draft Bill of Lading (BL)**. The SI is the reference. The goal is to **catch incorrect details before the draft is finalised**.

### 1.2 The three problems

| # | Problem | Why it hurts |
|---|---------|--------------|
| 1 | **Finding the right emails takes time.** Staff must read each message and decide what it needs. | A document request that is overlooked never reaches the checking step. |
| 2 | **Manual comparison is repetitive and error-prone.** Names, ports, quantities and weights must be checked across two documents. | A missed discrepancy means corrections, delays and extra work. |
| 3 | **The same information looks different.** One document says "Port of Loading", the other says "Load Port". | The system has to recognise that both labels mean the same field. |

### 1.3 What the system must be able to do

| Capability | What it means |
|------------|---------------|
| **Classify** | Tell messages apart: document-comparison requests, new SI requests, invoice queries, general messages and spam. Only document-comparison requests continue to the checking step. |
| **Extract data** | For comparison requests, read the SI and BL attachments and identify the matching shipment fields. |
| **Compare** | Check the values and surface every mismatched field, showing the **SI and BL values side by side**. |
| **Ask for help** | When the system cannot finish on its own, **escalate to a person (human in the loop)** with the relevant context, instead of guessing or failing silently. |

### 1.4 What is compared: the seven fields

| # | Field | Notes |
|---|-------|-------|
| 1 | Shipper | |
| 2 | Consignee | |
| 3 | Notify Party | |
| 4 | Port of Loading (POL) | |
| 5 | Port of Discharge (POD) | |
| 6 | Container count | integer |
| 7 | Gross weight | in **kilograms** |

The report must make it easy to see **which email was checked, whether a mismatch was found, and exactly what needs attention**. If all seven fields match, report **"No mismatch detected."**

> **Worked example from the brief:** the SI lists 3 containers and 22,000 kg, the BL lists 4 containers and 22,000 kg. If everything else agrees, flag **only** the container count and show **SI: 3 / BL: 4**.

### 1.5 The advanced stage (where teams can stand out)

| Advanced challenge | What changes |
|--------------------|--------------|
| **PDF and Word attachments** | Extract information from tables and different page layouts. |
| **Scanned documents** | Image-only PDFs. Use OCR, a vision-capable LLM, or both. |
| **Messier inputs** | Varied field labels, formatting differences, **misleading email subjects**, missing attachments. Tell a *real* discrepancy from a *reading or formatting* issue. |
| **Reliability and human review** | When a document is unreadable, a value is missing, or the result is uncertain, send it for review **with source evidence and the reason**. A person confirms or corrects it and the report updates. Processing failures must be **visible** and **retryable**. |

**Accuracy** means finding the right requests and the right discrepancies **without false alarms**. The data comes as JSON inbox records plus SI/BL attachments, and the organisers provide a local self-evaluation endpoint (`POST /submit`) that scores a submission without revealing the answer key.

### 1.6 How Shiptuationship maps to the brief

| Requirement | Our answer | Where |
|-------------|------------|-------|
| Classify into 5 kinds of message | LLM classifier with a strict prompt and a validator. The categories are `Document-Comparison Request`, `New SI Request`, `Invoice Queries`, `General Messages` and `Other` (ambiguous or spam). | n8n `ingestion` → *Main Classifier* |
| Extract the 7 fields | LLM extractor with a full alias table (`POL`, `LOAD PORT`, `NTFY`, `G.W.` and so on), unit conversion (lbs, MT → kg) and container summing. | n8n `ingestion` → *Field Normalise* |
| PDF, Word, Excel, text attachments | Dedicated parsers per file type, including DOCX unzip and Excel row merging. | n8n `ingestion` |
| Compare and show SI vs BL side by side | **Deterministic** (non-LLM) comparison, then a side-by-side review screen. | n8n *Compare Fields* + web app *ReviewModal* |
| Real discrepancy vs formatting difference | Normalisation and a formatting/real/severity classification. Formatting-only differences are recorded but not flagged. | n8n *Compare Fields* |
| Human in the loop | Flagged and incomplete cases are queued for a moderator who can edit either document's values, save, and re-run the comparison. | Web app *Emails* page |
| Visible failures and retries | Per-email queue with `queued → processing → done / failed`, `last_error` recorded, one-line manual retry. | n8n `ingestion-drain` |
| "Which email, mismatch or not, what needs attention" | Dashboard, filterable email table, per-email discrepancy banner, audit logs. | Web app |

> **Not attempted in this version:** scanned or image-only PDFs (OCR / vision). See [Known limitations](#7-known-limitations) and the [roadmap](#8-future-roadmap).

---

## 2. Our solution at a glance

Shiptuationship has **two halves** that share one database:

- **An automated back end (n8n + a local LLM)** that watches a Google Drive inbox, classifies every email, extracts the seven fields from the SI and BL attachments, runs the comparison and writes the result to **Firestore**.
- **A web app (Next.js)**, the *SI & BL Verification Desk*, where an operator sees everything at a glance, reviews flagged emails side by side, corrects values, marks emails as read, and audits what both the automation and the humans did.

### Feature tour

| Area | What you get |
|------|--------------|
| **Dashboard** | Live counters (unread and read with a progress bar and per-category breakdown), **Total Comparison Requests** with one-click **Emails Cleared** and **Pending Validation** buttons, an interactive **Emails by Category** donut (click a slice to highlight it, click again to open those emails), **Top 3** shippers, consignees, notify parties and senders, and two **world heat maps** (outbound Port of Loading, inbound Port of Discharge). |
| **Emails** | A Gmail-style inbox: unread rows are bold with a dot, filter tabs (All / Comparisons / SI Requests / Invoices / General / Other, plus **Needs Review** and **Validated**), search, date-range picker, sortable columns. Every filter has its own URL (`/emails?view=needs-review`). Cards on phones and tablets. |
| **Review screen** | For comparison emails: manifest fields form, **SI and Draft BL side by side** with the differing fields in red (only on the document being edited), an *Editing: Carrier Draft BL / Customer SI* switch, save with an automatic re-comparison, "Mark as read", and a **Read Email** arrow to flip between the comparison and the original email. |
| **User Log** | A Discord-style audit feed of every **moderator action** (reviews saved, emails marked read), with before/after field changes you can expand. |
| **System Log** | The same feed for everything the **n8n automation** did (classified, auto-compared). |
| **Settings** | Five colour schemes: Light, Dark (true black), Ocean, Forest and Sunset. |
| **Everywhere** | Fully responsive (drawer menu on phones, cards instead of tables), animated but respects *reduced motion*, refreshes from Firestore every 30 s. |

---

## 3. Technical architecture

### 3.1 Big picture

```mermaid
flowchart LR
    subgraph SRC["Sources"]
        DRIVE[("Google Drive<br/>/inbox (email JSON)<br/>/attachments (SI, BL files)")]
    end

    subgraph N8N["n8n - automation"]
        TRIG["ingestion-trigger<br/>every 1 min"]
        DRAIN["ingestion-drain<br/>every 1 min"]
        ING["ingestion<br/>classify, extract, compare"]
        LLM(["Ollama<br/>qwen3.5:9b"])
    end

    subgraph DB["Firestore (project: hokkien)"]
        Q[("ingestion_queue")]
        E[("emails/{email_id}")]
        ACT[("emails/{id}/activity")]
        MOD[("moderators")]
    end

    subgraph WEB["Next.js web app"]
        API["Route handlers<br/>/api/emails · /api/audit"]
        UI["Dashboard · Emails · Review<br/>User Log · System Log · Settings"]
    end

    DRIVE -->|files.list, capped at 20| TRIG
    TRIG -->|enqueue| Q
    Q -->|claim 1 at a time| DRAIN
    DRAIN --> ING
    ING <-->|prompts| LLM
    ING -->|downloads| DRIVE
    ING -->|write classification, si, bl, comparison| E
    API <-->|REST + OAuth2 refresh token| E
    API --> ACT
    API --> MOD
    UI <-->|fetch, 30 s poll| API
```

### 3.2 End-to-end flow of one email

1. **A file lands in the Drive `/inbox` folder** (an email in JSON form).
2. **`ingestion-trigger`** (every minute) asks Drive for the 20 oldest files at or after its cursor and writes one small **queue row** per file to Firestore (`status: queued`).
3. **`ingestion-drain`** (every minute) claims queued rows **one at a time** (`processing`) and runs the `ingestion` sub-workflow for each.
4. **`ingestion`** does the real work:
   1. Parses the email JSON and **classifies** it (LLM, strict JSON, validated).
   2. Logs the email to Firestore (`emails/{email_id}`) with its classification.
   3. For **Document-Comparison Requests**: finds each attachment in Drive, parses it by type (TXT / PDF / XLSX / DOCX), asks the LLM to **extract the 7 fields** and to say whether it is an **SI or a BL**, then stores the result under `si` and `bl`.
   4. Runs a **deterministic comparison** in code and writes `comparison`, `status` (`cleared` / `flagged` / `incomplete`) and `human_review_required`.
5. The queue row is marked `done` or `failed` (with `last_error`).
6. **The web app** reads `emails` through its own API routes. An operator opens a flagged email, sees the SI and BL side by side, corrects a value if the extraction was wrong, and saves.
7. The save is written as a **moderator override** (never touching what n8n wrote), the comparison is re-run, and an **activity record** is added, which feeds the **User Log**. The n8n side feeds the **System Log**.

### 3.3 Technology stack

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Front end | **Next.js 16** (App Router), **React 19**, **TypeScript** | Dashboard, inbox, review UI, audit logs |
| Styling | Hand-written **CSS** (design tokens and per-theme variables). No CSS framework | Responsive layout, five colour schemes |
| Charts | Custom **SVG** donut and bars, **Google Charts GeoChart** (loaded from `gstatic`, no API key) | Category chart, top-3 bars, heat maps |
| Server side of the web app | Next.js **route handlers** (Node runtime) | Talk to Firestore. Credentials never reach the browser |
| Database | **Google Cloud Firestore** via its **REST API** | Single source of truth |
| Auth to Firestore | **Google OAuth2 refresh token** (same model as the n8n credential) | No service account, no Firebase SDK |
| Automation | **n8n** (3 exported workflows in [`n8n/`](n8n)) | Ingestion, orchestration, comparison |
| AI | **Ollama** running **`qwen3.5:9b`** | Classification and field extraction |
| File storage | **Google Drive** | Dataset: `/inbox` emails and `/attachments` SI/BL files |
| Comparison | **JavaScript (n8n Code node)**, deterministic | 7-field comparison with normalisation |

### 3.4 Data model (Firestore)

<details>
<summary><b><code>emails/{email_id}</code></b>: one document per email (click to expand)</summary>

| Field | Written by | Meaning |
|-------|-----------|---------|
| `email_id`, `subject`, `body`, `from`, `to`, `received_at` | n8n | Original email record. (`received_at` is empty in the sample data, so the UI uses `classified_at`.) |
| `attachments[]`, `attachment_count` | n8n | Attachment file names |
| `classification` | n8n | One of the 5 categories |
| `classified_at` | n8n | When the automation processed it. This is the date shown in the app |
| `classification_error`, `last_ingestion_error`, `missing_attachments_warning` | n8n | Why something needs human attention |
| `si`, `bl` | n8n | Extracted fields: `shipper`, `consignee`, `notify_party`, `port_of_loading`, `port_of_discharge`, `container_count`, `gross_weight_kg` |
| `si_source`, `bl_source` | n8n | The source attachment: `filename` and `drive_file_id` |
| `comparison` | n8n | `status`, `performed_at`, `discrepancies[]`, `formatting_notes[]`, and per-field `{ match, bl, si, discrepancy_type, severity, *_normalized }` |
| `status` | n8n, web app | `pending` / `needs_review` / `incomplete` / `flagged` / `cleared` |
| `human_review_required` | n8n, web app | `true` when a person must look at it |
| `review` | **web app** | `reviewed_by`, `reviewed_at`, `edited_side`, and the override maps `fields` (BL) and `si_fields` (SI) |
| `read_status` | **web app** | `is_read`, `marked_by`, `marked_at` |

</details>

<details>
<summary><b>Other collections</b> (click to expand)</summary>

| Path | Purpose |
|------|---------|
| `emails/{id}/activity/{eventId}` | Immutable audit record per moderator action: `moderator_id`, `action` (`review_saved` / `marked_read`), `edited_side`, `changes` (per-field before and after), `before`, `after`, `occurred_at` (server time). Feeds the **User Log** |
| `moderators/{id}` | Moderator profile (auto-created on first action) |
| `ingestion_queue/{createdTime}_{driveFileId}` | One row per Drive file: `file_id`, `name`, `created_time`, `status` (`queued → processing → done / failed`), `queued_at`, `claimed_at`, `finished_at`, `last_error` |

</details>

> **Design rule:** the web app **never edits** the `si` / `bl` maps that n8n writes. Human corrections live under `review.*`, so the original extraction is always preserved and a re-ingestion can never erase a human decision.

### 3.5 Web API (Next.js route handlers)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/emails` | `GET` | List emails, mapped to the shape the UI uses |
| `/api/emails/{id}/review` | `POST` | Body `{ side: "si" \| "bl", fields }`: save a verified override for one side, re-run the comparison, log the activity |
| `/api/emails/{id}/read` | `POST` | Mark an email as read (idempotent) |
| `/api/audit?source=user\|system` | `GET` | User Log (moderator activity) or System Log (n8n activity) |

Errors return `502` (Firestore unreachable), `404` (unknown email), `409` (conflict or precondition failed).

---

## 4. Setup instructions

### 4.1 Prerequisites

| Need | Version / note |
|------|----------------|
| **Node.js** | 20.9 or newer (the team develops on Node 24) |
| **npm** | Comes with Node |
| **Google Cloud project with Firestore** | Project id defaults to `hokkien`. Override with `FIRESTORE_PROJECT_ID` |
| **A Google OAuth client** | The same client n8n's Firestore credential uses is fine |
| **n8n** | For the ingestion pipeline (only needed if you want to *produce* data, not just view it) |
| **Ollama with `qwen3.5:9b`** | `ollama pull qwen3.5:9b`. Reachable from n8n |
| **Google Drive folder** | Structure below |

Dataset layout in Google Drive:

```
/bundle
├─ /inbox         email records, one .json per email
└─ /attachments   SI and BL files (.txt .xlsx .pdf .docx)
```

### 4.2 Run the web app

```bash
# 1. Install
npm install

# 2. Create your local environment file (never committed)
cp .env.example .env.local        # Windows PowerShell: Copy-Item .env.example .env.local

# 3. Fill in .env.local (see 4.3), then start the dev server
npm run dev                        # http://localhost:3000
```

Production build:

```bash
npm run build && npm run start
```

Type-check only: `npx tsc --noEmit`

### 4.3 Environment variables (`.env.local`)

| Variable | Required | Description |
|----------|:--------:|-------------|
| `GOOGLE_CLIENT_ID` | yes | OAuth client id |
| `GOOGLE_CLIENT_SECRET` | yes | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | yes | Refresh token granted with scope `https://www.googleapis.com/auth/datastore` |
| `FIRESTORE_PROJECT_ID` | no | Defaults to `hokkien` |
| `NEXT_PUBLIC_SITE_URL` | no | Public address of the deployed site. Used for link previews (Open Graph). Defaults to `http://localhost:3000` |

> **Never commit `.env.local`.** It is already listed in `.gitignore`. Keep secrets out of screenshots, issues and commits.

### 4.4 Getting the Google refresh token (one time)

1. In the Google Cloud console go to **APIs & Services → Credentials** and use the OAuth client n8n already uses (or create a *Web* client).
2. Add `https://developers.google.com/oauthplayground` as an **authorised redirect URI** on that client.
3. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/), tick **Use your own OAuth credentials**, paste your client id and secret, authorise the scope `https://www.googleapis.com/auth/datastore`, then **exchange the code for tokens** and copy the **refresh token**.
4. The Google account you consent with needs the **Cloud Datastore User** IAM role on the Firestore project.
5. Paste the three values into `.env.local`.

**Check it works:** open `http://localhost:3000/api/emails`. You should get a JSON array (empty until n8n has ingested something).

### 4.5 Set up the ingestion pipeline (n8n)

1. **Import** all three files from [`n8n/`](n8n): `ingestion.json`, `ingestion-trigger.json`, `ingestion-drain.json`.
2. **Create credentials** in n8n:

   | Credential | Used by |
   |------------|---------|
   | Google Drive OAuth2 | Trigger (list files), `ingestion` (download email and attachments) |
   | Google Firebase Cloud Firestore OAuth2 | All three workflows |
   | Ollama API | `ingestion` (both LLM nodes) |

3. In `ingestion-drain`, open the **Ingest Email** node and **re-select the `ingestion` workflow** (the export does not carry the workflow id).
4. Point the Drive nodes at **your** `/inbox` and `/attachments` folders.
5. **Activate** `ingestion-trigger` and `ingestion-drain`. (`ingestion` is a sub-workflow and stays inactive.)
6. Drop email JSON files into the Drive `/inbox` folder. Within a minute or two they appear in Firestore, then in the app.

**Self-hosted n8n (Docker) tuning**, recommended for large PDF/XLSX files:

```
N8N_DEFAULT_BINARY_DATA_MODE=filesystem      # keep file binaries out of the Node heap
NODE_OPTIONS=--max-old-space-size=4096       # bigger heap (give the container at least 5 GB)
```

### 4.6 Troubleshooting

| Symptom | Likely cause and fix |
|---------|----------------------|
| `/api/emails` returns `502` with *Missing GOOGLE_CLIENT_ID…* | `.env.local` is missing or incomplete. Restart `npm run dev` after editing it |
| `OAuth token refresh failed` | Wrong client id/secret, or the refresh token was issued for another client |
| `Firestore 403` | The Google account lacks **Cloud Datastore User** on the project |
| Dashboard shows zeros | Firestore is empty. Run the n8n pipeline (or check the queue for `failed` rows) |
| Saving a review says *record changed while saving* (`409`) | Someone (or n8n) changed the email at the same moment. Refresh and save again |
| Maps do not draw | The browser could not reach `gstatic.com` (Google Charts). Check your connection |

<details>
<summary><b>Operational notes for the ingestion pipeline</b> (click to expand)</summary>

- Enqueue is **create-only** (`currentDocument.exists=false`). The Drive query is `createdTime >= cursor`, so the boundary file is listed once more each run, Firestore answers `400 FAILED_PRECONDITION`, and **Check Enqueue** skips it. Any other status fails the execution visibly.
- Only **one drain runs at a time** (the *Gate* node). Claiming a row is atomic (`currentDocument.updateTime` precondition) as a second line of defence.
- A drain that **crashes** leaves its row in `processing`. After 15 minutes the next drain re-queues it (`last_error: requeued: previous drain crashed`). Raise `STALE_MS` in *Gate* if one email can legitimately take longer.
- `failed` rows stay in place for inspection. **To retry, set `status` back to `queued`** in Firestore.
- An email with no attachments finishes `ingestion` with zero items. *Ingest Email* has **Always Output Data** on so *Mark Done* still runs, otherwise the loop would stall on that row.
- "Stop" on a running drain only marks it cancelled. Child `ingestion` executions already in memory keep going. If you see orphans, restart the n8n container.
- **Re-uploaded or revised emails:** the dedupe key is the **Drive file id, not `email_id`**. A revised `email_004.json` gets its own queue row, runs after the original (rows sort by `createdTime`) and overwrites the same `emails/email_004` document through an `updateMask`.
- Not covered: Drive's *Upload new version* keeps the same file id and fires `fileUpdated`, not `fileCreated`.

</details>

---

## 5. Implementation details

### 5.1 Ingestion workflows (n8n)

Three workflows are exported in [`n8n/`](n8n):

| Workflow | Role | Memory per execution |
|----------|------|----------------------|
| **`ingestion-trigger`** | Schedule (1 min). Cursor = newest `created_time` in `ingestion_queue`. Asks Drive for the **20 oldest** files at or after it and writes one small queue document per file. Never runs the heavy workflow itself | ≤ 20 × 3 fields |
| **`ingestion-drain`** | Schedule (1 min). Exits if another drain is still running, re-queues rows stuck in `processing`, reads ≤ 20 `queued` rows and loops them **one at a time**: claim → `ingestion` → mark `done` / `failed` | ≤ 20 sub-results, one email in flight |
| **`ingestion`** | The actual pipeline for one email (34 nodes) | one email |

**Why the queue?** The native Google Drive Trigger has no limit: a 250-file drop would land in a single execution and hold 250 sub-workflow results in one heap. A capped `files.list` plus a Firestore queue means every run is bounded (20 files), retryable and visible.

### 5.2 Classification

A local LLM (`qwen3.5:9b`, "no-think" mode) returns **exactly one** JSON classification. The prompt is hardened for the "messier inputs" of the brief:

- The email is treated as **untrusted data**. Instructions inside it are never followed (prompt-injection guard).
- **Classify by the body, not the subject.** Subjects can be forwarded, re-used or misleading. The subject is only a tiebreaker.
- A document-comparison request stays a comparison request **even if an attachment is missing**, so it still reaches a human instead of vanishing.
- If a message fits several categories the priority is **comparison > new SI > invoice > general**. Anything ambiguous, unrelated or spam is **`Other`**.

A code node then **validates** the answer against the five allowed values. If the model fails or returns something invalid the email is stored as `Other` with `classification_error` and `status: needs_review`, so nothing is lost silently.

### 5.3 Attachment handling and field extraction

For each attachment of a comparison request:

1. **Find** it in the Drive `/attachments` folder. Zero matches or more than one match is a recorded error (`Attachment not found` / `ambiguous`), not a guess.
2. **Parse by type:** `.txt` (text), `.pdf` (text extraction), `.xlsx` (rows are combined into text), `.docx` (unzipped and read). Unsupported types are logged as an attachment error.
3. **Extract** with the LLM into strict JSON. The prompt covers:
   - **Document type detection** (`BL`, `SI` or `UNKNOWN`) from the document's own content. The filename is only a hint, so a mislabelled file is not assumed to be a BL.
   - **Label aliases** for every field (for example `SHPR`, `EXPORTER`; `CNEE`, `TO ORDER OF`; `NTFY`; `POL`, `LOAD PORT`; `POD`, `DEST`; `CNTR`; `G.W.`, `WGT`), which addresses the "Port of Loading vs Load Port" problem.
   - **Names only:** stop before street addresses, phone numbers and tax ids. "To Order" is a label, not a name.
   - **Numbers made comparable:** container counts are summed (`2 x 20', 1 x 40'` → 3). Weights are converted to kg (lbs × 0.453592, MT × 1000) with thousands separators stripped.
   - **Never invent:** a field that is genuinely absent is `null`.
4. **Validate before storing.** A code node checks the LLM's JSON: the document type must be `BL` or `SI`, text fields must be strings or `null`, the container count must be a whole number, the weight a non-negative number. An extraction that contains none of the seven fields is **rejected** rather than allowed to overwrite stored data.
5. Store the result under `si` / `bl` with the source file recorded (`filename`, `drive_file_id`). This version keeps **one SI and one BL per email**.

### 5.3.1 Comparison (deterministic, no LLM)

Comparing is deliberately **plain code**, so the same input always gives the same answer:

| Rule | Behaviour |
|------|-----------|
| Both values missing | Counts as a match |
| One value missing | **Discrepancy**, severity `major` |
| Container count | Must be **exactly equal** |
| Gross weight | Equal within **0.5 %** |
| Text fields | If equal ignoring case: match. Otherwise both are **normalised** (upper-case, punctuation and dots removed, bracketed port codes like `(MYPKG)` removed, trailing country dropped for ports, `TO ORDER` prefixes unified, extra spaces collapsed) |
| After normalising | **Equal → formatting difference:** recorded in `formatting_notes`, **not flagged** (avoids false alarms). One string inside the other → `real` / `minor`. Otherwise → `real` / `major` |

Result: `comparison.status` is **`flagged`** if any real discrepancy exists, otherwise **`cleared`**, and `human_review_required` is set to match. If the SI or BL side could not be extracted at all, the status is **`incomplete`** and the case is routed to a human.

### 5.4 Human in the loop (the web app)

The web app is where "ask for help" happens.

- **Where the humans are pulled in:** the pipeline marks cases `flagged` (real discrepancy), `incomplete` (missing SI or BL) or `needs_review` (classification error), each with `human_review_required` where a person must act. `flagged` comparison emails appear in the **Emails** page under **Needs Review** (and on the dashboard's red **Pending Validation** button). Clean ones appear under **Validated**. The other two states are stored in Firestore but shown in the inbox as "Received" for now (see [limitations](#7-known-limitations)).
- **Review screen:** the left pane holds the seven editable fields for **one document at a time** (switch *Carrier Draft BL* / *Customer SI*). The right pane shows the **SI and Draft BL as paper documents side by side**. Fields that differ are shown in **red text on the document being edited**, and the banner lists exactly those fields with both values.
- **Save flow (`POST /api/emails/{id}/review`):**
  1. Load the email and refuse if there is no SI/BL pair to compare.
  2. Compare the edited side against the other side with the same seven-field rule. The result sets `status` to `flagged` or `cleared` and `human_review_required` accordingly.
  3. Write **`review.fields`** (BL) or **`review.si_fields`** (SI) with a **nested `updateMask`**, so saving one side keeps the other side's override.
  4. Add an **`activity`** document (who, what, before and after, server timestamp) **in the same atomic commit**, guarded by the document's `updateTime` so concurrent edits are rejected instead of overwritten.
- **Read state:** "Mark as read" is stored separately from the comparison status (`read_status`), is idempotent, and drives the Gmail-style bold and dot in the inbox and the dashboard's read/unread progress.
- **Identity:** the app runs as a **preset moderator (`DanielHo`)**. There is no login screen in this version, and everyone is attributed to that identity. Existing records without attribution stay "unknown" and are never retro-assigned.

### 5.5 Audit logs

Two separate pages, both read-only and built only from Firestore:

| Page | Source | Shows |
|------|--------|-------|
| **User Log** (`/audit/user`) | `emails/*/activity` (a collection-group query) plus `moderators` for display names | Reviews saved (with expandable per-field before → after diffs) and marked-read events |
| **System Log** (`/audit/system`) | `classified_at` and `comparison.performed_at` on each email | What the n8n automation did: classified as *X*, ran the SI/BL comparison with its result |

Both have Discord-style dropdown filters (**Action** and **User**) whose choice lives in the URL (`?action=review_saved&user=Daniel%20Ho`), day dividers (Today / Yesterday / date), and refresh every 30 s.

### 5.6 Front-end engineering

| Topic | What we did |
|-------|-------------|
| **State in the URL** | Every filter tab, log filter and status view is a real link, so views are shareable and the back button works |
| **Shared data provider** | One fetch and 30 s poll (`ShipmentsProvider`) feeds Dashboard and Emails, so switching pages is instant |
| **Server-only secrets** | `lib/firestore.ts` (OAuth and REST) is imported only by route handlers. The browser never sees a credential |
| **Time handling** | The app stores UTC ISO timestamps and formats them in the viewer's own time zone (`dd/mm/yy` and 24-hour time) |
| **Responsive design** | ≤ 900 px: drawer menu and top bar. ≤ 1279 px: table becomes cards. Tuned for phones, iPads and landscape, with safe-area insets and `dvh` units |
| **Theming** | CSS variables per scheme (`data-theme` on `<html>`). The saved choice is applied *before first paint* by a tiny inline script, so there is no flash. Maps redraw with the scheme's colours |
| **Performance** | Only the first ~15 table rows animate, the rest render instantly. IntersectionObserver gates heavy animations until visible. Count-up numbers and chart sweeps respect `prefers-reduced-motion` |
| **Accessibility** | Keyboard-operable slices, rows and menus, ARIA roles on the progress bar and radio groups, focus rings, and reduced-motion support |
| **Branding and sharing** | Custom vector logo (traced from the source PNG), favicon, and Open Graph and Twitter card metadata with a generated 1200×630 preview image |

### 5.7 Security and safety

- **Untrusted input:** emails and attachments are treated as data in every prompt, and the classifier and extractor are told never to obey instructions found inside them.
- **No silent guessing:** every uncertain path (bad classification, missing attachment, unreadable file, incomplete SI/BL) ends in a **visible status** and a human queue, never a fabricated value.
- **Secrets:** OAuth credentials live only in `.env.local` (git-ignored) and n8n credentials. Nothing sensitive is in the repository.
- **Write safety:** moderator writes use Firestore preconditions and one atomic commit, so concurrent edits fail loudly instead of corrupting data.

---

## 6. Challenges faced

| Challenge | What happened | How we solved it |
|-----------|---------------|------------------|
| **The same field, written many ways** | `POL`, `Load Port`, `Port/Place of Loading`, `SHPR`, `To Order of`… | An explicit alias table in the extraction prompt, plus post-extraction **normalisation** so `PORT KLANG (MYPKG)` and `Port Klang` still match |
| **Real discrepancy or just formatting?** | Comparing raw strings raised false alarms on punctuation, casing, port codes and country suffixes | A deterministic comparison with normalisation, a 0.5 % weight tolerance, and a `formatting` vs `real` (`minor` / `major`) classification. Formatting-only differences are logged but not flagged |
| **Misleading subjects and prompt injection** | Subjects can be reused or forwarded. Bodies can contain instructions | Classify by **body**, treat all text as untrusted, validate the output against the five allowed categories |
| **Mixed attachment formats** | TXT, PDF, XLSX and DOCX each need different parsing | Type-based routing, DOCX unzip and text read, Excel row merging, and explicit errors for unsupported or missing or ambiguous files |
| **LLM variability** | Small local models can return malformed JSON | Strict "JSON only" prompts, a validator with a safe fallback (`Other` + `needs_review`), and **no LLM in the comparison** |
| **n8n running out of memory on large drops** | The Drive Trigger returns *every* new file, so a 250-file drop held 250 results in one heap and crashed the LLM step | Replaced it with a **capped queue** (20 files per run), a single-drain **gate**, stale-row recovery, filesystem binary mode and a bigger heap |
| **Never lose or double-process an email** | Retries, crashes and re-uploads | Create-only enqueue, atomic claims, stale re-queue after 15 min, and file-id (not `email_id`) as the dedupe key |
| **Human edits vs the automation's data** | A re-ingestion could overwrite a moderator's correction | Human corrections live in a separate `review.*` namespace with a nested field mask, so neither side clobbers the other |
| **Concurrent moderators** | Two people saving the same email | Firestore `updateTime` preconditions in one atomic commit. A conflict returns `409`, and the UI asks the user to refresh |
| **Dates were empty** | `received_at` is blank in the sample data, and server vs browser time zones disagreed | Use `classified_at`, carry ISO UTC to the browser and format there, so filters and labels always agree |
| **Firestore without an SDK** | We wanted one auth model shared with n8n and no service account | A small REST client with an OAuth refresh-token exchange and value encoders and decoders |
| **Touch scrolling on tablets and phones** | Lists were clipped or unscrollable on some iPads and landscape phones | Fixed flex sizing for card mode, then re-checked scrolling and real touch swipes across a range of phone, tablet and landscape sizes |
| **Polish across five themes** | Hard-coded colours everywhere | Introduced design tokens, moved every neutral onto variables, added per-scheme blocks and made the maps and the paper documents theme-aware |

---

## 7. Known limitations

Being honest about what this version does **not** do yet:

- **No OCR or vision.** Image-only or scanned PDFs are not read. PDF handling is text extraction, so those cases surface as errors or incomplete comparisons for a human.
- **Two comparison rules.** The pipeline compares **normalised** values (formatting differences are tolerated). The web app's live highlight and re-comparison on save uses **exact** text equality on the seven fields, so it can flag a formatting-only difference that n8n deliberately ignored.
- **`incomplete` and `needs_review` are not yet surfaced.** They are stored (with `human_review_required`) but the inbox shows them as "Received"; only `flagged` and `cleared` get their own view.
- **No login.** All moderator actions are attributed to one preset identity (`DanielHo`).
- **Polling, not push.** The UI refreshes every 30 s rather than streaming Firestore changes.
- **Limits of scale.** The email list reads one page (up to 300 documents) and the User Log one page (up to 500 activity records). The Drive trigger enqueues 20 files per minute and the drain is deliberately serial.
- **Retry is manual.** A `failed` queue row must be set back to `queued` in Firestore.
- **Local LLM quality.** Accuracy depends on `qwen3.5:9b`. There is no second-opinion model or confidence score yet.
- **No automated test suite** is included in this repository yet.

---

## 8. Future roadmap

### Near term (accuracy and reliability)
- [ ] **OCR and vision-LLM fallback** for scanned and image-only PDFs (the brief's *Scanned documents* challenge).
- [ ] **One shared comparison module** used by both n8n and the web app, so the highlight and the pipeline can never disagree.
- [ ] **Confidence scores and evidence:** store the source text snippet per extracted field and route *low-confidence* fields to review, not only mismatches.
- [ ] **One-click retry** for failed queue rows from the UI, with the failure reason shown.
- [ ] **Automated tests** for the comparison rules, the Firestore mapping and the API routes, plus a self-evaluation script that posts to the organisers' `/submit` endpoint.

### Medium term (product)
- [ ] **Real authentication and roles** (moderator, viewer, admin) so the audit logs show real people.
- [ ] **Realtime updates** with Firestore listeners or server-sent events instead of polling.
- [ ] **Notifications** (email or chat) when a comparison is flagged or a job fails.
- [ ] **Assignments and SLAs:** assign a review to a person, track time-to-resolution.
- [ ] **In-app PDF viewer** of the original attachments beside the extracted fields, and export a **discrepancy report** (PDF or CSV).
- [ ] **Pagination and search server-side** for large inboxes and long audit histories.

### Long term (platform)
- [ ] **Beyond SI vs BL:** invoices, packing lists, certificates of origin and other trade documents against the same field-mapping engine.
- [ ] **Learning from corrections:** feed moderator overrides back as few-shot examples or fine-tuning data, and learn per-customer label conventions.
- [ ] **Direct email integration** (IMAP or Gmail API) so the Drive drop-folder is no longer needed.
- [ ] **Analytics:** recurring discrepancy types per shipper, carrier or route, to fix problems at the source.
- [ ] **Multi-tenant deployment** with per-organisation data isolation and configurable comparison tolerances.

---

## 9. Project structure and scripts

```
.
├─ app/                        Next.js App Router
│  ├─ page.tsx                 Dashboard
│  ├─ emails/                  Inbox page
│  ├─ audit/user · audit/system    User Log and System Log
│  ├─ settings/                Colour schemes
│  ├─ api/
│  │  ├─ emails/               GET list
│  │  │  └─ [id]/review · read    POST moderator actions
│  │  └─ audit/                GET audit feed
│  ├─ layout.tsx               Metadata, Open Graph, theme bootstrap
│  ├─ opengraph-image.tsx · twitter-image.tsx   Link preview image
│  └─ globals.css              All styling and the colour schemes
├─ components/                 Dashboard, Emails, ReviewModal, AuditLog, charts, maps, shell…
├─ lib/
│  ├─ firestore.ts             Server-only Firestore REST client (OAuth, mapping, moderator actions)
│  ├─ shipments.ts             Types, the 7 fields, the deterministic UI comparison, date helpers
│  ├─ audit.ts · theme.ts      Log types and colour scheme registry
│  └─ ports.ts · top.ts · …    Port → country mapping, top-N, hooks
├─ n8n/                        ingestion.json · ingestion-trigger.json · ingestion-drain.json
├─ public/shiplogo.svg         Logo (vectorised)
├─ Averis_Hackathon_2026_Problem_Statement.pdf
├─ .env.example                Environment template
└─ README.md
```

| Script | What it does |
|--------|--------------|
| `npm run dev` | Development server on `http://localhost:3000` |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npx tsc --noEmit` | Type-check the whole project |

---

<div align="center">

**Shiptuationship: catch the mismatch before the ship sails.**

</div>

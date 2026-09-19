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


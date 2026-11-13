# Security review — 2026-11-13

Reviewed the session/password flow, proxy authorization, API handlers, Firestore access,
email rendering/export, exported n8n workflows, and the locked npm dependency tree.
This is a repository review; production IAM, Firestore rules, deployment configuration,
and running n8n workflows were not inspected.

## Findings and fixes

| Severity | Finding | Resolution |
| --- | --- | --- |
| Critical (dependency advisories) | The locked Next.js 16.3.5 release was covered by remote-code-execution advisories, including [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) and [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr). Exploit prerequisites were not reproduced against this app. | Upgraded Next.js to 16.4.6 and raised its package minimum. Updated vulnerable transitive packages and Vitest within compatible version ranges. |
| High | The exported `generate-auto-reply` webhook accepted unauthenticated requests. A caller reaching n8n could bypass app authentication and invoke the paid Vertex model. | Enabled native n8n Header Auth. The app now sends a server-only shared secret, refuses to call n8n without a 32+ character secret, and rejects redirects so credentials and email data cannot follow them. |
| Medium | Write requests had no origin validation. SameSite=Lax cookies alone do not protect against a malicious sibling subdomain; login also accepted cross-origin requests. | The shared proxy rejects foreign/null origins and cross-site/same-site browser writes, including login/logout, before dispatching routes. Same-origin browser requests and non-browser clients without origin headers remain supported. |
| Medium | Nothing stopped another site from framing the app, so a framed page could trick a moderator into clicking Clear or Save review (clickjacking). | `next.config.mjs` sends `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'` and `X-Content-Type-Options: nosniff` on every response. |
| Low | Email/audit/route APIs returned raw exception messages, including upstream Firestore response bodies and configuration details. | Replaced these with generic errors; the detail is logged on the server with `console.error`. |
| Low | Login answered faster for an unknown username (no scrypt hash was computed), revealing which usernames exist. | The login route hashes against a dummy value when the user is missing, so both cases take the same time. |
| Low | The audit endpoint accepted arbitrary email IDs while write endpoints restricted them. Dot segments or separators could reach the Firestore path builder. | Applied the existing email-ID allowlist before database access. |

## Deployment requirement

The webhook fix requires updating the running n8n workflow as well as deploying the app:

1. Import/update `n8n/auto-reply.json`, or enable **Header Auth** on the existing **Generate Auto Reply** webhook.
2. Select/create a Header Auth credential with header name `X-Auto-Reply-Secret` and a random value of at least 32 characters.
3. Set `N8N_AUTO_REPLY_WEBHOOK_SECRET` in the app environment to that same value and restart/redeploy.
4. Verify a request without the credential is rejected before invoking the model, and the app can generate a reply.

Until configured, the updated app returns 503 for auto replies. Repository changes alone
do not protect an existing live webhook. See [n8n webhook authentication documentation](https://docs.n8n.io/integrations/builtin/credentials/webhook/).

## Remaining risks

- **Medium:** Login has no attempt limit and uses synchronous scrypt. Sustained guessing can consume password-check CPU and database requests. Add a shared rate limit at ingress or in persistent storage before exposing login to untrusted traffic; a process-local counter is insufficient across instances.
- **Medium:** Sessions remain valid for up to 12 hours after an account is removed, its password changes, or its role is downgraded. Immediate revocation requires checking a server-side session/account version. Rotating `SESSION_SECRET` invalidates all existing sessions.
- **Medium:** JSON request limits are checked after parsing, or absent. Set an ingress request-size limit to bound memory use before parsing.

## Verification

Regression checks cover cross-origin writes, same-origin compatibility, missing webhook
credentials, secret forwarding, redirect refusal configuration, n8n authentication configuration,
audit path validation, and generic API errors. The n8n checks inspect the exported workflow;
live credential enforcement still needs the deployment check above.

- `npm test`: 49 files, 473 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed with Next.js 16.4.6.
- `npm audit --json`: zero known vulnerabilities after updates (previously 1 critical, 4 high, 2 moderate package findings).

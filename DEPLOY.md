# ParentRecall — Deployment Guide (DEPLOY.md)

**Platform:** Railway (GitHub deploy) · **Stack:** Node ≥18 / Express / PostgreSQL
**Domain:** parentrecall.com (DNS on Cloudflare) · **Mail:** Resend (sending) + Zoho (mailbox)
**Last updated:** 22 June 2026

This is the setup and recovery runbook. It captures the exact configuration that got ParentRecall live, including the gotchas that cost time the first time round so they never do again.

---

## 1. How the app boots

- **Start command:** `npm start` → `node src/server.js`
- On boot the server **applies the database schema automatically** (`src/migrate.js`). A healthy boot logs:
  ```
  ✓ Schema applied
  ParentRecall running on :8080
  ```
- A failed schema step logs `Could not apply schema on boot: <reason>` and the app will misbehave on any database-backed action even though the landing page still loads (the landing page needs no database).
- Railway injects the listening port via `PORT` — **never set `PORT` yourself.**

---

## 2. Environment variables (Railway → app service → Variables)

### Required

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | **Use a reference, not a pasted URL.** Must match the *current* Postgres service name (see §3). |
| `JWT_SECRET` | a long random string | e.g. `openssl rand -hex 32`. Changing it logs everyone out. |
| `RESEND_API_KEY` | `re_…` | Real key from the Resend account where the domain is verified. No quotes/spaces. |
| `MAIL_FROM` | `ParentRecall <team@parentrecall.com>` | Must be on the Resend-verified domain. Use **team@** so replies reach the Zoho mailbox. |
| `APP_URL` | `https://parentrecall.com` | Builds the links inside verification/reset emails. |

### Recommended

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Standard production flag. |

### Optional (sensible defaults — safe to omit)

| Variable | Default | Effect |
|---|---|---|
| `REQUIRE_VERIFIED_EMAIL` | `false` | `true` blocks app access until email verified. Leave **off** at launch. |
| `REMINDERS_ENABLED` | `true` | `false` disables birthday reminder emails. |
| `WEEKLY_DIGEST` | `true` | `false` disables the weekly admin email digest. |
| `WEEKLY_DIGEST_TO` | `team@parentrecall.com` | Where the weekly digest is sent. |
| `FEEDBACK_TO` | `team@parentrecall.com` | Destination for in-app feedback. |
| `ADMIN_KEY` | *(unset)* | Set a long random secret to enable the private admin dashboard at `/admin` (registration stats). Unset = dashboard disabled. |
| `PGSSL` | *(unset)* | Force Postgres SSL on/off. Not needed — SSL is auto-detected (see §4). |
| `PORT` | injected | **Do not set.** Railway provides it. |

---

## 3. Database connection (the reference gotcha)

`DATABASE_URL` must be a **Railway reference**, not a literal URL:

```
${{Postgres.DATABASE_URL}}
```

`Postgres` is the **exact, case-sensitive name** of the database service on the canvas.

**Gotcha that bit us once:** if the Postgres service is ever **deleted and recreated**, the old reference keeps the *old* service name (e.g. `${{Postgres-0220836f-….DATABASE_URL}}`) and silently resolves to **blank** — the app then can't connect. 

**Always set this with Railway's reference picker** rather than typing it:
1. App service → **Variables** → edit `DATABASE_URL` (or **+ New Variable**).
2. **Add Reference** → pick the **Postgres** service → `DATABASE_URL`.
3. Railway inserts the correct, current reference.

---

## 4. SSL: internal vs public host (the big one)

Railway exposes two database URLs, and they need **opposite** SSL settings:

| URL type | Host looks like | SSL |
|---|---|---|
| **Internal** (private network — preferred) | `postgres.railway.internal` | **OFF** |
| **Public / proxy** | `…proxy.rlwy.net` | **ON** |

The app auto-detects this in `src/db.js`: it **disables SSL for `*.railway.internal`** and enables it for public/proxy hosts and other managed providers. Forcing SSL on the internal host causes *every* query to fail (this was the original "Something went wrong" on registration).

**Keep `DATABASE_URL` on the internal host** (`${{Postgres.DATABASE_URL}}` gives you this) — it's faster and avoids egress charges. Only use the public URL if connecting from outside Railway, and only then is SSL required.

---

## 5. DNS (Cloudflare) — Zoho + Resend side by side

Both mail systems coexist because Resend sends from the **`send.` subdomain**, keeping its SPF separate from Zoho's root SPF.

**Required records (already in place):**

| Purpose | Type | Name | Value (abridged) |
|---|---|---|---|
| App (root) | CNAME | `parentrecall.com` | Railway app target |
| App (www) | CNAME | `www` | Railway app target |
| Railway verify | TXT | `_railway-verify` | `railway-verify=…` |
| Zoho mailbox | MX | `parentrecall.com` | `mx.zoho.eu`, `mx2.zoho.eu`, `mx3.zoho.eu` |
| Zoho SPF | TXT | `parentrecall.com` | `v=spf1 include:one.zoho.eu ~all` |
| Zoho DKIM | TXT | `parentrecall._domainkey` | `v=DKIM1; …` |
| Resend MX | MX | `send.parentrecall.com` | `feedback-smtp.eu-west-1.amazonses.com` |
| Resend SPF | TXT | `send.parentrecall.com` | `v=spf1 include:amazonses.com ~all` |
| Resend DKIM | TXT | `resend._domainkey` | `p=…` |

**Cloudflare rules:**
- **Mail records (MX / SPF-TXT / DKIM) must be "DNS only" (grey cloud)** — never proxied.
- **SSL/TLS mode = Full or Full (strict)**, not Flexible (Railway serves HTTPS; Flexible causes redirect loops).
- Only **one** root SPF TXT record is allowed — Zoho's. Resend's SPF lives on the `send.` subdomain, so there's no conflict.

---

## 6. Deploy checklist

1. [ ] `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` via the **reference picker** (points at the current Postgres).
2. [ ] `JWT_SECRET` set to a real random string.
3. [ ] `RESEND_API_KEY` set to a valid `re_…` key (from the account where the domain is verified).
4. [ ] `MAIL_FROM` = `ParentRecall <team@parentrecall.com>`.
5. [ ] `APP_URL` = `https://parentrecall.com`.
6. [ ] Postgres service **Online**.
7. [ ] Redeploy.
8. [ ] **Deploy Logs** show `✓ Schema applied` then `ParentRecall running on :8080`, with **no** "Could not apply schema" and **no** Resend `401`.
9. [ ] Postgres **Data** tab shows tables (users, children, clubs, people, households, …).

---

## 7. Post-deploy verification

| Check | How | Pass = |
|---|---|---|
| Database | Register a fresh account | Account created, you're logged in (HTTP `201`) |
| Verification email | Watch the inbox after register | Email arrives from team@parentrecall.com with a working link |
| Password reset | Login screen → "Forgot password?" | Reset email arrives with a working link |
| Avatars | Add a person → open the builder | Live preview updates; hairstyles/glasses/skin/hair/background all work |
| Mobile | Do the above on a real phone | Layout and forms work on a narrow screen |

---

## 8. Troubleshooting (issues we actually hit)

| Symptom | Cause | Fix |
|---|---|---|
| "Something went wrong" on register; landing page fine | SSL forced on the **internal** Postgres host | Ensure `src/db.js` disables SSL for `*.railway.internal` (current code does); keep `DATABASE_URL` on the internal reference. |
| `DATABASE_URL` blank / app can't connect | Reference points at a **deleted** Postgres service (old GUID name) | Repoint with the reference picker to the current `${{Postgres.DATABASE_URL}}`. |
| `Could not apply schema on boot: column "household_id" does not exist` | **Partially-built** database from an earlier failed deploy | Reset the database (drop tables, or recreate the Postgres service) and redeploy so the schema applies cleanly. |
| `[mailer] Resend error 401 … API key is invalid` | Wrong/placeholder `RESEND_API_KEY` | Set a valid `re_…` key from the correct Resend account; redeploy. |
| `register` returns `409` | Email already registered (not an error) | Use "Forgot password" or a different email. |
| `login` returns `401` | Wrong password | Reset the password. |
| Emails send (200) but don't arrive | Resend domain not verified / SPF/DKIM wrong / proxied mail records | Confirm Resend shows **Verified**; set mail records to **DNS only**; check spam. |

---

## 9. Resetting the database (clean slate)

Pre-launch, the simplest cure for a corrupt/partial schema is a reset:

1. Railway → **Postgres → Data**, drop the tables **or** delete and re-add the Postgres service.
2. If recreated, **repoint `DATABASE_URL`** with the reference picker (see §3) — the new service has a new name.
3. Redeploy the app. The schema rebuilds automatically on boot.
4. Confirm `✓ Schema applied` and that tables appear.

> ⚠️ This **erases all data**. Only do it while the data is disposable (i.e. pre-launch / test accounts).

---

## 10. Security notes

- **Never share the Railway dashboard / screen** longer than needed — it exposes `DATABASE_URL`, `JWT_SECRET`, and `RESEND_API_KEY`. Stop any desktop-share session when done.
- Enable 2FA on Railway, Cloudflare, Resend, Zoho, and GitHub.
- Rotate `RESEND_API_KEY` and `JWT_SECRET` if they're ever exposed (note: rotating `JWT_SECRET` logs everyone out).
- `ADMIN_KEY` gates the deletion-log export — keep it unset unless needed, and secret when set.

---

*End of deployment guide.*

# ParentRecall

> Remember every name at the school gate.

A private, free memory aid for parents: keep track of your kids' classmates, fellow parents, coaches and clubs — and the little details that bring a name back when you blank at pickup.

**Structure:** your child → their clubs & classes → the people in each one → a profile with the memory-jogging notes.

Built on Node.js / Express, PostgreSQL, JWT auth — deploy-ready for Railway. No payments, no sharing, no ads. Each account's data is private to that account.

---

## Stack

| Layer    | Choice                                  |
|----------|-----------------------------------------|
| Server   | Node.js + Express                       |
| Database | PostgreSQL (`pg`)                       |
| Auth     | JWT (`jsonwebtoken`) + `bcryptjs`       |
| Frontend | Vanilla JS + CSS (no build step)        |
| Hosting  | Railway (Nixpacks)                      |

The frontend is plain HTML/CSS/JS served as static files by Express — nothing to compile.

---

## Project layout

```
parentrecall/
├── package.json
├── railway.json
├── .env.example
├── db/
│   └── schema.sql            # users → children → clubs → people
├── src/
│   ├── server.js             # Express app, static hosting, boot migration
│   ├── db.js                 # pg Pool (SSL auto-on for Railway)
│   ├── migrate.js            # applies schema.sql (idempotent)
│   ├── middleware/auth.js    # JWT sign + requireAuth
│   └── routes/
│       ├── auth.js           # register / login
│       ├── children.js
│       ├── clubs.js
│       └── people.js
└── public/
    ├── index.html
    ├── styles.css
    ├── app.js                # the whole client app
    └── logo.png
```

---

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the env file and fill it in:
   ```bash
   cp .env.example .env
   ```
   - `DATABASE_URL` — a local or hosted Postgres connection string
   - `JWT_SECRET` — generate one:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
3. Create the tables (also runs automatically on boot):
   ```bash
   npm run migrate
   ```
4. Start:
   ```bash
   npm run dev     # auto-restart on changes
   # or
   npm start
   ```
5. Open http://localhost:3000

---

## Deploy to Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** → pick `parentrecall`.
3. Add a **PostgreSQL** plugin to the project. Railway exposes its `DATABASE_URL`.
4. In the service **Variables**, set:
   - `DATABASE_URL` → reference the Postgres plugin's variable (`${{Postgres.DATABASE_URL}}`)
   - `JWT_SECRET` → a long random string
5. Deploy. Tables are created automatically on first boot; the app is served on the Railway URL.
6. Point `parentrecall.com` at the Railway domain when you're ready.

SSL to Postgres is enabled automatically when the connection string looks like a managed host (Railway, Render, Supabase, etc.).

---

## API

All data routes require `Authorization: Bearer <token>`.

| Method | Path                       | Body                                             |
|--------|----------------------------|--------------------------------------------------|
| POST   | `/api/auth/register`       | `{ email, password, name? }`                     |
| POST   | `/api/auth/login`          | `{ email, password }`                            |
| GET    | `/api/auth/me`             | — (current user, incl. `email_verified`)         |
| GET    | `/api/auth/verify?token=`  | — (clicked from email; redirects to the app)     |
| POST   | `/api/auth/resend-verification` | — (signed in)                               |
| POST   | `/api/auth/forgot`         | `{ email }` (always 200 — no account enumeration)|
| POST   | `/api/auth/reset`          | `{ token, password }`                            |
| GET    | `/api/auth/export`         | — (downloads all your data as JSON)              |
| DELETE | `/api/auth/account`        | — (permanently deletes account + all data)       |
| GET    | `/api/children`            | —                                                |
| POST   | `/api/children`            | `{ name }`                                       |
| PUT    | `/api/children/:id`        | `{ name }`                                       |
| DELETE | `/api/children/:id`        | —                                                |
| GET    | `/api/clubs?childId=`      | —                                                |
| POST   | `/api/clubs`               | `{ childId, name, sub?, color? }`                |
| PUT    | `/api/clubs/:id`           | `{ name?, sub?, color? }`                         |
| DELETE | `/api/clubs/:id`           | —                                                |
| GET    | `/api/people?clubId=`      | —                                                |
| POST   | `/api/people`              | `{ clubId, name, role?, parents?, hooks?, birthday? }` |
| POST   | `/api/people/bulk`         | `{ clubId, names: [ ... ] }` (paste a class list) |
| POST   | `/api/people/import`       | `{ clubId, people: [ {name, role?, ...} ] }` (spreadsheet import) |
| PUT    | `/api/people/:id`          | partial of the above                             |
| DELETE | `/api/people/:id`          | —                                                |

Deleting a child cascades to its clubs and people; deleting a club cascades to its people.

---

## Email verification & password reset

Both flows use [Resend](https://resend.com).

- **No key in dev:** if `RESEND_API_KEY` is blank, emails aren't sent — the link is printed to the server console so you can copy it and test the flow locally.
- **Verification:** new accounts start unverified and get a verification email. A "verify your email" banner shows in the app with a **Resend** button. Set `REQUIRE_VERIFIED_EMAIL=true` to block data routes until verified (off by default).
- **Password reset:** "Forgot password?" on the login screen → email entry (always responds the same way, so it can't reveal which emails have accounts) → a link that expires in 1 hour and works once.
- Reset and verification links are stored only as SHA-256 hashes, are single-use, and expire (verify 24h, reset 1h). Resetting a password also marks the email verified, since the emailed link proves ownership.

Relevant env vars: `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`, `REQUIRE_VERIFIED_EMAIL` (see `.env.example`).

---

## Privacy & safeguarding notes

- Data is private per account — there is no sharing, no social graph, no discovery.
- In-app avatars are neutral silhouettes by design. **Don't** add real photos of other people's children.
- `birthday` is stored as free text (e.g. "12 March") to keep entry effortless.
- Passwords are hashed with bcrypt (cost 12); JWTs expire after 60 days.

## Installable (PWA)

Ships with a web app manifest, icons, and a service worker, so it can be added to a phone's home screen and opens instantly. The service worker caches the app shell for offline launch; API requests are never cached (always fresh, always private). True offline *data* (reading your lists with no signal) is a future addition.

## Roadmap ideas (not built yet)

- Birthday reminders (needs a scheduled email worker).
- Offline data cache (read your lists with no signal).
- A reset doesn't revoke existing JWT sessions (they're stateless). Add a per-user token version if you want reset to force re-login everywhere.

### Done

- Email verification + password reset (Resend).
- Edit & delete for children, clubs, and people.
- "Paste a class list" bulk add.
- Spreadsheet import (.xlsx/.csv) with a downloadable template, for class reps/organisers. Parsing happens in the browser (SheetJS, self-hosted at `public/vendor/xlsx.full.min.js` so the content-security-policy stays strict); only the parsed names are sent to the server.
- Export-my-data + delete-my-account (GDPR-friendly).
- Installable PWA with offline app-shell.

---

© Pacedall Labs. All rights reserved.

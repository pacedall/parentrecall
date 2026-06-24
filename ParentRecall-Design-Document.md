# ParentRecall — Design Document

**Component:** Avatar system & recent design additions
**Product:** ParentRecall (parentrecall.com)
**Owner:** James Ryall — Pacedall Labs Ltd (Company No. 16619412)
**Status:** Implemented — launch set live, expansion pending
**Last updated:** 21 June 2026

---

## 1. Purpose & scope

This document records the design and implementation of the **ParentRecall avatar system** — the generated, privacy-safe faces used to represent the people a parent is trying to remember — together with two smaller additions made in the same work: a **"Keep me signed in"** option and two **landing-page statements**.

It is intended as a reference and handoff artifact: it captures *what* was built, *why* it was designed that way, the *exact values* used, and the *open items* for the next stage.

---

## 2. Product context

ParentRecall is a free, privacy-first memory aid that helps a parent remember the people around their children — classmates, other parents and carers, teachers, and coaches — by pairing each person with a name, a few memory hooks, and a recognisable face.

A foundational product rule shapes everything here:

> **No photographs of children, ever.**

That single principle is the reason avatars exist. A parent needs a *visual* cue to jog recognition, but storing real photos of other people's children is both a safeguarding risk and an app-store and data-protection problem. The avatar system is the answer: a recognisable, buildable, **illustrated** face that carries none of the risk of a photo.

### Design principles

1. **Privacy & child safety first** — generated illustrations only; no photo upload path exists.
2. **Recognisable, not realistic** — the face must be *distinct enough* to trigger memory, not a likeness.
3. **Inclusive by default** — a broad, respectful range of skin tones, hair, and head coverings.
4. **Friendly and low-pressure** — a soft, warm tone suited to a parenting context.
5. **Lightweight** — vector graphics generated in code; no image files to commission, store, host, or load.

---

## 3. Avatar system

### 3.1 Concept & rationale

Each avatar is a **scalable vector (SVG) illustration generated in the browser from a small set of options**, not a stored image. The parent builds a face by choosing skin tone, hair style, hair colour, and glasses; the app draws it live.

Why generated SVG rather than images or AI:

| Approach | Verdict | Reason |
|---|---|---|
| Photographs | **Rejected** | Core safeguarding rule; no photos of children. |
| AI-generated faces | **Rejected** | Reintroduces real-likeness/child-safety concerns; storage, cost, and unpredictability. |
| Pre-drawn image library | **Rejected** | Must be commissioned, stored, hosted, and loaded; doesn't scale or combine. |
| **Generated SVG (chosen)** | **Adopted** | No asset pipeline; infinitely scalable; tiny payload; thousands of combinations from a handful of parts. |

A complete avatar is roughly **1–5 KB of text** and stays perfectly crisp at any size.

### 3.2 Visual style

The agreed style is a **soft-cartoon headshot**:

- A **realistic-ish face** — gentle skin shading (a vertical gradient), large friendly eyes with catch-light highlights, soft rosy cheeks, a small nose, and a gentle smile.
- **Simple cartoon hair** — solid shapes with clean hairlines, deliberately *less* detailed than the face, with a subtle highlight sheen.
- **Headshot framing** — no clothing or shoulders; the head is scaled up to fill the circular frame so the face is the focus.

The brief that produced this was: *"softer, easier on the eye, and a bit of fun."* The result keeps enough shading to avoid looking flat, while staying warm and approachable rather than photographic.

### 3.3 Design evolution

The style was reached through deliberate iteration, each step driven by review:

1. **Flat cartoon** (original) — simple, but felt generic.
2. **Realistic vector portrait** — proved how far hand-drawn vector could go; liked, but heavy and a touch serious.
3. **Simpler hair** — face detail kept, hair reduced to clean shapes.
4. **Tucked ears** — ears pulled in close to the head for a more natural silhouette.
5. **Standard cartoon hairstyle set** — a normal, recognisable range of styles.
6. **Softer / more fun** — rounder face, bigger eyes, rosy cheeks, gentle smile.
7. **Headshot** — clothing removed, head enlarged to fill the frame.

Two firm rules emerged and are now part of the spec: **no accessories**, and **glasses retained as a feature with multiple styles**.

### 3.4 Avatar anatomy

Every avatar is drawn on a **200 × 200 viewBox**, clipped to a circle of radius 100. The head is wrapped in a single transform that enlarges it into a headshot, so all parts scale together:

```
transform = translate(100,108) scale(1.3) translate(-100,-95)
```

**Layer order (back to front):**

1. Background fill — a soft tint of a brand colour (see 3.5)
2. Background edge ring — a slightly deeper shade of the same tint, for definition
3. *(head group begins — scaled)*
3. Hair — back layer (behind the head: long hair, afro mass, bun, curls)
4. Ears (omitted when a hijab is worn)
5. Face — skin shape filled with a per-avatar vertical gradient
6. Soft highlight (subtle white sheen, upper-left)
7. Cheeks (rosy blush)
8. Eyebrows (colour derived from hair)
9. Eyes — white, iris, pupil, catch-light highlights
10. Nose (soft stroke)
11. Mouth (gentle smile + lower-lip hint)
12. Glasses (if any)
13. Hair — front layer (hairline, fringe, hijab frame)

### 3.5 Option library (launch set)

**Skin tones** (6) — applied as the base of a gradient; the engine derives lighter/darker shades automatically:

| # | Hex | Tone |
|---|-----|------|
| 1 | `#FBD9B8` | Light |
| 2 | `#F4C7A0` | Light–medium |
| 3 | `#E6AC80` | Medium |
| 4 | `#CD9265` | Medium–tan |
| 5 | `#A6724C` | Brown |
| 6 | `#7C5436` | Deep |

**Hair colours** (6):

| # | Hex | Colour |
|---|-----|--------|
| 1 | `#2C2622` | Black |
| 2 | `#4A3526` | Dark brown |
| 3 | `#8A5A30` | Light brown |
| 4 | `#D7A94B` | Blonde |
| 5 | `#9AA0A6` | Grey |
| 6 | `#B9402E` | Red / auburn |

**Hairstyles** (7): `short`, `long`, `curly`, `afro`, `bun`, `bald`, `hijab`.
*(Bald shows no hair; hijab covers the hair and uses the selected colour as the fabric — neither multiplies by hair colour.)*

**Glasses** (5): `none`, `round`, `square`, `rectangle`, `cateye`.

**Backgrounds** (6) — soft tints of the brand palette, shown as the circle behind the head:

| # | Hex | Brand hue |
|---|-----|-----------|
| 1 | `#F9CDA9` | Orange |
| 2 | `#BFE3F2` | Blue |
| 3 | `#B9E7E2` | Teal |
| 4 | `#FBE6AE` | Amber |
| 5 | `#CFD9F3` | Periwinkle (navy) |
| 6 | `#F8C6C0` | Coral (red) |

A new person is given a brand colour automatically (so a list looks varied out of the box) and it can be changed in the picker. Legacy avatars without a stored colour are assigned one deterministically from their settings, so they stay stable. A subtle ring one shade deeper sits on the circle edge.

**Accessories:** none (the previous hearing-aid option was removed by design; legacy data is stripped on save).

### 3.6 Combinatorics

```
6 skin tones × 6 hair colours × 13 hairstyles × 5 glasses = 2,340 nominal
```

Adjusting for the two styles that don't use hair colour (bald, hijab), the launch set yields **2,000+ genuinely distinct faces** (and over **12,000** once the 6 brand backgrounds are counted) — far more than enough that two people in the same class or club would not look alike.

The efficiency: roughly **29 drawn components** (1 base face + 6 skin swatches + 6 hair swatches + ~13 hairstyles + ~4 glasses) combine into those 2,000+ looks. Each *new* hairstyle adds ~150 combinations; each new glasses style adds a few hundred.

### 3.7 Feature colour reference

| Feature | Hex | Notes |
|---|-----|-------|
| Avatar background | brand tint | One of 6 soft brand tints (see 3.5); edge ring is that tint darkened ~12% |
| Eye iris | `#6B4F34` | Warm brown |
| Pupil | `#241813` | Near-black |
| Cheeks (blush) | `#F4938A` | At ~40% opacity |
| Mouth | `#C56B5C` | Soft rose |
| Glasses frame | `#33373F` | Soft charcoal |
| Eyebrows | derived | Hair colour darkened ~12% |
| Skin gradient top / bottom | derived | Base skin lightened ~5% / darkened ~10% |
| Ears | derived | Base skin darkened ~5% |
| Nose stroke | derived | Base skin darkened ~22% |

### 3.8 Technical implementation

- **Pure string generation** — `buildAvatar(cfg, size)` returns an SVG string; no DOM, no canvas, no external assets.
- **Per-avatar unique IDs** — the skin gradient and clip path are suffixed with a random id (e.g. `sk_a1b2c3`) so multiple avatars on one screen never collide.
- **Colour derivation** — a small `shade(hex, amount)` helper lightens/darkens a hex colour, so the whole face is driven from one chosen skin tone and one hair colour rather than many fixed values.
- **Component functions** — `hairBack(style, hc)`, `hairFront(style, hc)`, and `glassesSVG(kind)` return the relevant shapes; the hijab uses an even-odd path to "cut out" the face opening.
- **Headshot transform** — applied once to the head group, so enlarging the face automatically carries every hairstyle, tone, and glasses option with it, still crisp at any render size.

**Source of truth:** `public/app.js` (front-end engine and picker UI); `public/styles.css` (picker styling).

### 3.9 Data model & validation

A saved avatar is stored as a small JSON object on the person record:

```json
{ "skin": "#CD9265", "hairColor": "#2C2622", "hair": "curly", "glasses": "round", "bg": "#BFE3F2" }
```

Server-side validation (`src/routes/people.js`) sanitises every avatar before it is stored:

- `skin`, `hairColor`, and `bg` must be valid hex colours.
- `hair` must be in the allowlist: `short, long, curly, afro, bun, bald, hijab, none`.
- `glasses` must be in the allowlist: `none, round, square, rectangle, cateye`.
- Any unrecognised field (e.g. the old `acc` accessory) is **dropped**.

**Backward compatibility:** older saved avatars still render. The legacy hair value `none` (formerly "shaved") maps to `bald`; the legacy accessory field is silently removed on next save.

### 3.10 Accessibility & performance

- Avatars are **decorative** and marked `aria-hidden` so screen readers announce the person's name, not the drawing.
- No network requests, no image decoding — avatars render instantly from text.
- Fully scalable: the same definition is used at small list size and large profile size with no loss of quality.

### 3.11 Roadmap (post-launch)

Planned additions, in priority order:

- **More hairstyles:** straight, wavy, dreadlocks, braids, ponytail, buzz cut (and tidy the "straight" fringe).
- **More glasses:** aviator, half-rim.
- **Optional face tweaks:** eye size, blush intensity, smile shape.
- **Headshot scale tuning:** currently 1.3× — adjustable larger/smaller to taste.

These are deliberately deferred so the **launch set ships first for real-world testing** before the library is widened.

---

## 4. Recent feature additions

### 4.1 Keep me signed in

**Goal:** let a parent avoid logging in every visit on their own device, without compromising security on a shared family device.

**Behaviour:**

- The login screen shows a **"Keep me signed in on this device"** checkbox, ticked by default.
- **Ticked** → the login token is stored persistently; the parent stays signed in across visits and restarts.
- **Unticked** → the token is stored only for the session and is cleared when the browser closes — appropriate for a shared tablet.
- Signing out clears the token from **both** stores.

**Security rationale (important):** the app deliberately **does not store the raw password**. Storing a plaintext password would be a security risk. Instead it keeps the *login token* (the standard, safe "remember me" mechanism), and the login form is marked up so the **browser's / device's own password manager** can offer to save and auto-fill the password. Password custody stays with the device's secure store, never the app's.

**Implementation:** `saveToken(token, persist)` in `public/app.js` chooses persistent vs session storage; the token loader reads from either store on start-up.

### 4.2 Landing-page statements

Two trust statements were added to the landing hero:

- **"Built for parents, by parents"** — shown as a badge above the headline. *Accuracy confirmed:* the founder is a parent who built the product to solve his own need (remembering other parents' names), so the claim is truthful and store/ad-standards safe.
- **"Free to register and use — no card, no catch"** — shown as a clear line beneath the call-to-action. The word "Free" was removed from the smaller trust line to avoid repetition.

---

## 5. Brand reference

**Colours** (from `public/styles.css`):

| Token | Hex | Use |
|---|-----|-----|
| Navy / ink | `#18306C` | Headings, primary text |
| Orange | `#F2641E` | Primary actions, accents |
| Teal | `#0CA8A8` | Secondary accent |
| Blue | `#1890B4` | Secondary accent |
| Amber | `#F5B72E` | Accent |
| Red | `#E5403A` | Warnings / destructive |
| Muted | `#5E6A86` | Secondary text (meets WCAG AA on white) |
| Hairline | `#E7EBF3` | Borders, dividers |
| Paper / card | `#FFFFFF` | Backgrounds |

**Type:** Poppins (wordmark, headings) · Inter (body).

---

## 6. File inventory

Files created or changed for this work:

| File | Change |
|---|---|
| `public/app.js` | New soft-cartoon avatar engine (`buildAvatar`, `shade`, hair/glasses helpers); updated picker (accessories removed, glasses styles added); headshot transform; `saveToken` + session/persistent token logic; "Keep me signed in" checkbox; landing hero statements. |
| `public/styles.css` | `.keepme` checkbox styling; `.leyebrow` badge and `.lfree` line for the hero. |
| `src/routes/people.js` | Updated avatar allowlists (`HAIR_OK`, `GLASSES_OK`); removed accessory validation; strips legacy `acc`. |
| `src/routes/demo.js` | Demo people updated to the new avatar schema (accessory removed). |

---

## 7. Decision log

| Decision | Outcome | Rationale |
|---|---|---|
| Photos of children | **Never** | Core safeguarding rule. |
| Avatar technology | **Generated SVG** | No assets; scalable; thousands of combinations. |
| Visual style | **Soft-cartoon headshot** | "Softer, easier on the eye, a bit of fun." |
| Face vs hair detail | **Realistic-ish face, simple cartoon hair** | Recognisable but friendly; faster to extend. |
| Accessories | **Removed** | Founder direction. |
| Glasses | **Kept, multiple styles** | Common; aids recognition. |
| Clothing | **Removed (headshot)** | Bigger face, clearer focus. |
| Avatar background | **Soft brand tints** | Ties avatars to the site; warm, varied list. |
| Launch scope | **7 hairstyles, 5 glasses, 6×6 colours** | Ship and test before widening the library. |
| Password storage | **Never store raw password** | Keep login token instead; device password manager holds credentials. |
| "By parents" claim | **Kept** | Truthful — founder is a parent solving his own need. |

---

## 8. Appendix — example avatar definitions

```json
{ "skin": "#FBD9B8", "hairColor": "#D7A94B", "hair": "long",  "glasses": "round" }
{ "skin": "#A6724C", "hairColor": "#2C2622", "hair": "afro",  "glasses": "none" }
{ "skin": "#E6AC80", "hairColor": "#4A3526", "hair": "hijab", "glasses": "none" }
{ "skin": "#7C5436", "hairColor": "#9AA0A6", "hair": "bald",  "glasses": "square" }
```

Each is a complete, recognisable face — and only a few dozen bytes.

---

*End of document.*

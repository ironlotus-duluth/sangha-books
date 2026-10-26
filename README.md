# Iron Lotus Sangha — Book Group App

A simple web app for the Iron Lotus Sangha (Duluth, MN) to suggest, vote on, and track books for their Buddhist book group. Built with plain HTML/CSS/JS on the frontend and Google Apps Script + Google Sheets on the backend.

**Live site:** [books.ironlot.us](https://books.ironlot.us)

> **Handing this off?** Start with [HANDOFF.md](HANDOFF.md). It's written for non-technical sangha members and for whoever helps them.

---

## How It Works

Members visit the site, enter the round password, and can:

- **Suggest** books for the group to read next (up to a per-round limit per person, 2 by default)
- **Vote** by picking their top 3 choices (Borda count)
- **Browse** submitted books and live results
- **View past rounds** without a password

An admin (signed in via Google) manages the round lifecycle: create rounds, open/close submissions and voting, and mark rounds complete.

### Borda Count Voting

Members pick their top 3 books in order: 1st choice = 3 points, 2nd = 2, 3rd = 1. The book with the most total points wins; ties go to the book with more 1st-choice votes, then 2nd-choice. The algorithm runs entirely client-side (`RCV.calculate()` in `app.js`, a name kept from the original ranked-choice version). See [VOTING-ALGORITHM-RECOMMENDATION.md](VOTING-ALGORITHM-RECOMMENDATION.md) for why.

### Suggestion Limit

Each round has a **Max Per Person** cap (Rounds sheet, column G; 2 by default for new rounds, blank = no limit). The backend enforces it by submitter name (case- and whitespace-insensitive), so it's honor-system, not identity-verified. Admins can raise it mid-round from the admin page. Duplicate titles (same main title, ignoring case/punctuation/subtitle) are rejected and don't count against the limit.

---

## Architecture

```
┌──────────────────┐
│  User's Browser   │
│  (static HTML/JS) │
└────────┬─────────┘
         │  HTTPS
         ▼
┌──────────────────┐      ┌──────────────────┐
│ Cloudflare Pages  │      │  Google Apps      │
│ (static hosting)  │      │  Script (backend) │
└──────────────────┘      └────────┬─────────┘
                                   │
                          ┌────────▼─────────┐
                          │  Google Sheets    │
                          │  (database)       │
                          └────────┬─────────┘
                                   │
                          ┌────────▼─────────┐
                          │  Gmail            │
                          │  (vote confirm.)  │
                          └──────────────────┘
```

- **No build step.** Plain HTML, CSS, and vanilla JavaScript. No React, no npm, no bundler.
- **No server to maintain.** Cloudflare Pages serves static files (auto-deploys from GitHub). Google Apps Script is the only backend.
- **No database to manage.** Google Sheets is the database — visible, editable, exportable.
- **No cost.** Everything runs on free tiers (Cloudflare, GitHub, Google).

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Landing page with password gate and two-column dashboard (Participate / Browse) |
| `suggest.html` | Form to submit a book suggestion with optional Goodreads link |
| `vote.html` | Click-to-select top-3 ranked-choice voting interface |
| `books.html` | Lists all suggested books for the current round |
| `results.html` | Live Borda count results with a point-breakdown chart |
| `history.html` | Past completed rounds (public, no password needed) |
| `admin.html` | Admin panel — create rounds, toggle submissions/voting, review books, manage summaries |
| `styles.css` | All visual styling (Georgia font, green accent, 20px base for accessibility) |
| `app.js` | Shared JavaScript — API client, data cache, Borda count, session management, UI helpers |
| `apps-script.js` | Backend code (reference copy of what runs in Google Apps Script) |

---

## Configuration

Two values in `app.js` connect the frontend to the backend:

```javascript
const API_URL = 'https://script.google.com/macros/s/.../exec';
const GOOGLE_CLIENT_ID = '....apps.googleusercontent.com';
```

- **API_URL** — Google Apps Script deployment URL. Changes when you redeploy Apps Script (Manage deployments → Edit → New version → Deploy).
- **GOOGLE_CLIENT_ID** — OAuth client ID from Google Cloud Console. Only needed for admin sign-in.

The same `GOOGLE_CLIENT_ID` must also be set in the Apps Script code (line 16).

---

## Google Sheet Structure

The Apps Script auto-creates these sheets on first use:

| Sheet | Columns |
|-------|---------|
| **Rounds** | Round Name, Password, Submissions Open, Voting Open, Created, Completed, Max Per Person |
| **Suggestions** | Timestamp, Round, Submitter Name, Book Title, Author, Link, Summary |
| **Votes** | Timestamp, Round, Voter Name, Voter Email, Rankings JSON |
| **History** | Round, Winner Title, Winner Author, Date Completed, Total Voters, Total Books |
| **Settings** | Key, Value |

You can view and edit data directly in the sheet. The website reads from it in real time.

---

## Performance Optimizations

The app includes several optimizations to minimize latency from Google Apps Script:

1. **Combined endpoint** (`getRoundWithBooks`) — Returns round info + book list in a single request instead of two separate calls. Landing page and vote page use this.

2. **Client-side data cache** (`DataCache` in app.js) — 60-second TTL cache in memory + localStorage. Navigating between pages serves data from cache instead of re-fetching.

3. **localStorage session persistence** — Password persists across tabs and browser restarts. Closing a tab no longer logs people out. (Sign-out button still works.)

4. **Server-side history cache** — `CacheService` in Apps Script caches the history endpoint for 5 minutes. Completed rounds never change, so this is safe.

5. **Optimistic admin UI** — Toggling submissions/voting updates the admin page immediately from local state instead of re-fetching all data.

6. **Targeted duplicate vote check** — Uses `TextFinder` to search for a voter's email instead of reading the entire Votes sheet into memory.

7. **Graceful fallback** — If the backend hasn't been updated with the combined endpoint, the frontend automatically falls back to two parallel `Promise.all` calls.

---

## Deployment

### Frontend (automatic)

Push to `main` on GitHub. Cloudflare Pages auto-deploys within ~30 seconds.

### Backend (manual)

1. Open the Google Sheet → Extensions → Apps Script
2. Replace the code with the contents of `apps-script.js`
3. Manage deployments → Edit (pencil icon) → Version: New version → Deploy
4. If the Deployment ID changes, update `API_URL` in `app.js` and push to GitHub

### Custom Domain

The site is served at `books.ironlot.us` via Cloudflare DNS. The domain `ironlot.us` is registered at Namecheap with nameservers pointed at Cloudflare.

---

## Running a Round (Quick Reference)

1. **Create** — Admin page → enter round name + password → Create Round
2. **Collect suggestions** — Share `books.ironlot.us` + password with the group. Submissions open automatically.
3. **Review books** — Admin page → Review Books section. Add Goodreads links and summaries. Fix any flagged items before opening voting.
4. **Open voting** — Admin page → Close Submissions → Open Voting. Notify the group.
5. **Wait** — Give the group a week or so. Check Results page anytime.
6. **Complete** — Admin page → Complete Round. This closes everything and archives the round to History.

---

## Accounts and Access

| Service | Account | Purpose |
|---------|---------|---------|
| Google (Sheet, Apps Script, Gmail, Cloud Console) | `iron.lotus.sangha.duluth@gmail.com` | All backend infrastructure |
| GitHub | `ironlotus-duluth` | Source code repository |
| Cloudflare | Iron Lotus email | Static hosting + DNS |
| Namecheap | (registrar for `ironlot.us`) | Domain registration — renews 2027-05-28 |

The SSH key for the GitHub account is configured on Jonathan's Mac at `~/.ssh/id_ironlotus` with host alias `github-ironlotus`.

---

## Costs

Everything is free:

- Cloudflare Pages — free tier (unlimited bandwidth)
- GitHub — free for public repos
- Google Sheets + Apps Script — free with any Google account
- Gmail — free (up to ~100 emails/day)
- Google Cloud OAuth — free (no billing required)
- Domain `ironlot.us` — annual renewal (only paid component)

---

## Troubleshooting

See [MAINTENANCE.md](MAINTENANCE.md) for detailed troubleshooting, disaster recovery, and handoff documentation.

---

## Design Decisions

- **Large text (20px base, Georgia serif)** — Designed for accessibility, particularly for older members of the sangha.
- **Password gate instead of accounts** — Members don't need Google accounts or any login. One shared password per round keeps it simple.
- **Top-3 voting instead of full ranking** — Easier for people unfamiliar with ranked voting. Partial ballots (1 or 2 picks) are allowed.
- **Per-person suggestion cap** — Added after Spring 2026 (13 books, one person suggested 7) to keep the list short enough that votes concentrate.
- **Google Sheets as database** — Visible, editable, exportable. The admin can fix data issues directly without touching code.
- **No build tooling** — Plain HTML/CSS/JS means anyone can edit the site without learning a framework or build system.
- **Visible password field** — The round password is not sensitive (it's shared openly with the group), so it's shown as plain text to reduce friction.

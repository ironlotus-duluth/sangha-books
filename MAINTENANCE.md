# Sangha Book Group App — Maintenance Guide

A complete reference for anyone maintaining this system. Written so that a
reasonably tech-comfortable person (not necessarily a developer) can understand
what's going on and fix things when they break.

---

## What This System Is

A simple website where the Iron Lotus Sangha book group can:

1. **Suggest books** they'd like the group to read
2. **Vote** by picking their top 3 choices using ranked-choice voting (the least
   popular are eliminated round by round until one wins)
3. **See results** live, with a visual chart of each elimination round
4. **Review past rounds** in a history page

There's also a **password-protected gate** (each round has its own password) and
an **admin page** (Google sign-in required) for managing rounds.

---

## Where Everything Lives

| Component | Location | Login |
|-----------|----------|-------|
| **Website files** | GitHub: [ironlotus-duluth/sangha-books](https://github.com/ironlotus-duluth/sangha-books) | GitHub account: `ironlotus-duluth` |
| **Live website** | Cloudflare Pages (URL depends on setup — likely `sangha-books.pages.dev` or a custom domain) | Cloudflare account tied to Iron Lotus email |
| **Data (all books, votes, rounds)** | Google Sheet called "Sangha Book Group" | Google account: `iron.lotus.sangha.duluth@gmail.com` |
| **Backend logic** | Google Apps Script (attached to that same Google Sheet) | Same Google account |
| **Admin authentication** | Google Cloud Console project "Sangha Book Group" | Same Google account |
| **Email confirmations** | Sent automatically via Gmail from `iron.lotus.sangha.duluth@gmail.com` | Same Google account |

**Key insight:** Almost everything runs through the `iron.lotus.sangha.duluth@gmail.com` Google account. If you have access to that account, you have access to everything except the GitHub repo and Cloudflare.

---

## How the Pieces Connect

```
User's Browser
     │
     ▼
Cloudflare Pages (serves the HTML/CSS/JS files)
     │
     │  The JavaScript in the browser makes API calls to:
     ▼
Google Apps Script (the "backend" — handles all data read/write)
     │
     ▼
Google Sheets (the "database" — stores all rounds, books, votes)
     │
     ▼
Gmail (sends vote confirmation emails automatically)
```

**Cloudflare Pages** simply hosts the static files. It auto-deploys whenever
someone pushes changes to the GitHub repo's `main` branch. There's no server
to maintain — it's all free-tier static hosting.

**Google Apps Script** is the only "server-side" code. It's a free Google
service that runs JavaScript attached to a Google Sheet. It handles:
- Creating/managing rounds
- Accepting book suggestions
- Recording votes
- Sending confirmation emails
- Verifying admin identity

---

## The Files

All website files are in the GitHub repo. Here's what each one does:

| File | Purpose |
|------|---------|
| `index.html` | Landing page with password gate. Enter round name + password to get in. |
| `books.html` | Lists all suggested books for the current round |
| `suggest.html` | Form to submit a book suggestion |
| `vote.html` | Click-to-select top-3 ranked-choice voting interface |
| `results.html` | Live results with bar chart visualization of each RCV round |
| `history.html` | Past rounds (public, no password needed) |
| `admin.html` | Admin panel — create rounds, toggle submissions/voting, complete rounds |
| `styles.css` | All visual styling (Georgia font, green accent, large text for accessibility) |
| `app.js` | All shared JavaScript — API client, data cache, RCV algorithm, session management, utilities |
| `apps-script.js` | The backend code (copy of what's in Google Apps Script — for reference) |

### Two Critical Values in `app.js`

Lines 8-9 of `app.js` contain two values that connect the frontend to the backend:

```javascript
const API_URL = 'https://script.google.com/macros/s/..../exec';
const GOOGLE_CLIENT_ID = '....apps.googleusercontent.com';
```

- **API_URL** — The Google Apps Script deployment URL. If you redeploy the Apps Script, this URL changes and must be updated here.
- **GOOGLE_CLIENT_ID** — The OAuth client ID from Google Cloud Console. Only needed for the admin page sign-in.

---

## The Google Sheet

The Apps Script automatically creates these sheets (tabs) when they're first needed:

| Sheet | What It Stores |
|-------|---------------|
| **Rounds** | Round name, password, whether submissions/voting are open, creation date, completion date |
| **Suggestions** | Timestamp, round name, submitter name, book title, author, link, summary |
| **Votes** | Timestamp, round name, voter name, voter email, rankings as JSON |
| **History** | Round name, winner, completion date, voter/book counts |
| **Settings** | Admin email addresses |

**You can view and even edit this data directly in Google Sheets.** For example, if someone's vote needs to be corrected, you can edit the Votes sheet directly. The website reads from the sheet in real time.

---

## Common Tasks

### Start a New Round

1. Go to the admin page (`/admin.html`)
2. Sign in with the Iron Lotus Google account
3. Enter a round name (e.g., "Fall 2026") and a password
4. Click Create Round
5. Share the website URL and password with the group

### Close Suggestions and Open Voting

1. Go to admin page
2. Toggle "Submissions" to closed
3. Toggle "Voting" to open

### End a Round

1. Go to admin page
2. Click "Complete Round" — this closes both submissions and voting and moves the round to history

### Change the Admin Email

If someone new should have admin access:
1. Open the Google Sheet
2. Go to Extensions → Apps Script
3. Find the `ADMIN_EMAILS` array near the top
4. Add their Gmail address
5. Click Deploy → Manage deployments → Edit → New version → Deploy

### Update the Website Design

1. Edit the files on GitHub (or locally and push)
2. Cloudflare auto-deploys within ~30 seconds
3. No server restart needed — it's all static files

---

## Troubleshooting

### "The website isn't loading"

- Check if Cloudflare Pages is still active: log into Cloudflare → Workers & Pages
- Check if the GitHub repo still exists: github.com/ironlotus-duluth/sangha-books
- Try accessing the `.pages.dev` URL directly

### "Suggestions/votes aren't saving"

- The Google Apps Script deployment may have expired or been deleted
- Go to the Google Sheet → Extensions → Apps Script → Deploy → Manage deployments
- Check that there's an active deployment
- If needed, create a new deployment (Deploy → New deployment → Web app → Execute as Me → Anyone)
- **Important:** A new deployment creates a new URL. Update `API_URL` in `app.js` and push to GitHub

### "Admin page won't let me sign in"

- The Google Cloud OAuth client ID may have been deleted or the project disabled
- Go to console.cloud.google.com → select the "Sangha Book Group" project
- Go to APIs & Services → Credentials and verify the OAuth client ID exists
- Check that `sangha-books.pages.dev` (or your custom domain) is listed under Authorized JavaScript Origins
- Make sure the email you're signing in with is listed in `ADMIN_EMAILS` in the Apps Script

### "Confirmation emails aren't sending"

- Gmail has a daily sending limit (~100/day for regular accounts)
- Check the Apps Script execution log: Extensions → Apps Script → Executions
- Votes still save even if email fails — this is by design

### "I redeployed Apps Script and now nothing works"

- You got a new URL. Copy it from Deploy → Manage deployments
- Update `API_URL` in `app.js` (line 8)
- Commit and push to GitHub
- Wait 30 seconds for Cloudflare to redeploy

---

## If Starting Over From Scratch

If everything is lost and you need to rebuild:

1. **The website code** is on GitHub. As long as that repo exists, you have everything.
2. **The data** is in Google Sheets. Export it if you want a backup.
3. To redeploy: create a new Cloudflare Pages project pointing at the GitHub repo
4. To reconnect the backend: create a new Google Sheet, paste `apps-script.js` into Apps Script, deploy, update the URL in `app.js`

The `apps-script.js` file in the GitHub repo is always a copy of the backend code. Even if the Google Apps Script is deleted, you can recreate it from that file.

---

## Accounts and Credentials Needed

Anyone maintaining this system needs access to:

1. **`iron.lotus.sangha.duluth@gmail.com`** — This is the most important one. It controls the Google Sheet (all data), Apps Script (backend), Gmail (emails), and Google Cloud (admin auth).
2. **GitHub account `ironlotus-duluth`** — To update the website code. The SSH key for this account was set up on Jonathan's Mac (`~/.ssh/id_ironlotus`).
3. **Cloudflare account** — To manage the hosting. Logged in with the Iron Lotus email.

### If Jonathan Is No Longer Available

- All code is in the public GitHub repo — anyone can fork it
- All data is in the Google Sheet — export to CSV as a backup
- The system can be redeployed on any static hosting (Netlify, Vercel, even a simple web server) — it's just HTML files
- The only Google-specific part is the Apps Script backend, but that could be replaced with any server that reads/writes to a database

---

## Technical Details (for developers)

- **No build step.** The site is plain HTML, CSS, and vanilla JavaScript. No React, no npm, no bundler.
- **No server.** Cloudflare Pages serves static files. Google Apps Script is the only backend.
- **No database.** Google Sheets is the database. Simple, visible, editable by anyone with access.
- **CORS handling.** The frontend sends POST requests with `Content-Type: text/plain` to avoid CORS preflight requests (a browser security thing). This is intentional.
- **RCV runs client-side.** The ranked-choice voting calculation happens in the browser (`app.js` → `RCV.calculate()`), not on the server. The server just stores raw vote rankings.
- **Persistent sessions.** The round name and password are stored in localStorage (persists across tabs and browser restarts). Users only need to enter the password once. The Sign Out button clears it.
- **Client-side caching.** API responses are cached for 60 seconds (in memory + localStorage) to avoid redundant calls when navigating between pages. Cache clears automatically on sign-out or after submitting a suggestion/vote.
- **Combined API endpoint.** The `getRoundWithBooks` endpoint returns round info and book suggestions in a single request, cutting landing page and vote page load times roughly in half.

---

## Costs

Everything is free:

- Cloudflare Pages: free tier (unlimited sites, unlimited bandwidth)
- GitHub: free for public repos
- Google Sheets + Apps Script: free with any Google account
- Gmail sending: free (up to ~100 emails/day)
- Google Cloud OAuth: free (no billing required for basic OAuth)

There is nothing to renew or pay for. The only thing that could expire is the domain name, if you set up a custom one.

# Book Group Website: Handoff Guide

**For:** Bev, and anyone Bev asks to help keep the book group website running.
**Last updated:** October 2026

This guide is in three parts. **Part 1** is for Bev and needs no technical
knowledge. **Part 2** covers running a book vote, for whoever has the admin login.
**Part 3** is for a technically comfortable helper who needs to fix or change
something.

---

## Part 1: The Short Version (for Bev)

### What this is

**books.ironlot.us** is the small website the sangha uses to suggest books and
vote on what to read next. Jonathan built it in spring 2026. It is free to run
except for the web address, which costs a small fee each year.

### The website does not need anyone to keep it running

Nothing on it needs regular upkeep. If nobody touched it for two years, it would
most likely still work. The things that *could* go wrong are slow and
predictable, and they are listed below.

### What actually matters: four accounts

Everything lives in four online accounts. If someone you trust can get into
these, the website can always be recovered, fixed, or moved.

| Account | What it controls | How important |
|---|---|---|
| **Google**: `iron.lotus.sangha.duluth@gmail.com` | All the book data (a Google Sheet), the behind-the-scenes logic, the confirmation emails, and the admin login | **Most important.** With this account alone, someone can run votes and keep every past record. |
| **GitHub**: `ironlotus-duluth` | The website's code | Needed only to change how the site looks or works |
| **Cloudflare** (signed in with the Iron Lotus email) | Puts the website on the internet | Needed only if the site goes down |
| **Namecheap** (web address registrar) | Owns the name `ironlot.us` | Needed once a year to renew the name (next renewal: **May 28, 2027**) |

**Where the passwords are kept:** Jonathan will tell you this separately. It is
deliberately left out of this document, which is stored publicly with the website.

### If something happens and Jonathan isn't available

1. **Don't worry about losing anything.** All books, votes, and past rounds are
   saved in a Google Sheet called **"Sangha Book Group"** in the Google account
   above. They stay there whatever happens to the website.
2. **Find a helper** who is comfortable with computers and give them this
   document and the account access. Part 3 is written for them.
3. **If the web address stops working** (for example, the yearly renewal was
   missed), the same site is also at **sangha-books.pages.dev**.

### Plan B: running a vote with no website at all

If the website is ever unavailable and you need to pick a book, you can run the
same vote on paper or by email. Here is how it works:

1. Collect book suggestions. The current rule is **up to 2 per person**.
2. Each person lists their **top 3** books in order.
3. Score them: **1st choice = 3 points, 2nd = 2 points, 3rd = 1 point.**
4. Add up the points for each book. **The highest total wins.**
5. If two books tie, the one with more 1st-choice votes wins.

The website runs exactly this method. You never need it to choose a book.

---

## Part 2: Running a Book Vote

You need to be able to sign in to the Google account
`iron.lotus.sangha.duluth@gmail.com`.

### The lifecycle of a round

1. **Create the round.** Go to **books.ironlot.us/admin.html** and sign in with
   Google. Under "Create New Round", enter:
   - a **name** (e.g., "Winter 2027")
   - a **password** to share with the group (something simple, e.g., "lotus27")
   - **books per person**, which is how many suggestions each person may make.
     It defaults to 2.

   Click **Create Round**. Suggestions open automatically. Creating a round also
   closes any older round that is still open.
2. **Invite suggestions.** Send the group the link (books.ironlot.us) and the
   password.
3. **Check the list.** The admin page shows every suggested book. Add a short
   summary to any book that is missing one, so voters know what it is about.
   - **Too few books?** Raise "books per person" on the admin page (for
     example, to 3) and tell the group they can add more. You can also clear the
     box and click Save to remove the limit entirely.
   - **A mistaken or duplicate entry?** Open the Google Sheet, go to the
     **Suggestions** tab, and delete that row.
4. **Open voting.** On the admin page, click **Close Submissions**, then
   **Open Voting**. Tell the group it is time to vote.
5. **Wait about a week.** The **Results** page shows live standings and who has
   voted.
6. **Finish.** Click **Complete Round**. This closes voting and moves the round
   to "Past Rounds", which anyone can see without a password.

### Good to know

- **Members don't need accounts.** They only need the round password.
- **People type their own names,** so the per-person limit works on the honor
  system. "Jim" and "Jim B." would count as different people. The site ignores
  capitalization and extra spaces, so "jim" and "Jim" count as the same person.
- **Duplicate books are blocked.** If someone suggests a book that is already on
  the list, the site tells them who suggested it and asks for a different one.
  The duplicate doesn't count against their limit.
- **Email is optional when voting.** People who give an email get a
  confirmation and can't vote twice with that same address.
- **If an admin button seems to do nothing** and an "expired" message appears,
  sign out and sign back in. Google sign-ins last about an hour.

---

## Part 3: For a Technical Helper

### How it fits together

```
Browser ──► Cloudflare Pages (static HTML/CSS/JS, auto-deploys from GitHub main)
   │
   └──────► Google Apps Script web app (the only backend) ──► Google Sheet (the database)
                                                          └──► Gmail (vote confirmations)
```

- **No build step, no framework, no npm.** Every file is plain HTML, CSS, and
  vanilla JS that you can edit directly.
- **Code:** https://github.com/ironlotus-duluth/sangha-books (public)
- **Backend:** the Apps Script attached to the "Sangha Book Group" Google Sheet
  (Sheet → Extensions → Apps Script). `apps-script.js` in the repo is the
  reference copy, so keep the two in sync.
- **DNS:** `ironlot.us` is registered at Namecheap. Its nameservers point to
  Cloudflare, which serves `books.ironlot.us` from the Pages project
  `sangha-books`.
- **Admin auth:** Google Sign-In (OAuth client in the Google Cloud project
  "Sangha Book Group"). The backend checks the token and compares the email
  against `ADMIN_EMAILS` at the top of `apps-script.js`.

See `README.md` for the file-by-file layout and `MAINTENANCE.md` for older
troubleshooting notes.

### The Google Sheet

| Tab | Columns |
|---|---|
| **Rounds** | Round Name · Password · Submissions Open · Voting Open · Created · Completed · Max Per Person |
| **Suggestions** | Timestamp · Round · Submitter Name · Book Title · Author · Link · Summary |
| **Votes** | Timestamp · Round · Voter Name · Voter Email · Rankings JSON |

You can safely edit the sheet by hand. The site reads it live. Rows are linked
by the exact **round name**, so never rename a round in one tab without renaming
it in the others. A blank **Max Per Person** cell means no limit.

### Making changes

**To change the website (frontend):**
1. Edit the file on GitHub in the browser (open the file, click the pencil,
   then commit), or clone the repo and push to `main`. You don't need Jonathan's
   SSH key, because the GitHub web editor works when you're signed in as
   `ironlotus-duluth`.
2. Cloudflare deploys automatically within about a minute.

**To change the backend (`apps-script.js`):**
1. Open the Google Sheet → **Extensions → Apps Script**.
2. Replace the code with the new `apps-script.js` and save.
3. Go to **Deploy → Manage deployments → pencil icon → Version: New version →
   Deploy.** Editing the *existing* deployment keeps the same URL. Creating a
   *new* deployment changes the URL, and you would then have to update
   `API_URL` in `app.js`.
4. Commit the same `apps-script.js` to GitHub so the copies match.

**When both change in one update,** deploy the backend first. The backend is
written so the old website still works with it, but the new website expects the
new backend.

**To add another admin:** add their Gmail address to `ADMIN_EMAILS` in the Apps
Script, then redeploy as above.

### Common problems

| Symptom | Likely cause | Fix |
|---|---|---|
| Site doesn't load at all | Domain lapsed, or Cloudflare Pages project removed | Try sangha-books.pages.dev. Check Namecheap renewal and Cloudflare → Workers & Pages. |
| Site loads but can't log in or save | Apps Script deployment deleted, or Google account issue | Sheet → Extensions → Apps Script → Deploy → Manage deployments. Make sure one active Web app deployment exists (Execute as: Me; Access: Anyone). |
| Admin sign-in rejected | Email not in `ADMIN_EMAILS`, or the site's domain is missing from the OAuth client's "Authorized JavaScript origins" | Fix in Apps Script, or in Google Cloud Console → APIs & Services → Credentials |
| Confirmation emails stop | Gmail's daily limit (~100/day) or a revoked authorization | Apps Script → Executions shows the error. Votes still save. |
| Members see an old round | Their browser remembered last round's password | The site now detects this and asks for the new password. "Sign out" on the home page also clears it. |

### Starting over from nothing

All the code is in the GitHub repo, and all the data is in the Google Sheet
(File → Download → .xlsx or .csv for a backup). To rebuild, follow
`SETUP-GUIDE.md`: create a Sheet, paste `apps-script.js`, deploy it as a web
app, put the new URL in `app.js`, and host the files on any static host.

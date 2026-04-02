# Sangha Book Group — Setup Guide

This guide walks you through deploying the full system: GitHub repo, Cloudflare Pages, Google Sheets backend, Google Sign-In for admin, and Gmail-based email confirmations.

Total setup time: about 30–45 minutes.

---

## Overview

The system has three parts:

1. **Frontend** — Static HTML/CSS/JS files hosted on Cloudflare Pages, pulled from GitHub
2. **Backend** — Google Apps Script (attached to a Google Sheet) that stores data and sends emails
3. **Admin auth** — Google Sign-In so only you can manage rounds

---

## Part 1: Google Sheet + Apps Script

### 1a. Create the Google Sheet

1. Sign in to Google as **iron.lotus.sangha.duluth@gmail.com**
2. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
3. Name it **"Sangha Book Group"**
4. You don't need to add any tabs manually — the script creates them automatically on first use

### 1b. Add the Apps Script

1. In your spreadsheet, go to **Extensions → Apps Script**
2. Delete any existing code in the editor
3. Open the file `apps-script.js` from this project and copy-paste the entire contents
4. Update the `ADMIN_EMAILS` array at the top with your admin email addresses:
   ```javascript
   const ADMIN_EMAILS = [
     'iron.lotus.sangha.duluth@gmail.com',
     // add any co-admins here
   ];
   ```
5. **Save** the project (name it "Sangha Book Group Backend")

### 1c. Deploy as Web App

1. Click **Deploy → New deployment**
2. Click the gear icon → **Web app**
3. Set:
   - **Description:** Sangha Book Group API
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. Authorize when prompted (choose your Google account → Allow)
6. **Copy the Web App URL** — you'll need it in Part 3

> **Important:** Every time you edit the Apps Script code, you need to create a **new deployment** (Deploy → New deployment) for changes to take effect. The URL stays the same if you update an existing deployment (Deploy → Manage deployments → Edit → Version: New version → Deploy).

---

## Part 2: Google Cloud Console (for Admin Sign-In)

This step creates the Google Sign-In credentials so the admin page can verify your identity.

### 2a. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with **iron.lotus.sangha.duluth@gmail.com**
3. Click **Select a project → New Project**
4. Name it **"Sangha Book Group"** → Create
5. Make sure the new project is selected in the top dropdown

### 2b. Enable the OAuth Consent Screen

1. In the left sidebar: **APIs & Services → OAuth consent screen**
2. Choose **External** → Create
3. Fill in:
   - **App name:** Sangha Book Group
   - **User support email:** your email
   - **Developer contact:** your email
4. Click **Save and Continue** through the remaining steps (you can skip Scopes, Test users, etc.)
5. Click **Publish App** when ready (or leave in Testing mode if you prefer — testing mode only allows explicitly listed test users)

### 2c. Create OAuth Client ID

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: **Sangha Book Group Web**
5. Under **Authorized JavaScript origins**, add:
   - `https://your-site-name.pages.dev` (your Cloudflare Pages URL — you'll get this in Part 3)
   - `http://localhost:8080` (for local testing)
6. Click **Create**
7. **Copy the Client ID** — it looks like: `123456789-abcdef.apps.googleusercontent.com`

---

## Part 3: Configure the Frontend

### 3a. Update `app.js`

Open `app.js` and replace the two placeholder values near the top:

```javascript
const API_URL = 'https://script.google.com/macros/s/YOUR_ACTUAL_URL/exec';
const GOOGLE_CLIENT_ID = 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com';
```

### 3b. Update `apps-script.js`

Also update the `GOOGLE_CLIENT_ID` in the Apps Script code (in the Google Apps Script editor):

```javascript
const GOOGLE_CLIENT_ID = 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com';
```

Then re-deploy the Apps Script (Deploy → Manage deployments → Edit → New version → Deploy).

---

## Part 4: GitHub + Cloudflare Pages

### 4a. Push to GitHub

1. Create a new GitHub repository (e.g., `sangha-books`)
2. Push these files to the repo:
   ```
   index.html
   books.html
   suggest.html
   vote.html
   results.html
   history.html
   admin.html
   styles.css
   app.js
   ```
   (Don't include `apps-script.js` or this setup guide — those aren't part of the website)

### 4b. Connect to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create**
2. Select the **Pages** tab → **Connect to Git**
3. Authorize Cloudflare to access your GitHub account
4. Select your `sangha-books` repository
5. Configure:
   - **Project name:** sangha-books (this becomes your `sangha-books.pages.dev` URL)
   - **Production branch:** main
   - **Build command:** (leave blank — no build step needed)
   - **Build output directory:** `/` (or leave blank)
6. Click **Save and Deploy**

### 4c. Update Google Cloud with your Cloudflare URL

Once deployed, go back to the Google Cloud Console:
1. **APIs & Services → Credentials → Your OAuth Client**
2. Add your Cloudflare URL to **Authorized JavaScript origins**:
   - `https://sangha-books.pages.dev`
3. Save

---

## Part 5: Test It Out

### As a member:
1. Go to your Cloudflare Pages URL
2. You'll see the password gate — but there's no round yet!

### As admin (create the first round):
1. Go to `https://sangha-books.pages.dev/admin.html`
2. Sign in with your Google account
3. Create a new round:
   - **Round Name:** e.g., "Spring 2026"
   - **Round Password:** e.g., "dharma2026"
4. The round starts with submissions open and voting closed

### As a member (now try again):
1. Go to the main page and enter the round password
2. Submit a book suggestion
3. When you (as admin) open voting, members can rank and vote

### Typical round flow:
1. **Admin** creates a round with a password
2. **Admin** shares the link and password with the group
3. **Members** submit book suggestions
4. **Admin** closes submissions and opens voting
5. **Members** rank books and submit votes
6. **Admin** (and members) view live results on the results page
7. **Admin** completes the round — it moves to history

---

## Troubleshooting

**"Invalid password" on login:** Make sure the password matches exactly (case-sensitive) what you set when creating the round.

**Admin sign-in doesn't work:** Check that your email is in the `ADMIN_EMAILS` list in the Apps Script code and that the Google Client ID matches in both `app.js` and the Apps Script.

**Changes not showing after code edit:** If you edit the Apps Script, you must create a new deployment version. If you edit the frontend files, push to GitHub and Cloudflare will auto-deploy.

**Email not sending:** The Gmail account running the Apps Script must have Gmail enabled. The free tier allows ~100 emails/day.

---

## Optional: Custom Domain

If you want a custom domain (e.g., `books.ironlotussangha.org`):
1. In Cloudflare Pages, go to your project → **Custom domains**
2. Add your domain
3. Update DNS as instructed
4. Remember to add the new domain to your Google Cloud OAuth authorized origins

---

That's it! The whole system is: a Google Sheet, a Google Apps Script, and a handful of HTML files on Cloudflare.

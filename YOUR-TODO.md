# Your Setup Checklist

What's already done, and what you need to finish.

---

## Already Done (by Claude)

- [x] GitHub repo created: https://github.com/ironlotus-duluth/sangha-books
- [x] Cloudflare Workers & Pages app installed on your GitHub account
- [x] All project files built (9 frontend files + Apps Script backend)
- [x] Ranked-choice voting algorithm tested and working

---

## Step 1: Set up SSH for ironlotus-duluth (~5 min)

You already have SSH keys for `drh.jwinters` (work) and `winjoda` (personal). Here's how to add `ironlotus-duluth` as a third identity.

### 1a. Generate a new SSH key

```bash
ssh-keygen -t ed25519 -C "iron.lotus.sangha.duluth@gmail.com" -f ~/.ssh/id_ironlotus
```

When prompted for a passphrase, hit Enter for none (or set one if you prefer).

### 1b. Add it to your SSH config

```bash
cat >> ~/.ssh/config << 'EOF'

# Iron Lotus Sangha (GitHub: ironlotus-duluth)
Host github-ironlotus
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ironlotus
  IdentitiesOnly yes
EOF
```

### 1c. Add the public key to GitHub

```bash
cat ~/.ssh/id_ironlotus.pub | pbcopy
```

Then:
1. Go to https://github.com/settings/keys (make sure you're logged in as **ironlotus-duluth**)
2. Click **New SSH key**
3. Title: `Jonathan's Mac`
4. Paste the key → **Add SSH key**

### 1d. Test it

```bash
ssh -T github-ironlotus
```

You should see: `Hi ironlotus-duluth! You've successfully authenticated...`

---

## Step 2: Push the project files to GitHub (~3 min)

The project files are in your Cowork outputs folder. Copy them to a local project directory and push.

Note: we use `github-ironlotus` (the SSH host alias) instead of `github.com` so git uses the right SSH key.

```bash
# Create local project folder
mkdir -p ~/llm-projects/sangha-books
cd ~/llm-projects/sangha-books

# Initialize git and connect to the repo using the SSH alias
git init
git remote add origin git@github-ironlotus:ironlotus-duluth/sangha-books.git
git pull origin main

# Copy the project files from your Cowork outputs folder into this directory.
# The files you need are:
#   index.html, books.html, suggest.html, vote.html, results.html,
#   history.html, admin.html, styles.css, app.js
#
# On Mac, the Cowork outputs folder is typically at:
#   ~/Library/Application Support/Claude/cowork/outputs/sangha-books/
#
# Copy all .html, .css, and .js files (NOT apps-script.js, SETUP-GUIDE.md, or YOUR-TODO.md):
cp ~/Library/Application\ Support/Claude/cowork/outputs/sangha-books/*.html .
cp ~/Library/Application\ Support/Claude/cowork/outputs/sangha-books/*.css .
cp ~/Library/Application\ Support/Claude/cowork/outputs/sangha-books/app.js .

# Set the git identity for this repo only (so commits use the right account)
git config user.name "Iron Lotus Sangha"
git config user.email "iron.lotus.sangha.duluth@gmail.com"

# Commit and push
git add index.html books.html suggest.html vote.html results.html history.html admin.html styles.css app.js
git commit -m "Initial commit: book group app with ranked-choice voting"
git push -u origin main
```

---

## Step 3: Connect Cloudflare Pages to GitHub (~2 min)

I already installed the Cloudflare GitHub app on your account. Now just create the Pages project:

1. Go to: https://dash.cloudflare.com → Workers & Pages → Create application
2. Click **Connect GitHub** (it may open a popup — allow it)
3. Select the **ironlotus-duluth** account
4. Select the **sangha-books** repository
5. Configure the build:
   - **Project name:** `sangha-books`
   - **Production branch:** `main`
   - **Build command:** (leave blank)
   - **Build output directory:** `/`
6. Click **Save and Deploy**

Your site will be live at: **https://sangha-books.pages.dev**

---

## Step 4: Set up Google Sheet + Apps Script (~10 min)

1. Sign in to Google as **iron.lotus.sangha.duluth@gmail.com**
2. Create a new Google Sheet — name it **"Sangha Book Group"**
3. Go to **Extensions → Apps Script**
4. Delete any existing code and paste the contents of `apps-script.js` from your outputs folder
5. Click **Save** (name the project "Sangha Book Group Backend")
6. Click **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click **Deploy** and authorize when prompted
8. **Copy the Web App URL** (e.g., `https://script.google.com/macros/s/ABC.../exec`)

---

## Step 5: Set up Google Cloud OAuth (for admin page) (~10 min)

1. Go to https://console.cloud.google.com
2. Create a new project: **"Sangha Book Group"**
3. Go to **APIs & Services → OAuth consent screen**
   - Choose **External** → Create
   - App name: Sangha Book Group
   - User support email + developer contact: your email
   - Save through remaining steps
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Type: **Web application**
   - Name: Sangha Book Group Web
   - Authorized JavaScript origins:
     - `https://sangha-books.pages.dev`
     - `http://localhost:8080` (for testing)
5. **Copy the Client ID** (e.g., `123456789-abcdef.apps.googleusercontent.com`)

---

## Step 6: Wire everything together (~5 min)

Edit **two files** with your real URLs:

### In `app.js` (your local repo, then push):
```javascript
const API_URL = 'https://script.google.com/macros/s/YOUR_ACTUAL_URL/exec';
const GOOGLE_CLIENT_ID = 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com';
```

### In the Apps Script editor (Google Sheets → Extensions → Apps Script):
```javascript
const GOOGLE_CLIENT_ID = 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com';
```
Then re-deploy the Apps Script: Deploy → Manage deployments → Edit → New version → Deploy

### Push the update:
```bash
cd ~/llm-projects/sangha-books
git add app.js
git commit -m "Add API URL and Google Client ID"
git push origin main
```

Cloudflare auto-deploys within ~30 seconds of each push.

---

## Step 7: Create your first round! (~1 min)

1. Go to `https://sangha-books.pages.dev/admin.html`
2. Sign in with your Google account
3. Create a round:
   - **Round Name:** e.g., "Spring 2026"
   - **Round Password:** e.g., "dharma2026"
4. Share the link (`https://sangha-books.pages.dev`) and password with Bev, Jim, and the group

---

## Summary of what you'll end up with

| What | Where |
|------|-------|
| Live site | https://sangha-books.pages.dev |
| Source code | https://github.com/ironlotus-duluth/sangha-books |
| Data | Google Sheet ("Sangha Book Group") |
| Admin panel | https://sangha-books.pages.dev/admin.html |
| Email sending | Gmail via iron.lotus.sangha.duluth@gmail.com |

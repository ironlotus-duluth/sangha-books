// ============================================================
// SANGHA BOOK GROUP — Google Apps Script Backend
// Paste this entire file into Extensions → Apps Script
// ============================================================

// ---------- CONFIGURATION ----------

// Add your authorized admin Gmail addresses here
const ADMIN_EMAILS = [
  'iron.lotus.sangha.duluth@gmail.com',
  // Add more admin emails as needed
];

// Google OAuth Client ID (from Google Cloud Console)
// Needed to verify admin sign-in tokens
const GOOGLE_CLIENT_ID = '899264795528-7kms1n19ftmfdgj41e4gnds45d2uls37.apps.googleusercontent.com';

// Default cap on book suggestions per person for new rounds (0 = no limit).
// Each round stores its own cap in the Rounds sheet ("Max Per Person", column G),
// so it can be raised mid-round from the admin page or by editing that cell.
const DEFAULT_MAX_PER_PERSON = 2;

// ---------- SHEET HELPERS ----------

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    switch (name) {
      case 'Rounds':
        sheet.appendRow(['Round Name', 'Password', 'Submissions Open', 'Voting Open', 'Created', 'Completed', 'Max Per Person']);
        break;
      case 'Suggestions':
        sheet.appendRow(['Timestamp', 'Round', 'Submitter Name', 'Book Title', 'Author', 'Link', 'Summary']);
        break;
      case 'Votes':
        sheet.appendRow(['Timestamp', 'Round', 'Voter Name', 'Voter Email', 'Rankings JSON']);
        break;
      case 'History':
        sheet.appendRow(['Round', 'Winner Title', 'Winner Author', 'Date Completed', 'Total Voters', 'Total Books']);
        break;
      case 'Settings':
        sheet.appendRow(['Key', 'Value']);
        sheet.appendRow(['adminEmails', ADMIN_EMAILS.join(',')]);
        break;
    }
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

// ---------- ROUND MANAGEMENT ----------

function getCurrentRound() {
  const rounds = sheetToObjects(getSheet('Rounds'));
  // Find the most recent round that isn't completed
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (!rounds[i]['Completed']) return rounds[i];
  }
  return null;
}

function getRoundByName(name) {
  const rounds = sheetToObjects(getSheet('Rounds'));
  return rounds.find(r => r['Round Name'] === name) || null;
}

// Rounds sheets created before the per-person cap existed lack column G's header
function ensureMaxPerPersonColumn(sheet) {
  if (sheet.getRange(1, 7).getValue() !== 'Max Per Person') {
    sheet.getRange(1, 7).setValue('Max Per Person');
  }
}

// 0 means no limit (also the case for older rounds with a blank cell)
function getMaxPerPerson(round) {
  const n = parseInt(round['Max Per Person'], 10);
  return n > 0 ? n : 0;
}

function isOpen(value) {
  return value === true || value === 'TRUE';
}

// Shape returned to the frontend for a round
function roundInfo(round) {
  return {
    name: round['Round Name'],
    submissionsOpen: isOpen(round['Submissions Open']),
    votingOpen: isOpen(round['Voting Open']),
    created: round['Created'],
    completed: !!round['Completed'],
    maxPerPerson: getMaxPerPerson(round)
  };
}

// Loose comparison keys: case/punctuation/spacing-insensitive
function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Compares main titles only, so "Not Always So" matches "Not Always So: Practicing..."
function normalizeTitle(title) {
  return String(title || '').split(':')[0].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function validateRoundPassword(roundName, password) {
  const round = getRoundByName(roundName);
  if (!round) return false;
  return round['Password'] === password;
}

// ---------- ADMIN AUTH ----------

function verifyGoogleToken(idToken) {
  try {
    const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + idToken;
    const response = UrlFetchApp.fetch(url);
    const payload = JSON.parse(response.getContentText());

    if (payload.aud !== GOOGLE_CLIENT_ID) return null;

    const email = payload.email;
    const adminEmails = ADMIN_EMAILS.map(e => e.toLowerCase());
    if (adminEmails.includes(email.toLowerCase())) {
      return email;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ---------- GET HANDLER ----------

function doGet(e) {
  const action = e.parameter.action;
  let result;

  try {
    switch (action) {

      case 'getRound': {
        const roundName = e.parameter.round;
        const password = e.parameter.password;
        const round = roundName ? getRoundByName(roundName) : getCurrentRound();
        if (!round) {
          result = { error: 'No active round found.' };
          break;
        }
        if (!password || round['Password'] !== password) {
          result = { error: 'Invalid password.' };
          break;
        }
        result = roundInfo(round);
        break;
      }

      case 'getRoundWithBooks': {
        // Combined endpoint: returns round info + book suggestions in one call
        const rwbRoundName = e.parameter.round;
        const rwbPassword = e.parameter.password;
        const rwbRound = rwbRoundName ? getRoundByName(rwbRoundName) : getCurrentRound();
        if (!rwbRound) {
          result = { error: 'No active round found.' };
          break;
        }
        if (!rwbPassword || rwbRound['Password'] !== rwbPassword) {
          result = { error: 'Invalid password.' };
          break;
        }
        const rwbName = rwbRound['Round Name'];
        const rwbSuggestions = sheetToObjects(getSheet('Suggestions'));
        result = {
          round: roundInfo(rwbRound),
          books: rwbSuggestions
            .filter(s => s['Round'] === rwbName)
            .map(s => ({
              submitter: s['Submitter Name'],
              title: s['Book Title'],
              author: s['Author'],
              link: s['Link'],
              summary: s['Summary']
            }))
        };
        break;
      }

      case 'getSuggestions': {
        const roundName = e.parameter.round;
        const password = e.parameter.password;
        if (!validateRoundPassword(roundName, password)) {
          result = { error: 'Invalid password.' };
          break;
        }
        const all = sheetToObjects(getSheet('Suggestions'));
        result = all
          .filter(s => s['Round'] === roundName)
          .map(s => ({
            submitter: s['Submitter Name'],
            title: s['Book Title'],
            author: s['Author'],
            link: s['Link'],
            summary: s['Summary']
          }));
        break;
      }

      case 'getVotes': {
        const roundName = e.parameter.round;
        const password = e.parameter.password;
        if (!validateRoundPassword(roundName, password)) {
          result = { error: 'Invalid password.' };
          break;
        }
        const all = sheetToObjects(getSheet('Votes'));
        const roundVotes = all.filter(v => v['Round'] === roundName);
        result = roundVotes.map(v => ({
          voter: v['Voter Name'],
          rankings: JSON.parse(v['Rankings JSON'] || '[]')
        }));
        break;
      }

      case 'getHistory': {
        // History is public (no password needed — it's past rounds)
        // Cache for 5 minutes since completed rounds rarely change
        const cache = CacheService.getScriptCache();
        const cachedHistory = cache.get('history');
        if (cachedHistory) {
          result = JSON.parse(cachedHistory);
          break;
        }

        const rounds = sheetToObjects(getSheet('Rounds'));
        const suggestions = sheetToObjects(getSheet('Suggestions'));
        const votes = sheetToObjects(getSheet('Votes'));

        result = rounds
          .filter(r => r['Completed'])
          .map(r => {
            const roundBooks = suggestions.filter(s => s['Round'] === r['Round Name']);
            const roundVotes = votes.filter(v => v['Round'] === r['Round Name']);
            return {
              name: r['Round Name'],
              completed: r['Completed'],
              totalBooks: roundBooks.length,
              totalVoters: roundVotes.length,
              books: roundBooks.map(b => ({
                title: b['Book Title'],
                author: b['Author'],
                summary: b['Summary']
              }))
            };
          })
          .reverse(); // Most recent first

        // Cache for 5 minutes (300 seconds)
        try { cache.put('history', JSON.stringify(result), 300); } catch (e) {}
        break;
      }

      case 'adminGetRounds': {
        const token = e.parameter.token;
        if (!verifyGoogleToken(token)) {
          result = { error: 'Unauthorized.' };
          break;
        }
        const rounds = sheetToObjects(getSheet('Rounds'));
        result = rounds.map(r => Object.assign(roundInfo(r), {
          password: r['Password'],
          completed: r['Completed']
        }));
        break;
      }

      default:
        result = { error: 'Unknown action.' };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- POST HANDLER ----------

function doPost(e) {
  let result;

  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    switch (action) {

      case 'suggest': {
        const round = getRoundByName(data.round);
        if (!round || round['Password'] !== data.password) {
          result = { error: 'Invalid round or password.' };
          break;
        }
        if (round['Completed'] || !isOpen(round['Submissions Open'])) {
          result = { error: 'Submissions are closed for this round.' };
          break;
        }

        // Lock so two simultaneous submissions can't both slip past the checks below
        const sLock = LockService.getScriptLock();
        sLock.waitLock(20000);
        try {
          const sugSheet = getSheet('Suggestions');
          const roundBooks = sheetToObjects(sugSheet).filter(s => s['Round'] === data.round);

          // Same book already on the list? Doesn't count against the person's limit.
          const titleKey = normalizeTitle(data.bookTitle);
          const dup = roundBooks.find(s => normalizeTitle(s['Book Title']) === titleKey);
          if (titleKey && dup) {
            result = {
              error: '"' + dup['Book Title'] + '" is already on the list (suggested by ' +
                dup['Submitter Name'] + ') — great minds! Please choose a different book.'
            };
            break;
          }

          const limit = getMaxPerPerson(round);
          const nameKey = normalizeName(data.submitterName);
          const already = roundBooks.filter(s => normalizeName(s['Submitter Name']) === nameKey).length;
          if (limit && already >= limit) {
            result = {
              error: 'You\'ve already suggested ' + already + ' book' + (already !== 1 ? 's' : '') +
                ' this round, which is the limit for now. If we need more titles, we\'ll open it up and let everyone know.',
              limitReached: true
            };
            break;
          }

          sugSheet.appendRow([
            new Date().toISOString(),
            data.round,
            data.submitterName,
            data.bookTitle,
            data.author,
            data.link || '',
            data.summary || ''
          ]);
          result = { success: true, count: already + 1, limit: limit };
        } finally {
          sLock.releaseLock();
        }
        break;
      }

      case 'vote': {
        const round = getRoundByName(data.round);
        if (!round || round['Password'] !== data.password) {
          result = { error: 'Invalid round or password.' };
          break;
        }
        if (round['Completed'] || !isOpen(round['Voting Open'])) {
          result = { error: 'Voting is not open for this round.' };
          break;
        }

        const vLock = LockService.getScriptLock();
        vLock.waitLock(20000);
        try {
          // Check for duplicate voter (by email, if provided)
          // Uses TextFinder for targeted search instead of reading entire sheet.
          // matchEntireCell so "bo@x.com" doesn't match "jimbo@x.com".
          if (data.voterEmail) {
            const votesSheet = getSheet('Votes');
            const finder = votesSheet.createTextFinder(data.voterEmail.trim()).matchCase(false).matchEntireCell(true);
            const matches = finder.findAll();
            for (const cell of matches) {
              const row = cell.getRow();
              const rowRound = votesSheet.getRange(row, 2).getValue(); // Column B = Round
              if (rowRound === data.round) {
                result = { error: 'You have already voted in this round. Each person may vote once.' };
                break;
              }
            }
            if (result) break;
          }

          getSheet('Votes').appendRow([
            new Date().toISOString(),
            data.round,
            data.voterName,
            data.voterEmail || '',
            JSON.stringify(data.rankings)
          ]);
        } finally {
          vLock.releaseLock();
        }

        // Send confirmation email if email provided
        if (data.voterEmail) {
          try {
            const rankList = data.rankings.map((t, i) => (i + 1) + '. ' + t).join('\n');
            const resultsUrl = data.resultsUrl || '';

            GmailApp.sendEmail(
              data.voterEmail,
              'Your Vote — ' + data.round + ' — Iron Lotus Sangha',
              'Hi ' + data.voterName + ',\n\n' +
              'Thank you for voting in "' + data.round + '"!\n\n' +
              'Here is how you ranked the books:\n\n' +
              rankList + '\n\n' +
              (resultsUrl ? 'Check the current standings anytime:\n' + resultsUrl + '\n\n' : '') +
              'With gratitude,\nIron Lotus Sangha',
              {
                name: 'Iron Lotus Sangha',
                htmlBody:
                  '<p>Hi ' + escapeHtml(data.voterName) + ',</p>' +
                  '<p>Thank you for voting in <strong>"' + escapeHtml(data.round) + '"</strong>!</p>' +
                  '<p>Here is how you ranked the books:</p>' +
                  '<ol>' + data.rankings.map(t => '<li>' + escapeHtml(t) + '</li>').join('') + '</ol>' +
                  (resultsUrl ? '<p><a href="' + escapeHtml(resultsUrl) + '">Check the current standings anytime</a></p>' : '') +
                  '<p>With gratitude,<br>Iron Lotus Sangha</p>'
              }
            );
          } catch (emailErr) {
            // Vote still counts even if email fails
            Logger.log('Email send failed: ' + emailErr.message);
          }
        }

        result = { success: true };
        break;
      }

      // ---------- ADMIN ACTIONS ----------

      case 'adminCreateRound': {
        if (!verifyGoogleToken(data.token)) {
          result = { error: 'Unauthorized.' };
          break;
        }
        const sheet = getSheet('Rounds');
        const rounds = sheetToObjects(sheet);
        // Reusing a name would mix the new round's books and votes with the old one's
        if (rounds.some(r => normalizeName(r['Round Name']) === normalizeName(data.roundName))) {
          result = { error: 'A round named "' + data.roundName + '" already exists. Please choose a different name.' };
          break;
        }
        ensureMaxPerPersonColumn(sheet);

        // Close any currently open round
        rounds.forEach((r, i) => {
          if (!r['Completed']) {
            sheet.getRange(i + 2, 6).setValue(new Date().toISOString()); // Mark completed
          }
        });

        sheet.appendRow([
          data.roundName,
          data.roundPassword,
          'TRUE',   // Submissions open by default
          'FALSE',  // Voting closed by default
          new Date().toISOString(),
          '',        // Not completed
          data.maxPerPerson === undefined ? DEFAULT_MAX_PER_PERSON : (parseInt(data.maxPerPerson, 10) || '')
        ]);
        result = { success: true };
        break;
      }

      case 'adminToggleSubmissions': {
        if (!verifyGoogleToken(data.token)) {
          result = { error: 'Unauthorized.' };
          break;
        }
        const sSheet = getSheet('Rounds');
        const sRounds = sheetToObjects(sSheet);
        const sIdx = sRounds.findIndex(r => r['Round Name'] === data.roundName);
        if (sIdx === -1) { result = { error: 'Round not found.' }; break; }
        const newVal = data.open ? 'TRUE' : 'FALSE';
        sSheet.getRange(sIdx + 2, 3).setValue(newVal); // Column C = Submissions Open
        result = { success: true };
        break;
      }

      case 'adminToggleVoting': {
        if (!verifyGoogleToken(data.token)) {
          result = { error: 'Unauthorized.' };
          break;
        }
        const vSheet = getSheet('Rounds');
        const vRounds = sheetToObjects(vSheet);
        const vIdx = vRounds.findIndex(r => r['Round Name'] === data.roundName);
        if (vIdx === -1) { result = { error: 'Round not found.' }; break; }
        const vNewVal = data.open ? 'TRUE' : 'FALSE';
        vSheet.getRange(vIdx + 2, 4).setValue(vNewVal); // Column D = Voting Open
        result = { success: true };
        break;
      }

      case 'adminCompleteRound': {
        if (!verifyGoogleToken(data.token)) {
          result = { error: 'Unauthorized.' };
          break;
        }
        const cSheet = getSheet('Rounds');
        const cRounds = sheetToObjects(cSheet);
        const cIdx = cRounds.findIndex(r => r['Round Name'] === data.roundName);
        if (cIdx === -1) { result = { error: 'Round not found.' }; break; }
        cSheet.getRange(cIdx + 2, 3).setValue('FALSE'); // Column C = Submissions Open
        cSheet.getRange(cIdx + 2, 4).setValue('FALSE'); // Column D = Voting Open
        cSheet.getRange(cIdx + 2, 6).setValue(new Date().toISOString()); // Mark completed
        CacheService.getScriptCache().remove('history'); // Show it in Past Rounds right away
        result = { success: true };
        break;
      }

      case 'adminSetMaxPerPerson': {
        if (!verifyGoogleToken(data.token)) {
          result = { error: 'Unauthorized.' };
          break;
        }
        const mSheet = getSheet('Rounds');
        const mRounds = sheetToObjects(mSheet);
        const mIdx = mRounds.findIndex(r => r['Round Name'] === data.roundName);
        if (mIdx === -1) { result = { error: 'Round not found.' }; break; }
        ensureMaxPerPersonColumn(mSheet);
        const mVal = parseInt(data.maxPerPerson, 10);
        mSheet.getRange(mIdx + 2, 7).setValue(mVal > 0 ? mVal : ''); // Column G; blank = no limit
        result = { success: true, maxPerPerson: mVal > 0 ? mVal : 0 };
        break;
      }

      case 'adminUpdateSummary': {
        if (!verifyGoogleToken(data.token)) {
          result = { error: 'Unauthorized.' };
          break;
        }
        const uSheet = getSheet('Suggestions');
        const uAll = sheetToObjects(uSheet);
        const uIdx = uAll.findIndex(
          s => s['Round'] === data.round && s['Book Title'] === data.bookTitle
        );
        if (uIdx === -1) { result = { error: 'Book not found.' }; break; }
        uSheet.getRange(uIdx + 2, 7).setValue(data.summary); // Column G = Summary
        result = { success: true };
        break;
      }

      default:
        result = { error: 'Unknown action.' };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

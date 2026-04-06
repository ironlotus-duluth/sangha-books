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

// ---------- SHEET HELPERS ----------

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    switch (name) {
      case 'Rounds':
        sheet.appendRow(['Round Name', 'Password', 'Submissions Open', 'Voting Open', 'Created', 'Completed']);
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
        result = {
          name: round['Round Name'],
          submissionsOpen: round['Submissions Open'] === true || round['Submissions Open'] === 'TRUE',
          votingOpen: round['Voting Open'] === true || round['Voting Open'] === 'TRUE',
          created: round['Created']
        };
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
          round: {
            name: rwbName,
            submissionsOpen: rwbRound['Submissions Open'] === true || rwbRound['Submissions Open'] === 'TRUE',
            votingOpen: rwbRound['Voting Open'] === true || rwbRound['Voting Open'] === 'TRUE',
            created: rwbRound['Created']
          },
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
        result = rounds.map(r => ({
          name: r['Round Name'],
          password: r['Password'],
          submissionsOpen: r['Submissions Open'] === true || r['Submissions Open'] === 'TRUE',
          votingOpen: r['Voting Open'] === true || r['Voting Open'] === 'TRUE',
          created: r['Created'],
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
        if (!(round['Submissions Open'] === true || round['Submissions Open'] === 'TRUE')) {
          result = { error: 'Submissions are closed for this round.' };
          break;
        }

        getSheet('Suggestions').appendRow([
          new Date().toISOString(),
          data.round,
          data.submitterName,
          data.bookTitle,
          data.author,
          data.link || '',
          data.summary || ''
        ]);
        result = { success: true };
        break;
      }

      case 'vote': {
        const round = getRoundByName(data.round);
        if (!round || round['Password'] !== data.password) {
          result = { error: 'Invalid round or password.' };
          break;
        }
        if (!(round['Voting Open'] === true || round['Voting Open'] === 'TRUE')) {
          result = { error: 'Voting is not open for this round.' };
          break;
        }

        // Check for duplicate voter (by email, if provided)
        // Uses TextFinder for targeted search instead of reading entire sheet
        if (data.voterEmail) {
          const votesSheet = getSheet('Votes');
          const finder = votesSheet.createTextFinder(data.voterEmail.toLowerCase()).matchCase(false);
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
                  '<p>Hi ' + data.voterName + ',</p>' +
                  '<p>Thank you for voting in <strong>"' + data.round + '"</strong>!</p>' +
                  '<p>Here is how you ranked the books:</p>' +
                  '<ol>' + data.rankings.map(t => '<li>' + t + '</li>').join('') + '</ol>' +
                  (resultsUrl ? '<p><a href="' + resultsUrl + '">Check the current standings anytime</a></p>' : '') +
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
        // Close any currently open round
        const sheet = getSheet('Rounds');
        const rounds = sheetToObjects(sheet);
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
          ''         // Not completed
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
        cSheet.getRange(cIdx + 2, 5).setValue('FALSE'); // Close submissions
        cSheet.getRange(cIdx + 2, 4).setValue('FALSE'); // Close voting
        cSheet.getRange(cIdx + 2, 6).setValue(new Date().toISOString()); // Mark completed
        result = { success: true };
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

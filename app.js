// ============================================================
// SANGHA BOOK GROUP — Shared JavaScript
// API client, auth, ranked choice voting, utilities
// ============================================================

// ---------- CONFIGURATION ----------
// Replace with your deployed Apps Script URL
const API_URL = 'https://script.google.com/macros/s/AKfycbxIZoJacbIAYW9ZbA1e1L2YWjeGZIWu78nDyAjGisJNb82k8Lovqo4VNzKu0lPrzkZ0vQ/exec';

// Replace with your Google OAuth Client ID (for admin pages only)
const GOOGLE_CLIENT_ID = '899264795528-7kms1n19ftmfdgj41e4gnds45d2uls37.apps.googleusercontent.com';

// ---------- SESSION (round password — persists across tabs/sessions) ----------

const Session = {
  getRound() {
    return localStorage.getItem('sb_round') || '';
  },
  getPassword() {
    return localStorage.getItem('sb_password') || '';
  },
  set(round, password) {
    localStorage.setItem('sb_round', round);
    localStorage.setItem('sb_password', password);
  },
  clear() {
    localStorage.removeItem('sb_round');
    localStorage.removeItem('sb_password');
    DataCache.clear();
  },
  isAuthenticated() {
    return !!(this.getRound() && this.getPassword());
  }
};

// ---------- DATA CACHE (in-memory + localStorage, 60s TTL) ----------

const DataCache = {
  _mem: {},
  TTL: 60000, // 60 seconds

  get(key) {
    // Try memory first
    if (this._mem[key] && Date.now() - this._mem[key].ts < this.TTL) {
      return this._mem[key].data;
    }
    // Try localStorage
    try {
      const raw = localStorage.getItem('sb_cache_' + key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts < this.TTL) {
          this._mem[key] = parsed;
          return parsed.data;
        }
        localStorage.removeItem('sb_cache_' + key);
      }
    } catch (e) {}
    return null;
  },

  set(key, data) {
    const entry = { data, ts: Date.now() };
    this._mem[key] = entry;
    try { localStorage.setItem('sb_cache_' + key, JSON.stringify(entry)); } catch (e) {}
  },

  clear() {
    this._mem = {};
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb_cache_')) localStorage.removeItem(k);
      });
    } catch (e) {}
  }
};

// ---------- API CLIENT ----------

const API = {
  async get(action, extraParams = {}) {
    const params = new URLSearchParams({
      action,
      round: Session.getRound(),
      password: Session.getPassword(),
      ...extraParams
    });
    const resp = await fetch(`${API_URL}?${params}`);
    return resp.json();
  },

  async post(data) {
    data.round = data.round || Session.getRound();
    data.password = data.password || Session.getPassword();
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // text/plain avoids CORS preflight
      body: JSON.stringify(data)
    });
    return resp.json();
  },

  async getRound(round, password) {
    const cacheKey = 'round_' + (round || 'current');
    const cached = DataCache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({ action: 'getRound', round: round || '', password });
    const resp = await fetch(`${API_URL}?${params}`);
    const data = await resp.json();
    if (!data.error) DataCache.set(cacheKey, data);
    return data;
  },

  /**
   * Combined endpoint: fetches round info + books in a single request.
   * Falls back to two parallel calls if backend hasn't been updated yet.
   */
  async getRoundWithBooks(round, password) {
    const cacheKey = 'roundWithBooks_' + (round || 'current');
    const cached = DataCache.get(cacheKey);
    if (cached) return cached;

    try {
      const params = new URLSearchParams({
        action: 'getRoundWithBooks',
        round: round || '',
        password
      });
      const resp = await fetch(`${API_URL}?${params}`);
      const data = await resp.json();
      if (!data.error && data.round) {
        DataCache.set(cacheKey, data);
        return data;
      }
      // If error or unexpected shape, fall back
    } catch (e) {}

    // Fallback: parallel calls
    const [roundData, books] = await Promise.all([
      this.getRound(round, password),
      this.getSuggestions()
    ]);
    const combined = { round: roundData, books: Array.isArray(books) ? books : [] };
    if (!roundData.error) DataCache.set(cacheKey, combined);
    return combined;
  },

  async getSuggestions() {
    const cacheKey = 'suggestions';
    const cached = DataCache.get(cacheKey);
    if (cached) return cached;

    const data = await this.get('getSuggestions');
    if (Array.isArray(data)) DataCache.set(cacheKey, data);
    return data;
  },

  async getVotes() {
    return this.get('getVotes');
  },

  async getHistory() {
    const cacheKey = 'history';
    const cached = DataCache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({ action: 'getHistory' });
    const resp = await fetch(`${API_URL}?${params}`);
    const data = await resp.json();
    if (!data.error) DataCache.set(cacheKey, data);
    return data;
  },

  async submitSuggestion(data) {
    return this.post({ action: 'suggest', ...data });
  },

  async submitVote(data) {
    return this.post({ action: 'vote', ...data });
  },

  // Admin endpoints
  async adminGet(action, token) {
    const params = new URLSearchParams({ action, token });
    const resp = await fetch(`${API_URL}?${params}`);
    return resp.json();
  },

  async adminPost(data) {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data)
    });
    return resp.json();
  }
};

// ---------- RANKED CHOICE VOTING ----------

const RCV = {
  /**
   * Run a full RCV election.
   * @param {Array} votes - Array of { voter, rankings: ["Title1", "Title2", ...] }
   * @param {Array} candidates - Array of book title strings
   * @returns {Object} { winner, rounds, totalVoters }
   *   rounds: [{ counts: { title: count }, eliminated: "title"|null, winner: "title"|null }]
   */
  calculate(votes, candidates) {
    if (!votes.length || !candidates.length) {
      return { winner: null, rounds: [], totalVoters: 0 };
    }

    const totalVoters = votes.length;
    const threshold = Math.floor(totalVoters / 2) + 1;
    let remaining = [...candidates];
    let ballots = votes.map(v => [...v.rankings]); // Deep copy
    const rounds = [];

    while (remaining.length > 1) {
      // Count first-choice votes among remaining candidates
      const counts = {};
      remaining.forEach(c => counts[c] = 0);

      ballots.forEach(ballot => {
        // Find first remaining candidate on this ballot
        const pick = ballot.find(b => remaining.includes(b));
        if (pick) counts[pick]++;
      });

      // Check for winner
      const max = Math.max(...Object.values(counts));
      const roundInfo = { counts: { ...counts }, eliminated: null, winner: null };

      if (max >= threshold) {
        const winner = remaining.find(c => counts[c] === max);
        roundInfo.winner = winner;
        rounds.push(roundInfo);
        return { winner, rounds, totalVoters };
      }

      // If only two left, higher count wins (or tie)
      if (remaining.length === 2) {
        const sorted = remaining.sort((a, b) => counts[b] - counts[a]);
        if (counts[sorted[0]] > counts[sorted[1]]) {
          roundInfo.winner = sorted[0];
          rounds.push(roundInfo);
          return { winner: sorted[0], rounds, totalVoters };
        }
        // True tie
        roundInfo.winner = sorted[0] + ' (tie)';
        rounds.push(roundInfo);
        return { winner: sorted[0] + ' (tie)', rounds, totalVoters };
      }

      // Eliminate the candidate with fewest first-choice votes
      const min = Math.min(...Object.values(counts));
      const toEliminate = remaining.filter(c => counts[c] === min);
      // If tie at bottom, eliminate all tied (standard RCV)
      const eliminated = toEliminate[toEliminate.length - 1]; // Pick last alphabetically for consistency
      roundInfo.eliminated = eliminated;
      rounds.push(roundInfo);

      remaining = remaining.filter(c => c !== eliminated);
    }

    // One left standing
    const lastCounts = {};
    lastCounts[remaining[0]] = ballots.filter(b => b.some(c => remaining.includes(c))).length;
    rounds.push({ counts: lastCounts, eliminated: null, winner: remaining[0] });

    return { winner: remaining[0], rounds, totalVoters };
  },

  /**
   * Render RCV results into a container element.
   */
  renderResults(container, result, books) {
    if (!result.rounds.length) {
      container.innerHTML = '<p class="msg msg-info">No votes have been cast yet.</p>';
      return;
    }

    let html = '';

    if (result.winner) {
      const winnerBook = books.find(b => b.title === result.winner) || { title: result.winner, author: '' };
      html += `
        <div class="msg msg-success" style="text-align:center; margin-bottom:2rem;">
          <h2 style="margin-bottom:0.25rem;">Winner</h2>
          <div style="font-size:1.3rem; font-weight:bold;">${winnerBook.title}</div>
          ${winnerBook.author ? `<div style="color:#555;">by ${winnerBook.author}</div>` : ''}
          <div style="margin-top:0.5rem; font-size:0.95rem; color:#666;">
            ${result.totalVoters} voter${result.totalVoters !== 1 ? 's' : ''} participated
          </div>
        </div>
      `;
    }

    // Show each elimination round
    result.rounds.forEach((round, i) => {
      const maxCount = Math.max(...Object.values(round.counts), 1);
      html += `<div class="elimination-round">`;
      html += `<h3>Round ${i + 1}`;
      if (round.eliminated) html += ` <span style="font-weight:normal; color:#888;">— "${round.eliminated}" eliminated</span>`;
      if (round.winner) html += ` <span style="font-weight:normal; color:#2c5e3a;">— Winner found</span>`;
      html += `</h3>`;

      const sorted = Object.entries(round.counts).sort((a, b) => b[1] - a[1]);
      sorted.forEach(([title, count]) => {
        const pct = result.totalVoters > 0 ? ((count / result.totalVoters) * 100).toFixed(0) : 0;
        let barClass = 'bar-fill';
        if (round.winner === title) barClass += ' winner';
        else if (round.eliminated === title) barClass += ' eliminated';

        html += `
          <div class="bar-row">
            <div class="bar-label">${title}</div>
            <div class="bar-track"><div class="${barClass}" style="width:${pct}%"></div></div>
            <div class="bar-count">${count} (${pct}%)</div>
          </div>
        `;
      });

      html += `</div>`;
    });

    container.innerHTML = html;
  }
};

// ---------- UI HELPERS ----------

function showMsg(id, text, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `msg msg-${type}`;
  el.textContent = text;
  el.classList.remove('hidden');
}

function hideMsg(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function showLoading(containerId, text = 'Loading...') {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<span class="spinner"></span><span class="loading-text">${text}</span>`;
}

function requireAuth() {
  if (!Session.isAuthenticated()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

function setActiveNav() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.site-nav a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('active');
  });
}

// ---------- HEADER / NAV BUILDER ----------

function renderHeader(container) {
  const round = Session.getRound();
  container.innerHTML = `
    <div class="site-header">
      <div class="site-header-inner">
        <a href="index.html" class="site-title">Iron Lotus Sangha</a>
        ${round ? `
        <nav class="site-nav">
          <a href="books.html">Books</a>
          <a href="suggest.html">Suggest</a>
          <a href="vote.html">Vote</a>
          <a href="results.html">Results</a>
          <a href="history.html">History</a>
        </nav>
        ` : ''}
      </div>
    </div>
  `;
  setActiveNav();
}

// ---------- RANKED CHOICE DRAG-AND-DROP ----------

function initRankList(listEl, onReorder) {
  let dragIdx = null;

  function attachEvents() {
    const items = listEl.querySelectorAll('.rank-item');
    items.forEach((item, i) => {
      // Drag events
      item.setAttribute('draggable', 'true');
      item.addEventListener('dragstart', () => {
        dragIdx = i;
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        dragIdx = null;
        listEl.querySelectorAll('.rank-item').forEach(el => el.classList.remove('drag-over'));
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragIdx !== null && dragIdx !== i) {
          onReorder(dragIdx, i);
        }
      });

      // Arrow buttons
      const upBtn = item.querySelector('.arrow-up');
      const downBtn = item.querySelector('.arrow-down');
      if (upBtn) upBtn.addEventListener('click', () => { if (i > 0) onReorder(i, i - 1); });
      if (downBtn) downBtn.addEventListener('click', () => {
        if (i < items.length - 1) onReorder(i, i + 1);
      });
    });
  }

  attachEvents();
  return { reattach: attachEvents };
}

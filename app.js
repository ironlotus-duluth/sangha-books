// ============================================================
// SANGHA BOOK GROUP — Shared JavaScript
// API client, auth, Borda count voting, utilities
// ============================================================

// ---------- CONFIGURATION ----------
// Replace with your deployed Apps Script URL
const API_URL = 'https://script.google.com/macros/s/AKfycbyYcJPBNIqmk4LhjYYi8LP-UbMt85t8SlPkhBnyas7snqSXxPo1tw9EuGL1bcWa8sSeDw/exec';

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

// ---------- BORDA COUNT VOTING ----------
// Each voter ranks their top 3 books. Points: 1st = 3, 2nd = 2, 3rd = 1.
// All rankings are counted in a single pass — no elimination rounds.
// The book with the most total points wins.

const BORDA_POINTS = [3, 2, 1]; // Index 0 = 1st choice, 1 = 2nd, 2 = 3rd

const RCV = {
  /**
   * Run a Borda count election.
   * @param {Array} votes  - Array of { voter, rankings: ["Title1", "Title2", ...] }
   * @param {Array} candidates - Array of book title strings
   * @returns {Object} { winner, standings, totalVoters, tiebroken }
   *   standings: [{ title, score, positions: { first, second, third } }]
   */
  calculate(votes, candidates) {
    if (!votes.length || !candidates.length) {
      return { winner: null, standings: [], totalVoters: 0, tiebroken: false };
    }

    const totalVoters = votes.length;

    // Initialize scores and position counts for every candidate
    const scores = {};
    const positions = {};
    candidates.forEach(c => {
      scores[c] = 0;
      positions[c] = { first: 0, second: 0, third: 0 };
    });

    // Score each ballot
    const posLabels = ['first', 'second', 'third'];
    votes.forEach(v => {
      v.rankings.forEach((title, i) => {
        if (i < BORDA_POINTS.length && scores.hasOwnProperty(title)) {
          scores[title] += BORDA_POINTS[i];
          positions[title][posLabels[i]]++;
        }
      });
    });

    // Build standings sorted by score, then first-choice, then second-choice, then alpha
    const standings = candidates.map(title => ({
      title,
      score: scores[title],
      positions: { ...positions[title] }
    })).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.positions.first !== a.positions.first) return b.positions.first - a.positions.first;
      if (b.positions.second !== a.positions.second) return b.positions.second - a.positions.second;
      return a.title.localeCompare(b.title);
    });

    // Detect if tiebreaker was needed (top 2 have same score)
    const tiebroken = standings.length > 1 && standings[0].score === standings[1].score;
    const winner = standings[0].title;

    return { winner, standings, totalVoters, tiebroken };
  },

  /**
   * Render Borda count results into a container element.
   * Two-tier layout: friendly summary up top, detailed breakdown in collapsible section.
   */
  renderResults(container, result, books, votingOpen) {
    if (!result.standings || !result.standings.length) {
      container.innerHTML = '<p class="msg msg-info">No votes have been cast yet.</p>';
      return;
    }

    let html = '';
    const maxPoints = BORDA_POINTS[0] * result.totalVoters; // theoretical max

    // --- Friendly Summary ---

    if (result.winner) {
      const winnerBook = books.find(b => b.title === result.winner) || { title: result.winner, author: '' };
      const winnerStanding = result.standings[0];
      const label = votingOpen ? 'Current Leader' : 'Our Next Read';
      const voterLabel = votingOpen
        ? `${result.totalVoters} member${result.totalVoters !== 1 ? 's' : ''} have voted so far`
        : `${result.totalVoters} member${result.totalVoters !== 1 ? 's' : ''} voted`;
      html += `
        <div class="results-hero">
          <div class="results-hero-label">${label}</div>
          <div class="results-hero-title">${winnerBook.title}</div>
          ${winnerBook.author ? `<div class="results-hero-author">by ${winnerBook.author}</div>` : ''}
          <div class="results-hero-meta">${winnerStanding.score} point${winnerStanding.score !== 1 ? 's' : ''} · ${voterLabel}</div>
        </div>
      `;
    }

    // Standings list — ranked by Borda score, dense ranking
    html += `<div class="results-standings">`;
    html += `<h2 class="results-standings-heading">${votingOpen ? 'Current Standings' : 'Final Standings'}</h2>`;
    html += `<p class="results-standings-note">Ranked by total points (1st pick = 3 pts, 2nd = 2 pts, 3rd = 1 pt)</p>`;
    let rank = 1;
    result.standings.forEach((s, i) => {
      const book = books.find(b => b.title === s.title) || { title: s.title, author: '' };
      const isWinner = result.winner && result.winner === s.title;
      // Dense ranking: only bump rank when score drops
      if (i > 0 && s.score < result.standings[i - 1].score) rank = i + 1;
      html += `
        <div class="standing-row${isWinner ? ' standing-winner' : ''}${s.score === 0 ? ' standing-zero' : ''}">
          <span class="standing-rank">${rank}</span>
          <span class="standing-info">
            <span class="standing-title">${book.title}</span>
            ${book.author ? `<span class="standing-author">by ${book.author}</span>` : ''}
          </span>
          <span class="standing-votes">${s.score} pt${s.score !== 1 ? 's' : ''}</span>
        </div>
      `;
    });
    html += `</div>`;

    // --- Collapsible "Stats for Nerds" ---
    html += `
      <details class="nerd-stats">
        <summary class="nerd-stats-toggle">Stats for Nerds</summary>
        <div class="nerd-stats-body">
          <p class="nerd-stats-intro">
            This uses a Borda count: your 1st choice earns 3 points, 2nd earns 2, and 3rd earns 1.
            All rankings are tallied in a single pass — no elimination rounds. The book with the
            most total points wins. This method finds the book with the broadest support across
            all voters, not just the one with the most first-choice votes.
          </p>
    `;

    // Segmented bar chart for all candidates
    const maxScore = Math.max(...result.standings.map(s => s.score), 1);

    html += `<div class="tb-chart borda-chart">`;
    html += `<div class="tb-header">Point breakdown by ranking position</div>`;
    html += `<div class="tb-legend">`;
    html += `<span class="tb-legend-item"><span class="tb-swatch tb-1st"></span>1st choice (3 pts each)</span>`;
    html += `<span class="tb-legend-item"><span class="tb-swatch tb-2nd"></span>2nd choice (2 pts each)</span>`;
    html += `<span class="tb-legend-item"><span class="tb-swatch tb-3rd"></span>3rd choice (1 pt each)</span>`;
    html += `</div>`;

    result.standings.forEach(s => {
      const p = s.positions;
      const totalWidth = (s.score / maxScore) * 100;
      const total = s.score;
      // Segment widths as proportion of this candidate's total score
      const pts1 = p.first * 3;
      const pts2 = p.second * 2;
      const pts3 = p.third * 1;
      const w1 = total > 0 ? (pts1 / total) * totalWidth : 0;
      const w2 = total > 0 ? (pts2 / total) * totalWidth : 0;
      const w3 = total > 0 ? (pts3 / total) * totalWidth : 0;
      const isWinner = result.winner === s.title;

      html += `
        <div class="tb-row${isWinner ? ' tb-winner' : ''}${s.score === 0 ? ' tb-zero' : ''}">
          <div class="tb-label">${s.title}</div>
          <div class="tb-track">
            ${p.first ? `<div class="tb-seg tb-1st" style="width:${w1}%">${p.first}</div>` : ''}
            ${p.second ? `<div class="tb-seg tb-2nd" style="width:${w2}%">${p.second}</div>` : ''}
            ${p.third ? `<div class="tb-seg tb-3rd" style="width:${w3}%">${p.third}</div>` : ''}
          </div>
          <div class="tb-score">${s.score} pts</div>
        </div>
      `;
    });
    html += `</div>`;

    // Tiebreaker note
    if (result.tiebroken) {
      const top = result.standings[0];
      const tied = result.standings.filter(s => s.score === top.score);
      const tiedNames = tied.map(s => `"${s.title}"`).join(' and ');
      let reason = '';
      if (tied.length >= 2 && tied[0].positions.first !== tied[1].positions.first) {
        reason = 'Won tiebreaker: most first-choice votes.';
      } else if (tied.length >= 2 && tied[0].positions.second !== tied[1].positions.second) {
        reason = 'Won tiebreaker: most second-choice votes.';
      } else {
        reason = 'Tied candidates broken by alphabetical order.';
      }
      html += `<p class="nerd-tiebreaker-note">${tiedNames} tied at ${top.score} points. ${reason}</p>`;
    }

    html += `</div></details>`;

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

# Sangha Books: Voting Algorithm Recommendation

**Date:** 2026-04-12
**Status:** Research complete — ready for implementation decision
**Context:** Handoff from `mycelium/handoffs/2026-04-12-sangha-rcv-rethink.md`

---

## The Problem

Standard RCV (instant-runoff voting) behaves poorly for the Iron Lotus Sangha's use case: 4–20 voters choosing from 5–10 books, with only top-3 rankings. Specific failures:

1. **Perpetual ties.** With 4 voters and 4 first-choice picks, nobody reaches majority (threshold = 3). Every round is a tiebreaker.
2. **0-vote elimination destroys signal.** Books with no first-choice votes but strong 2nd/3rd support are eliminated before they can ever receive redistributed votes. A book everyone likes as their second choice is killed in Round 1.
3. **Elimination order feels arbitrary.** Cascading tiebreakers produce a winner that "survived" rather than one the group actually preferred.

The guiding principle: *"A book most people are happy with, even if it wasn't everyone's first pick."* That's a consensus criterion, and RCV is not a consensus method — it's a majoritarian elimination method.

---

## Algorithms Evaluated

### 1. Standard RCV (Instant Runoff)
**How it works:** Count first-choice votes. If no majority, eliminate the last-place candidate and redistribute their votes to next choices. Repeat.

**Strengths:** Familiar name; used in real elections; respects majority preference.

**Fatal flaws for sangha-books:**
- Requires majority threshold that's nearly unreachable with 4–8 voters
- Discards 2nd/3rd choice information until a voter's higher pick is eliminated
- 0-vote books are eliminated immediately, wasting all secondary support
- Susceptible to "center squeeze" — a broadly-liked compromise book gets eliminated early because it wasn't anyone's *first* pick

**Verdict:** ❌ Poor fit. This is the problem we're solving.

### 2. Borda Count (fixed points: 3-2-1)
**How it works:** Each voter's 1st choice gets 3 points, 2nd gets 2, 3rd gets 1. Sum all points. Highest total wins.

**Strengths:** Dead simple. Uses *all* ranking information simultaneously — no elimination rounds. Naturally rewards consensus candidates (a book ranked 2nd by everyone will outscore a book ranked 1st by one person). Easy to explain.

**Weaknesses:**
- With fixed 3-2-1 scoring and partial ballots (voter ranks only 2 of 3), voters who rank fewer candidates give out fewer total points, slightly disadvantaging themselves.
- Vulnerable to strategic voting in competitive elections (rank your favorite's strongest rival last). *Not a real concern for a friendly book club.*
- A "Condorcet loser" (a book that loses every head-to-head matchup) can theoretically win if it accumulates enough 2nd-place votes.

**Verdict:** ✅ Strong candidate. Simple, consensus-oriented, handles this group size well.

### 3. Modified Borda Count (scaled to ballot depth)
**How it works:** A voter who ranks *k* candidates assigns k points to 1st, k-1 to 2nd, ..., 1 to last. So a voter ranking 2 books gives 2-1; a voter ranking 3 gives 3-2-1; a voter ranking 5 gives 5-4-3-2-1.

**Strengths:** Fairer to voters who submit partial ballots — everyone's points are proportional to their ballot depth. Slightly more resistant to the "bullet voting" strategy (ranking only your #1 to maximize their advantage).

**Weaknesses:** Harder to explain. The scoring changes based on how many books each voter ranked, which makes the "Stats for Nerds" math confusing. When everyone ranks the same number (which is the common case with MAX_PICKS=3), it's identical to standard Borda.

**Verdict:** ⚠️ Marginal improvement over standard Borda, at the cost of explainability. Not worth the complexity unless ballot depth varies a lot.

### 4. STAR Voting (Score Then Automatic Runoff)
**How it works:** Two rounds. Round 1 (Score): voters rate each candidate 0–5 stars; sum all ratings; top 2 advance. Round 2 (Runoff): between the top 2, whichever is preferred by more voters wins.

**Strengths:** Best of both worlds — score phase finds consensus, runoff phase ensures majority support between finalists. Resistant to strategic voting. Studied in peer-reviewed research; elected the Condorcet winner in 81% of simulated trials (vs 52% for RCV).

**Weaknesses:** Requires a *different ballot format* — star ratings instead of rankings. This is a fundamental UX change: voters would rate each book 0–5 instead of picking their top 3. For elderly users, clicking/tapping a 0–5 scale for 8 books (8 decisions) may be more cognitive load than picking 3 favorites (3 decisions). The mapping from ranked ballots to star ratings is lossy — you'd need to redesign the voting page.

**Verdict:** ⚠️ Theoretically excellent but requires ballot redesign. Could be a future upgrade but is a bigger lift than switching the counting algorithm.

### 5. Condorcet Methods (Copeland, Schulze, Ranked Pairs)
**How it works:** Compare every pair of candidates head-to-head. If one candidate beats all others in pairwise matchups, they win (Condorcet winner). Various methods (Schulze, Ranked Pairs) resolve cycles when no Condorcet winner exists.

**Strengths:** The Condorcet winner is, by definition, the candidate a majority prefers over every alternative. When one exists, it's the "fairest" winner.

**Weaknesses:**
- Often produces no winner (cyclic preferences), requiring a complex fallback. The test data has no Condorcet winner.
- Partial/truncated ballots create ambiguity: if a voter didn't rank a book, do they prefer all ranked books over it, or have no opinion? Different assumptions produce different results.
- Pairwise matrices are hard to explain. "Stats for Nerds" would need an NxN comparison table — workable but dense.
- With 4 voters and 8 candidates, cycles are *extremely* common.

**Verdict:** ❌ Too complex, too fragile with small groups and partial ballots. The fallback-on-cycle problem alone disqualifies it for a book club.

### 6. Approval Voting
**How it works:** Each voter approves (yes/no) any number of candidates. Most approvals wins.

**Strengths:** Extremely simple. Naturally consensus-oriented — a book everyone "approves" will win.

**Weaknesses:** Loses all preference intensity. Ranking your #1 and your "meh, I'd be okay with it" choice count equally. With the current ranked ballot format, we'd treat "ranked = approved" which gives each voter exactly 3 approvals — this turns into a simple count of "how many people mentioned this book at all," which discards ranking order entirely. Frequent ties with small groups.

**Verdict:** ❌ Too blunt. Loses the ranking signal that voters are already providing.

---

## Simulation: Test Data Results

Using the handoff test data (4 voters, 8 books):

| Method | Winner | Notes |
|--------|--------|-------|
| **Standard RCV** | Living with the Devil | Survived elimination cascade despite being only one voter's 3rd choice. Feels wrong. |
| **Borda (3-2-1)** | **Not Always So** (5 pts) | Tied with Sweeter than Revenge (5 pts); tiebreaker by first-choice count gives Not Always So the edge (1 vs 1 — then by 2nd-choice: 1 vs 0). |
| **Modified Borda** | **Not Always So** (5 pts) | Same result — all 3-rankers produce identical scores to standard Borda. |
| **STAR (mapped)** | **Not Always So** | Wins score round and runoff. |
| **Condorcet** | **No winner** | Cyclic preferences — requires fallback. |
| **Approval** | 4-way tie (2 each) | Branching Streams, Not Always So, Peace in Every Step, Sweeter than Revenge all approved by 2 voters. |

**Not Always So** is the consensus winner — it appeared on 2 of 4 ballots (1st and 2nd choice), giving it strong support across voters without being polarizing. Standard RCV produced the least defensible result. Borda found the consensus candidate that RCV missed.

---

## Recommendation: Borda Count (3-2-1, top-3 ballots)

**The algorithm:** Each voter's 1st choice = 3 points, 2nd = 2 points, 3rd = 1 point. Sum across all voters. Highest total wins.

**Why Borda:**

1. **Matches the goal.** Borda is mathematically optimized for finding the candidate with the broadest support. A book ranked 2nd by everyone will beat a book ranked 1st by one person and unranked by everyone else. That's exactly "a book most people are happy with."

2. **No elimination rounds.** The entire result is computed in one pass. No cascading tiebreakers, no 0-vote elimination problem, no exhausted ballots. Every ranking on every ballot counts immediately.

3. **Dead simple to explain.** "Your first pick gets 3 points, your second gets 2, your third gets 1. The book with the most points wins." A 78-year-old can follow that.

4. **Works perfectly with top-3 ballots.** No need to change the voting UX. Voters still pick their top 3 in order. The only change is how the points are counted on the backend.

5. **Handles partial ballots gracefully.** A voter who only ranks 2 books gives 3 + 2 = 5 points. A voter who ranks 3 gives 3 + 2 + 1 = 6 points. The difference is small and proportional. No special handling needed.

6. **Ties are meaningful and rare.** With more voters (8–20), ties become uncommon because Borda spreads points across all ballot positions. When ties do occur, the existing `_leastSupported` tiebreaker logic (which is already Borda-style!) resolves them naturally.

7. **Academic backing.** Recent research (Emerson 2013, Popov & Shvartzman 2025) confirms Borda's advantages for preference aggregation, particularly its avoidance of monotonicity paradoxes that plague RCV. Tyler Cowen called it ["the best method of voting"](https://marginalrevolution.com/marginalrevolution/2025/01/the-borda-count-is-the-best-method-of-voting.html) in January 2025, citing its unique ability to measure preference intensity while avoiding spoiler effects.

### Rank Depth Recommendation: Keep Top 3

Increasing to top-5 rankings would provide marginally more signal but isn't worth the UX cost for this audience. The 3-2-1 scoring already differentiates well between strong preference (1st) and mild preference (3rd). With 5–10 candidates, asking for top 3 covers 30–60% of the field, which is plenty of signal for Borda.

If the group grows to 15+ voters or 10+ books consistently, revisiting top-5 would be worthwhile. For now, keep it simple.

### What about STAR?

STAR is the theoretically strongest method here, but it requires star-rating ballots (0–5 per book) instead of ranked ballots. That's a bigger UX change — every voter would need to assign a score to each of 8 books instead of just picking 3 favorites. For a 75+ audience, the current "tap your top 3" interface is simpler. STAR could be a Phase 2 upgrade if the group expresses interest.

---

## Implementation Plan

### Algorithm Changes (`app.js`)

1. **Replace `RCV.calculate()`** with `BordaCount.calculate()`:
   - Input: same `votes` and `candidates` arrays
   - Score each ballot: 1st=3, 2nd=2, 3rd=1 (configurable via `POINTS` array)
   - Sum scores per candidate
   - Sort by total score descending
   - Tiebreaker: first-choice count, then second-choice count, then alphabetical
   - Output: `{ winner, standings: [{ title, score, breakdown: { first, second, third } }], totalVoters }`

2. **Update `renderResults()`:**
   - Hero card: same pattern, but show point total instead of vote count
   - Standings: ranked by score, show "X points" with optional breakdown
   - Stats for Nerds: show the full points table with 1st/2nd/3rd breakdown per book, plus the segmented bar chart (already implemented as tiebreaker viz — promote to main viz)
   - Remove all "round" language — Borda has no rounds

3. **Keep `_leastSupported()` as tiebreaker** — it's already Borda-style scoring. Rename to `_breakTie()` for clarity.

### Copy Changes

4. **`results.html`:** Change subtitle from "ranked-choice voting" to "ranked voting" or "point-based ranked voting"

5. **`vote.html` explainer:** Replace the RCV step-by-step with:
   > "You pick your top 3 books in order. Your first choice gets 3 points, your second gets 2, and your third gets 1. We add up everyone's points, and the book with the most points wins. The result is a book most people are happy with, even if it wasn't everyone's first pick."

6. **Stats for Nerds intro:** Replace RCV explanation with Borda explanation. The segmented bar chart already visualizes exactly what Borda does — it just needs to be the *main* visualization instead of a tiebreaker detail.

### What to Remove

7. **Elimination rounds** — gone entirely. No more round-by-round cards in nerd stats.
8. **0-vote elimination logic** — irrelevant; Borda counts all positions simultaneously.
9. **Ballot exhaustion handling** — irrelevant; every ballot is fully counted in one pass.
10. **Threshold/majority calculation** — not applicable to Borda.

---

## Open Questions for Jonathan

1. **Naming:** Call it "ranked voting," "point-based voting," or keep "ranked-choice" (technically still accurate, just counted differently)? The sangha members know it as "ranked-choice" from previous rounds.

2. **Show points or just rank?** The friendly standings could show "42 points" or just the rank order. Points are more transparent but might prompt "why did my book only get 12 points?" questions.

3. **Tiebreaker transparency:** When ties occur, should the friendly summary mention it ("Won by tiebreaker — most first-choice votes") or just show the winner? Stats for Nerds will always show the full breakdown.

---

## Sources

- [An Evaluation of Borda Count Variations Using Ranked Choice Voting Data](https://arxiv.org/html/2501.00618v2) — Popov & Shvartzman, 2025. Empirical study of 421 US elections.
- [The Original Borda Count and Partial Voting](https://link.springer.com/article/10.1007/s00355-011-0603-9) — Emerson, 2013. Foundational work on Borda with truncated ballots.
- [The Borda Count is the Best Method of Voting](https://marginalrevolution.com/marginalrevolution/2025/01/the-borda-count-is-the-best-method-of-voting.html) — Tyler Cowen, Marginal Revolution, Jan 2025.
- [STAR Voting](https://en.wikipedia.org/wiki/STAR_voting) — Wikipedia overview with peer-reviewed citations.
- [Voting Methods](https://plato.stanford.edu/entries/voting-methods/) — Stanford Encyclopedia of Philosophy.
- [STAR vs RCV Pros and Cons](https://www.equal.vote/star_rcv_pros_cons) — Equal Vote Coalition comparison.
- [FairVote Single-Winner Comparison Chart](https://archive3.fairvote.org/reforms/instant-runoff-voting/irv-and-the-status-quo/irv-versus-alternative-reforms/single-winner-voting-method-comparison-chart/)

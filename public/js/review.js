// Game review: the engine grades every move; results are shown as a chart and a list of mistakes.
//
// For the move played at index i (made in the position with i stones), the loss is
//   winProb(best move in position i) − (1 − winProb(best move in position i+1))
// i.e. how much win probability the played move gave up compared with the engine's choice.
import { MATE_BASE, MISTAKE_CLASSES, REVIEW_MS, SIZE } from './config.js';
import { S } from './state.js';
import { engine } from './engine.js';
import { bestMoveOf, boardCmd, isBestMove, label, makeParser, searchSetup, winProb } from './protocol.js';
import { checkWin } from './rules.js';
import { $, setBusy, setStatus } from './ui.js';
import { CHART_PAD, CHART_WIDTH, render } from './render.js';

export const classify = (loss) => MISTAKE_CLASSES.find((c) => loss >= c.min) || null;

export function clearReview() {
  S.review = null;
  S.viewPly = null;
  $('reviewPanel').hidden = true;
}

function showSummary() {
  const r = S.review;
  const stats = (color) => {
    const counts = [0, 0, 0, 0];
    let sum = 0, moves = 0;
    r.loss.forEach((l, i) => {
      if (i % 2 !== color || l == null) return;
      moves++;
      sum += l;
      if (r.cls[i]) counts[r.cls[i].id]++;
    });
    return { counts, avg: moves ? sum / moves : 0 };
  };
  const box = $('reviewSummary');
  box.innerHTML = '';
  for (const [name, color] of [['You', S.human], ['Engine', 1 - S.human]]) {
    const s = stats(color);
    const div = document.createElement('div');
    div.textContent = `${name}: ${s.counts[3]} blunders · ${s.counts[2]} mistakes · ${s.counts[1]} inaccuracies — avg loss ${(s.avg * 100).toFixed(1)}% win probability per move`;
    box.appendChild(div);
  }

  const list = $('mistakes');
  list.innerHTML = '';
  r.cls.forEach((c, i) => {
    if (!c) return;
    const li = document.createElement('li');
    li.className = `c${c.id}` + (i % 2 === S.human ? ' mine' : '');
    const best = r.best[i];
    li.textContent = `${i + 1}. ${i % 2 ? '○' : '●'} ${label(S.moves[i])} — ${c.name} (−${(r.loss[i] * 100).toFixed(0)}%)` + (best ? ` · better: ${label(best)}` : '');
    li.onclick = () => { S.viewPly = i; render(); };
    list.appendChild(li);
  });
  if (!list.children.length) {
    const li = document.createElement('li');
    li.textContent = 'No significant mistakes.';
    list.appendChild(li);
  }
}

function install(review) {
  S.review = review;
  showSummary();
  $('reviewPanel').hidden = false;
}

/** Runs the review, or cancels it if one is already running. */
export async function runReview() {
  if (S.reviewing) { S.token++; return; } // cancel
  if (S.busy || S.moves.length < 2) return;
  clearReview();
  const my = ++S.token;
  const list = S.moves.map(({ x, y }) => ({ x, y }));
  const n = list.length;
  const won = S.gameOver && S.gameOver.winner >= 0;
  const lastPos = won ? n - 1 : n; // positions 1..lastPos are analysed (position k = first k stones)
  const E = new Array(n + 2).fill(null); // best evaluation for the side to move in position k
  const BEST = new Array(n + 2).fill(null); // best move in position k
  const rule = S.rule; // keep the rule fixed for the whole review

  S.reviewing = true;
  setBusy(true, '');
  $('review').textContent = 'Stop';
  $('review').disabled = false;

  for (let k = 1; k <= lastPos && my === S.token; k++) {
    setStatus(`Reviewing… ${k}/${lastPos}`);
    const parser = makeParser();
    const prefix = list.slice(0, k);
    const lines = await engine.ask(
      [...searchSetup(rule, REVIEW_MS, 99), boardCmd('YXBOARD', prefix), 'YXNBEST 1'],
      isBestMove,
      (l) => parser.feed(l),
    );
    if (my !== S.token) break;
    BEST[k] = bestMoveOf(lines);
    if (parser.st.eval != null) E[k] = parser.st.eval;
    else {
      // No search output: the engine returned an immediate win.
      const win = checkWin(prefix.concat(BEST[k]), rule);
      if (win && win.winner === k % 2) E[k] = MATE_BASE - 1;
    }
  }

  S.reviewing = false;
  $('review').textContent = 'Review game';
  setBusy(false);
  if (my !== S.token) { render(); setStatus('Review stopped.'); return; }

  const loss = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (i === n - 1 && S.gameOver) { loss[i] = 0; continue; } // the last move ended the game
    if (E[i] == null || E[i + 1] == null) continue;
    const same = BEST[i] && BEST[i].x === list[i].x && BEST[i].y === list[i].y;
    loss[i] = same ? 0 : Math.max(0, winProb(E[i]) - (1 - winProb(E[i + 1])));
  }
  // Black's win probability after move i (= position i+1).
  const blackWr = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const k = i + 1;
    if (k === n && won) blackWr[i] = S.gameOver.winner === 0 ? 1 : 0;
    else if (E[k] != null) blackWr[i] = k % 2 === 0 ? winProb(E[k]) : 1 - winProb(E[k]);
  }
  install({ n, E, best: BEST, loss, blackWr, cls: loss.map((l) => (l == null ? null : classify(l))) });

  const firstBad = S.review.cls.findIndex((c, i) => c && i % 2 === S.human);
  S.viewPly = firstBad >= 0 ? firstBad : null;
  render();
  setStatus(`Review done. ${firstBad >= 0 ? 'Showing your first mistake.' : 'You made no significant mistakes!'}`);
}

/** Re-attaches a saved review if it is well-formed and matches the loaded game exactly. */
export function restoreReview(saved) {
  if (!saved || saved.n !== S.moves.length) return;
  const all = (a, ok) => Array.isArray(a) && a.every(ok);
  const isCell = (c) => c == null || (Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < SIZE && c.y < SIZE);
  const isNum = (v) => v == null || (typeof v === 'number' && Number.isFinite(v));
  if (!(all(saved.best, isCell) && all(saved.loss, isNum) && all(saved.blackWr, isNum) && all(saved.E, isNum))) return;
  if (saved.loss.length !== saved.n || saved.blackWr.length !== saved.n) return;
  install({
    n: saved.n, E: saved.E, best: saved.best, loss: saved.loss, blackWr: saved.blackWr,
    cls: saved.loss.map((l) => (l == null ? null : classify(l))),
  });
  S.viewPly = null;
  render();
  setStatus('Game opened with its review — click the chart or a mistake to browse.');
}

/** Chart click: jump to the nearest move. */
export function onChartClick(event) {
  if (!S.review) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH;
  const i = Math.round(((x - CHART_PAD) / (CHART_WIDTH - 2 * CHART_PAD)) * (S.review.n - 1));
  S.viewPly = Math.min(Math.max(i, 0), S.review.n - 1);
  render();
}

/** ← / → step through the reviewed game; stepping past the end returns to the live position. */
export function onArrowKey(event) {
  if (!S.review || S.busy || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
  const current = S.viewPly == null ? S.review.n : S.viewPly;
  const next = Math.min(Math.max(current + (event.key === 'ArrowRight' ? 1 : -1), 0), S.review.n);
  S.viewPly = next >= S.review.n ? null : next;
  event.preventDefault();
  render();
}

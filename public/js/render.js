// Everything that draws: the board canvas, the side panels and the review chart.
import { SIZE } from './config.js';
import { S, turn } from './state.js';
import { $, updateStatus } from './ui.js';
import { fmtEval, isMateValue, label, winProb } from './protocol.js';

const canvas = $('board');
const ctx = canvas.getContext('2d');
const MARGIN = 40;
const STEP = (canvas.width - 2 * MARGIN) / (SIZE - 1);
const px = (i) => MARGIN + i * STEP;
const R = STEP * 0.44; // stone radius

/** Pointer event → board cell, or null when outside the board. */
export function cellAt(event) {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const x = Math.round(((event.clientX - rect.left) * scale - MARGIN) / STEP);
  const y = Math.round(((event.clientY - rect.top) * scale - MARGIN) / STEP);
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE ? { x, y } : null;
}

function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(px(x), px(y), r, 0, Math.PI * 2);
}

function drawGrid() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = dark ? '#b98d4f' : '#e3b872';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#4a3a22';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < SIZE; i++) {
    ctx.moveTo(px(0), px(i)); ctx.lineTo(px(SIZE - 1), px(i));
    ctx.moveTo(px(i), px(0)); ctx.lineTo(px(i), px(SIZE - 1));
  }
  ctx.stroke();

  ctx.fillStyle = '#4a3a22';
  for (const [x, y] of [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]]) {
    circle(x, y, 5);
    ctx.fill();
  }
  ctx.font = '14px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < SIZE; i++) {
    ctx.fillText(String.fromCharCode(65 + i), px(i), 16);
    ctx.fillText(String(SIZE - i), 16, px(i));
  }
}

function drawStones(stones) {
  stones.forEach((m, i) => {
    const cx = px(m.x), cy = px(m.y);
    const g = ctx.createRadialGradient(cx - R / 3, cy - R / 3, R / 8, cx, cy, R);
    if (i % 2 === 0) { g.addColorStop(0, '#666'); g.addColorStop(1, '#111'); }
    else { g.addColorStop(0, '#fff'); g.addColorStop(1, '#cfcfcf'); }
    ctx.fillStyle = g;
    circle(m.x, m.y, R);
    ctx.fill();
    if (i % 2) { ctx.strokeStyle = '#999'; ctx.lineWidth = 1; ctx.stroke(); }
  });
  const last = stones[stones.length - 1];
  if (last) {
    ctx.strokeStyle = '#e03a2f';
    ctx.lineWidth = 3;
    circle(last.x, last.y, R * 0.45);
    ctx.stroke();
  }
}

function drawLiveMarkers() {
  if (S.gameOver && S.gameOver.line.length) {
    ctx.strokeStyle = '#2fb344';
    ctx.lineWidth = 4;
    for (const c of S.gameOver.line) { circle(c.x, c.y, R + 3); ctx.stroke(); }
  }
  ctx.strokeStyle = '#c0261d';
  ctx.lineWidth = 3;
  const d = STEP * 0.22;
  for (const k of S.forbidden) {
    const x = px(k % SIZE), y = px(Math.floor(k / SIZE));
    ctx.beginPath();
    ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d);
    ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d);
    ctx.stroke();
  }
  for (const o of S.overlay) {
    ctx.fillStyle = 'rgba(46,160,67,.85)';
    circle(o.x, o.y, R * 0.8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px system-ui';
    ctx.fillText(o.text, px(o.x), px(o.y));
  }
  const h = S.hover;
  if (h && !S.busy && !S.gameOver && turn() === S.human && !S.moves.some((m) => m.x === h.x && m.y === h.y)) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = S.human === 0 ? '#111' : '#fff';
    circle(h.x, h.y, R);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** While browsing a review: the move played (dashed red) and the engine's preferred move (green star). */
function drawReviewMarkers() {
  const played = S.moves[S.viewPly];
  const best = S.review.best[S.viewPly];
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#e03a2f';
  ctx.lineWidth = 3;
  circle(played.x, played.y, R);
  ctx.stroke();
  ctx.setLineDash([]);
  if (best && !(best.x === played.x && best.y === played.y)) {
    ctx.fillStyle = 'rgba(46,160,67,.9)';
    circle(best.x, best.y, R * 0.8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px system-ui';
    ctx.fillText('★', px(best.x), px(best.y));
  }
}

function updateSidePanel() {
  const list = $('moves');
  list.innerHTML = '';
  S.moves.forEach((m, i) => {
    const li = document.createElement('li');
    li.textContent = (i % 2 ? '○ ' : '● ') + label(m);
    if (S.viewPly === i) li.className = 'cur';
    list.appendChild(li);
  });
  list.scrollTop = list.scrollHeight;

  if (S.evalBlack == null) {
    $('evalText').textContent = '—';
    $('evalFill').style.width = '50%';
  } else {
    const blackWin = winProb(S.evalBlack);
    $('evalFill').style.width = ((1 - blackWin) * 100).toFixed(1) + '%';
    $('evalText').textContent = isMateValue(S.evalBlack)
      ? `${S.evalBlack > 0 ? 'Black' : 'White'} wins by force · ${fmtEval(S.evalBlack)}`
      : `Eval (Black): ${fmtEval(S.evalBlack)} · win ~${(blackWin * 100).toFixed(0)}%`;
  }
  $('pv').textContent = S.pvText || 'No analysis yet.';
  $('review').disabled = (S.busy && !S.reviewing) || (!S.reviewing && S.moves.length < 2);
}

/** Redraws the whole UI from state. */
export function render() {
  const live = S.viewPly == null;
  drawGrid();
  drawStones(live ? S.moves : S.moves.slice(0, S.viewPly));
  if (live) drawLiveMarkers();
  else if (S.review && S.viewPly < S.moves.length) drawReviewMarkers();
  updateSidePanel();
  drawChart();
  updateStatus();
}

const CHART_PAD = 10;
export const CHART_WIDTH = 600;
export { CHART_PAD };

/** Black's win probability after every move, with mistakes marked. */
export function drawChart() {
  const cv = $('chart');
  if ($('reviewPanel').hidden || !S.review) return;
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height, P = CHART_PAD;
  const css = getComputedStyle(document.documentElement);
  const fg = css.getPropertyValue('--fg').trim() || '#222';
  const grid = css.getPropertyValue('--line').trim() || '#ccc';
  const { n, blackWr, cls } = S.review;
  const X = (i) => P + (n <= 1 ? 0 : (i * (W - 2 * P)) / (n - 1));
  const Y = (v) => P + (1 - v) * (H - 2 * P);
  const v = (i) => (blackWr[i] == null ? 0.5 : blackWr[i]);

  g.clearRect(0, 0, W, H);
  g.strokeStyle = grid;
  g.lineWidth = 1;
  for (const level of [0, 0.5, 1]) { g.beginPath(); g.moveTo(P, Y(level)); g.lineTo(W - P, Y(level)); g.stroke(); }

  g.beginPath();
  g.moveTo(X(0), Y(0.5));
  for (let i = 0; i < n; i++) g.lineTo(X(i), Y(v(i)));
  g.lineTo(X(n - 1), Y(0.5));
  g.closePath();
  g.fillStyle = 'rgba(120,120,120,.35)';
  g.fill();

  g.beginPath();
  for (let i = 0; i < n; i++) (i ? g.lineTo(X(i), Y(v(i))) : g.moveTo(X(i), Y(v(i))));
  g.strokeStyle = fg;
  g.lineWidth = 2;
  g.stroke();

  cls.forEach((c, i) => {
    if (!c) return;
    g.fillStyle = ['', '#d4b21a', '#e08a1e', '#d1342b'][c.id];
    g.beginPath();
    g.arc(X(i), Y(v(i)), i % 2 === S.human ? 6 : 4, 0, Math.PI * 2);
    g.fill();
  });
  if (S.viewPly != null && S.viewPly < n) {
    g.strokeStyle = '#2fb344';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(X(S.viewPly), P); g.lineTo(X(S.viewPly), H - P); g.stroke();
  }
  g.fillStyle = fg;
  g.font = '11px system-ui';
  g.textBaseline = 'top';
  g.fillText('Black wins 100%', P + 2, 1);
  g.textBaseline = 'bottom';
  g.fillText('White wins 100%', P + 2, H - 1);
}

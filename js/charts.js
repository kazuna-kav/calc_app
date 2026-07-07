/* charts.js — 自前 SVG グラフ描画(外部ライブラリ不使用)
 *
 * 描画ルール:
 * - 棒は最大24px幅、データ側の端のみ4px角丸、ベースライン側は直角
 * - 隣接する棒の間に2pxの余白(色の縁取りはしない)
 * - グリッド線は1pxヘアライン。テキストは系列色を使わずテキスト色トークンで
 * - 2系列(月次推移)は凡例を常設。単一系列(内訳)は凡例なし+先端に金額を直接表示
 * - すべての棒にホバー/フォーカスでツールチップ(値はラベルでも読めるので補助)
 */
"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** 上端だけ4px角丸の縦棒パス */
function columnPath(x, y, w, h, r) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/** 右端だけ4px角丸の横棒パス */
function hbarPath(x, y, w, h, r) {
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} L${x},${y + h} Z`;
}

/** きりのいい軸の最大値(1/2/5 × 10^n) */
function niceCeil(v) {
  if (v <= 0) return 1000;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) {
    if (v <= m * exp) return m * exp;
  }
  return 10 * exp;
}

/* ---------- ツールチップ ---------- */

let tooltipEl = null;
function getTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "chart-tooltip";
    tooltipEl.hidden = true;
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

/** rows: [{ color?, label, value }] — 値が主役・ラベルは従 */
function showTooltip(evt, title, rows) {
  const tip = getTooltip();
  tip.textContent = "";
  const t = document.createElement("div");
  t.className = "chart-tooltip-title";
  t.textContent = title;
  tip.appendChild(t);
  for (const row of rows) {
    const r = document.createElement("div");
    r.className = "chart-tooltip-row";
    if (row.color) {
      const key = document.createElement("span");
      key.className = "chart-tooltip-key";
      key.style.background = row.color;
      r.appendChild(key);
    }
    const v = document.createElement("span");
    v.className = "chart-tooltip-value";
    v.textContent = row.value;
    const l = document.createElement("span");
    l.className = "chart-tooltip-label";
    l.textContent = row.label;
    r.append(v, l);
    tip.appendChild(r);
  }
  tip.hidden = false;
  moveTooltip(evt);
}

function moveTooltip(evt) {
  const tip = getTooltip();
  const margin = 12;
  const rect = tip.getBoundingClientRect();
  let x = evt.clientX + margin;
  let y = evt.clientY + margin;
  if (x + rect.width > window.innerWidth - 8) x = evt.clientX - rect.width - margin;
  if (y + rect.height > window.innerHeight - 8) y = evt.clientY - rect.height - margin;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function hideTooltip() {
  getTooltip().hidden = true;
}

function bindTooltip(target, getContent, liftEl) {
  target.addEventListener("pointerenter", (e) => {
    const { title, rows } = getContent();
    showTooltip(e, title, rows);
    if (liftEl) liftEl.classList.add("chart-hover");
  });
  target.addEventListener("pointermove", moveTooltip);
  target.addEventListener("pointerleave", () => {
    hideTooltip();
    if (liftEl) liftEl.classList.remove("chart-hover");
  });
  target.addEventListener("focus", (e) => {
    const { title, rows } = getContent();
    const r = target.getBoundingClientRect();
    showTooltip({ clientX: r.left + r.width / 2, clientY: r.top }, title, rows);
  });
  target.addEventListener("blur", hideTooltip);
}

/* ---------- 月次推移(収入 vs 支出・縦棒) ---------- */

/**
 * @param {HTMLElement} container
 * @param {Array<{month:string, income:number, expense:number}>} data 古い順
 */
function renderTrendChart(container, data) {
  container.textContent = "";
  const incomeColor = cssVar("--income");
  const expenseColor = cssVar("--expense");

  // 凡例(2系列なので常設)
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  for (const [color, label] of [[incomeColor, "収入"], [expenseColor, "支出"]]) {
    const item = document.createElement("span");
    item.className = "chart-legend-item";
    const swatch = document.createElement("span");
    swatch.className = "chart-legend-swatch";
    swatch.style.background = color;
    const text = document.createElement("span");
    text.textContent = label;
    item.append(swatch, text);
    legend.appendChild(item);
  }
  container.appendChild(legend);

  const W = 640;
  const H = 260;
  const pad = { top: 12, right: 12, bottom: 28, left: 64 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  svg.classList.add("chart-svg");

  const maxVal = niceCeil(Math.max(1, ...data.map((d) => Math.max(d.income, d.expense))));
  const yScale = (v) => pad.top + plotH * (1 - v / maxVal);

  // グリッド線と目盛り(4分割)
  for (let i = 0; i <= 4; i++) {
    const v = (maxVal / 4) * i;
    const y = yScale(v);
    svg.appendChild(svgEl("line", {
      x1: pad.left, y1: y, x2: W - pad.right, y2: y,
      class: i === 0 ? "chart-baseline" : "chart-grid",
    }));
    const tick = svgEl("text", { x: pad.left - 8, y: y + 4, "text-anchor": "end", class: "chart-tick" });
    tick.textContent = yen.format(v);
    svg.appendChild(tick);
  }

  const band = plotW / data.length;
  const barW = Math.min(24, (band - 16) / 2 - 1); // ≤24px・棒の間は2px空ける

  data.forEach((d, i) => {
    const cx = pad.left + band * i + band / 2;
    const group = svgEl("g");

    const bars = [
      { v: d.income, color: incomeColor, x: cx - barW - 1 },
      { v: d.expense, color: expenseColor, x: cx + 1 },
    ];
    for (const b of bars) {
      if (b.v <= 0) continue;
      const y = yScale(b.v);
      const h = plotH + pad.top - y;
      group.appendChild(svgEl("path", { d: columnPath(b.x, y, barW, h, 4), fill: b.color, class: "chart-bar" }));
    }

    // 月ラベル
    const label = svgEl("text", { x: cx, y: H - 8, "text-anchor": "middle", class: "chart-tick" });
    label.textContent = `${Number(d.month.split("-")[1])}月`;
    group.appendChild(label);

    // 月ごとのヒット領域(棒より大きく)・ツールチップは両系列を一度に表示
    const hit = svgEl("rect", {
      x: pad.left + band * i, y: pad.top, width: band, height: plotH,
      fill: "transparent", tabindex: "0", class: "chart-hit",
    });
    bindTooltip(hit, () => ({
      title: monthLabel(d.month),
      rows: [
        { color: incomeColor, label: "収入", value: formatYen(d.income) },
        { color: expenseColor, label: "支出", value: formatYen(d.expense) },
      ],
    }), group);
    group.appendChild(hit);
    svg.appendChild(group);
  });

  container.appendChild(svg);
}

/* ---------- 内訳(横棒・単一系列) ---------- */

/**
 * @param {HTMLElement} container
 * @param {Array<{label:string, total:number}>} data 降順ソート済み
 * @param {string} emptyMessage
 */
function renderBreakdownChart(container, data, emptyMessage) {
  container.textContent = "";
  if (data.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = emptyMessage;
    container.appendChild(p);
    return;
  }

  const barColor = cssVar("--accent");
  const rowH = 34;
  const barH = 20; // ≤24px
  const W = 640;
  const pad = { top: 4, right: 100, bottom: 4, left: 130 };
  const H = pad.top + rowH * data.length + pad.bottom;
  const plotW = W - pad.left - pad.right;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  svg.classList.add("chart-svg");

  const maxVal = Math.max(...data.map((d) => d.total));

  const grandTotal = data.reduce((s, x) => s + x.total, 0);

  data.forEach((d, i) => {
    const y = pad.top + rowH * i;
    const w = Math.max(2, (d.total / maxVal) * plotW);
    const rowGroup = svgEl("g");

    // カテゴリ名(左・テキスト色トークン)
    const name = svgEl("text", {
      x: pad.left - 10, y: y + rowH / 2 + 4, "text-anchor": "end", class: "chart-label",
    });
    name.textContent = d.label;
    rowGroup.appendChild(name);

    rowGroup.appendChild(svgEl("path", {
      d: hbarPath(pad.left, y + (rowH - barH) / 2, w, barH, 4),
      fill: barColor, class: "chart-bar",
    }));

    // 金額を先端に直接表示(単一系列なので全行ラベルが読みやすさを損なわない)
    const value = svgEl("text", {
      x: pad.left + w + 8, y: y + rowH / 2 + 4, "text-anchor": "start", class: "chart-value",
    });
    value.textContent = formatYen(d.total);
    rowGroup.appendChild(value);

    // 行全体をヒット領域にする(マークより大きいターゲット)
    const hit = svgEl("rect", {
      x: 0, y, width: W, height: rowH, fill: "transparent", tabindex: "0", class: "chart-hit",
    });
    bindTooltip(hit, () => ({
      title: d.label,
      rows: [{ label: `全体の ${Math.round((d.total / grandTotal) * 100)}%`, value: formatYen(d.total) }],
    }), rowGroup);
    rowGroup.appendChild(hit);
    svg.appendChild(rowGroup);
  });

  container.appendChild(svg);
}

/* app.js — 画面制御: タブ・フォーム・一覧・サマリー */
"use strict";

const yen = new Intl.NumberFormat("ja-JP");
function formatYen(n) {
  return `¥${yen.format(Math.abs(n))}`;
}

/** 表示中の月 ("YYYY-MM") */
let currentMonth = toMonthString(new Date());

/** 編集中の明細ID(null なら新規追加モード) */
let editingId = null;

/** 一覧の絞り込み条件 */
const filter = { category: "", method: "", keyword: "" };

function toMonthString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toMonthString(d);
}

function monthLabel(month) {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- タブ ---------- */
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
    document.getElementById(`panel-${t.dataset.tab}`).hidden = !active;
  });
  render();
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

/* ---------- フォーム ---------- */
function setupForm() {
  const form = document.getElementById("entry-form");
  const dateInput = document.getElementById("entry-date");
  dateInput.value = todayString();

  document.querySelectorAll('input[name="type"]').forEach((radio) => {
    radio.addEventListener("change", () => fillCategoryOptions(radio.value));
  });
  fillCategoryOptions("expense");
  fillMethodOptions();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const type = form.querySelector('input[name="type"]:checked').value;
    const date = dateInput.value;
    const amount = Number(document.getElementById("entry-amount").value);
    const category = document.getElementById("entry-category").value;
    const method = document.getElementById("entry-method").value;
    const memo = document.getElementById("entry-memo").value.trim();

    const error = validateEntry({ date, amount });
    const errorEl = document.getElementById("entry-error");
    if (error) {
      errorEl.textContent = error;
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;

    if (editingId) {
      Store.update(editingId, { type, date, amount, category, method, memo });
      showToast("明細を更新しました");
      exitEditMode();
      switchTab("list");
    } else {
      Store.add({ type, date, amount, category, method, memo });
      showToast(`${type === "income" ? "収入" : "支出"} ${formatYen(amount)} を記録しました`);
      document.getElementById("entry-amount").value = "";
      document.getElementById("entry-memo").value = "";
    }

    // 入力した明細の月を表示して結果が見えるようにする
    currentMonth = date.slice(0, 7);
    render();
  });

  document.getElementById("entry-cancel").addEventListener("click", () => {
    exitEditMode();
    switchTab("list");
  });
}

/* ---------- 編集モード ---------- */
function enterEditMode(tx) {
  editingId = tx.id;
  const form = document.getElementById("entry-form");
  form.querySelector(`input[name="type"][value="${tx.type}"]`).checked = true;
  fillCategoryOptions(tx.type);
  document.getElementById("entry-date").value = tx.date;
  document.getElementById("entry-amount").value = tx.amount;
  document.getElementById("entry-category").value = tx.category;
  document.getElementById("entry-method").value = tx.method;
  document.getElementById("entry-memo").value = tx.memo;
  document.getElementById("entry-submit").textContent = "更新する";
  document.getElementById("entry-cancel").hidden = false;
  switchTab("entry");
}

function exitEditMode() {
  editingId = null;
  const form = document.getElementById("entry-form");
  form.reset();
  document.getElementById("entry-date").value = todayString();
  fillCategoryOptions("expense");
  document.getElementById("entry-submit").textContent = "追加する";
  document.getElementById("entry-cancel").hidden = true;
}

const MAX_AMOUNT = 100000000; // 1億円。桁の打ち間違い対策

function validateEntry({ date, amount }) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "日付を入力してください";
  if (!Number.isFinite(amount) || amount <= 0) return "金額は1円以上の数値で入力してください";
  if (!Number.isInteger(amount)) return "金額は整数(円)で入力してください";
  if (amount > MAX_AMOUNT) return `金額が大きすぎます(上限 ${formatYen(MAX_AMOUNT)})`;
  return null;
}

function fillCategoryOptions(type) {
  const select = document.getElementById("entry-category");
  select.textContent = "";
  const list = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  for (const c of list) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    select.appendChild(opt);
  }
}

function fillMethodOptions() {
  const select = document.getElementById("entry-method");
  select.textContent = "";
  for (const m of METHODS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    select.appendChild(opt);
  }
}

/* ---------- 一覧の絞り込み ---------- */
function setupFilters() {
  const categorySelect = document.getElementById("filter-category");
  categorySelect.textContent = "";
  categorySelect.appendChild(buildOption("", "カテゴリ: すべて"));
  const expenseGroup = document.createElement("optgroup");
  expenseGroup.label = "支出";
  for (const c of EXPENSE_CATEGORIES) expenseGroup.appendChild(buildOption(`expense:${c.id}`, c.label));
  const incomeGroup = document.createElement("optgroup");
  incomeGroup.label = "収入";
  for (const c of INCOME_CATEGORIES) incomeGroup.appendChild(buildOption(`income:${c.id}`, c.label));
  categorySelect.append(expenseGroup, incomeGroup);

  const methodSelect = document.getElementById("filter-method");
  methodSelect.textContent = "";
  methodSelect.appendChild(buildOption("", "支払い方法: すべて"));
  for (const m of METHODS) methodSelect.appendChild(buildOption(m.id, m.label));

  categorySelect.addEventListener("change", () => {
    filter.category = categorySelect.value;
    renderList();
  });
  methodSelect.addEventListener("change", () => {
    filter.method = methodSelect.value;
    renderList();
  });
  document.getElementById("filter-keyword").addEventListener("input", (e) => {
    filter.keyword = e.target.value.trim();
    renderList();
  });
}

function buildOption(value, label) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  return opt;
}

function applyFilter(txs) {
  return txs.filter((t) => {
    if (filter.category && `${t.type}:${t.category}` !== filter.category) return false;
    if (filter.method && t.method !== filter.method) return false;
    if (filter.keyword && !t.memo.toLowerCase().includes(filter.keyword.toLowerCase())) return false;
    return true;
  });
}

/* ---------- エクスポート / インポート ---------- */
function setupImportExport() {
  document.getElementById("export-csv").addEventListener("click", () => {
    downloadFile(`kakeibo_${todayString()}.csv`, Store.exportCSV(), "text/csv");
  });
  document.getElementById("export-json").addEventListener("click", () => {
    downloadFile(`kakeibo_${todayString()}.json`, Store.exportJSON(), "application/json");
  });
  document.getElementById("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { added, skipped } = Store.importText(text);
      showToast(`${added}件を取り込みました${skipped > 0 ? `(${skipped}件スキップ)` : ""}`);
      render();
    } catch (err) {
      console.error(err);
      showToast("インポートに失敗しました: 形式を確認してください");
    } finally {
      e.target.value = "";
    }
  });
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- 月ナビゲーション ---------- */
function setupMonthNav() {
  document.getElementById("prev-month").addEventListener("click", () => {
    currentMonth = shiftMonth(currentMonth, -1);
    render();
  });
  document.getElementById("next-month").addEventListener("click", () => {
    currentMonth = shiftMonth(currentMonth, 1);
    render();
  });
}

/* ---------- 描画 ---------- */
function render() {
  document.getElementById("current-month").textContent = monthLabel(currentMonth);
  renderSummary();
  renderList();
  renderCharts();
}

function renderCharts() {
  if (document.getElementById("panel-charts").hidden) return;
  renderTrendChart(document.getElementById("chart-trend"), Store.monthlyTotals(6, currentMonth));
  renderBreakdownChart(
    document.getElementById("chart-category"),
    Store.expenseByCategory(currentMonth),
    "この月の支出データがありません"
  );
  renderBreakdownChart(
    document.getElementById("chart-method"),
    Store.expenseByMethod(currentMonth),
    "この月の支出データがありません"
  );
}

function renderSummary() {
  const { income, expense, balance } = Store.summary(currentMonth);
  document.getElementById("summary-income").textContent = formatYen(income);
  document.getElementById("summary-expense").textContent = formatYen(expense);
  const balanceEl = document.getElementById("summary-balance");
  balanceEl.textContent = `${balance < 0 ? "-" : "+"}${formatYen(balance)}`;
  balanceEl.classList.toggle("positive", balance >= 0);
  balanceEl.classList.toggle("negative", balance < 0);
}

function renderList() {
  const container = document.getElementById("tx-list");
  container.textContent = "";
  const all = Store.byMonth(currentMonth);
  const txs = applyFilter(all);

  if (txs.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = all.length === 0
      ? "この月の記録はまだありません"
      : "絞り込み条件に一致する記録がありません";
    container.appendChild(p);
    return;
  }

  let lastDate = null;
  for (const tx of txs) {
    if (tx.date !== lastDate) {
      lastDate = tx.date;
      const h = document.createElement("p");
      h.className = "tx-date-group";
      const [y, m, d] = tx.date.split("-");
      h.textContent = `${Number(m)}月${Number(d)}日`;
      container.appendChild(h);
    }
    container.appendChild(buildTxRow(tx));
  }
}

function buildTxRow(tx) {
  const row = document.createElement("div");
  row.className = "tx-row";

  const main = document.createElement("div");
  main.className = "tx-main";

  const memo = document.createElement("div");
  memo.className = "tx-memo";
  memo.textContent = tx.memo || categoryLabel(tx.type, tx.category);
  main.appendChild(memo);

  const meta = document.createElement("div");
  meta.className = "tx-meta";
  meta.textContent = `${categoryLabel(tx.type, tx.category)} ・ ${methodLabel(tx.method)}`;
  main.appendChild(meta);

  const amount = document.createElement("span");
  amount.className = `tx-amount ${tx.type}`;
  amount.textContent = `${tx.type === "income" ? "+" : "-"}${formatYen(tx.amount)}`;

  const actions = document.createElement("div");
  actions.className = "tx-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "icon-btn";
  editBtn.textContent = "✏️";
  editBtn.setAttribute("aria-label", "編集");
  editBtn.addEventListener("click", () => enterEditMode(tx));
  actions.appendChild(editBtn);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "icon-btn";
  delBtn.textContent = "🗑️";
  delBtn.setAttribute("aria-label", "削除");
  delBtn.addEventListener("click", () => {
    if (confirm(`「${tx.memo || categoryLabel(tx.type, tx.category)}」を削除しますか?`)) {
      Store.remove(tx.id);
      showToast("削除しました");
      render();
    }
  });
  actions.appendChild(delBtn);

  row.append(main, amount, actions);
  return row;
}

/* ---------- トースト ---------- */
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

/* ---------- 起動 ---------- */
Store.load();
setupTabs();
setupForm();
setupFilters();
setupImportExport();
setupMonthNav();
render();

// OSのテーマが切り替わったらグラフを描き直す(グラフ色はCSS変数から都度取得)
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

/* app.js — 画面制御: タブ・フォーム・一覧・サマリー */
"use strict";

const yen = new Intl.NumberFormat("ja-JP");
function formatYen(n) {
  return `¥${yen.format(Math.abs(n))}`;
}

/** 表示中の月 ("YYYY-MM") */
let currentMonth = toMonthString(new Date());

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
function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", String(active));
        document.getElementById(`panel-${t.dataset.tab}`).hidden = !active;
      });
      render();
    });
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

    Store.add({ type, date, amount, category, method, memo });

    // 入力した明細の月を表示して結果が見えるようにする
    currentMonth = date.slice(0, 7);
    document.getElementById("entry-amount").value = "";
    document.getElementById("entry-memo").value = "";
    showToast(`${type === "income" ? "収入" : "支出"} ${formatYen(amount)} を記録しました`);
    render();
  });
}

function validateEntry({ date, amount }) {
  if (!date) return "日付を入力してください";
  if (!Number.isFinite(amount) || amount <= 0) return "金額は1円以上の数値で入力してください";
  if (!Number.isInteger(amount)) return "金額は整数(円)で入力してください";
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
  const txs = Store.byMonth(currentMonth);

  if (txs.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "この月の記録はまだありません";
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
setupMonthNav();
render();

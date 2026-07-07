/* store.js — データ層: 定義・localStorage 永続化・CRUD・集計 */
"use strict";

const STORAGE_KEY = "kakeibo.v1";
const SCHEMA_VERSION = 1;

/** 支出カテゴリ(表示順 = この定義順) */
const EXPENSE_CATEGORIES = [
  { id: "food", label: "食費" },
  { id: "daily", label: "日用品" },
  { id: "transport", label: "交通費" },
  { id: "housing", label: "住居" },
  { id: "utility", label: "水道光熱" },
  { id: "comm", label: "通信" },
  { id: "medical", label: "医療・健康" },
  { id: "social", label: "交際費" },
  { id: "hobby", label: "趣味・娯楽" },
  { id: "clothing", label: "衣服・美容" },
  { id: "other", label: "その他" },
];

/** 収入カテゴリ */
const INCOME_CATEGORIES = [
  { id: "salary", label: "給与" },
  { id: "bonus", label: "賞与" },
  { id: "side", label: "副業" },
  { id: "extra", label: "臨時収入" },
  { id: "other_income", label: "その他" },
];

/** 支払い方法(何から使ったか) */
const METHODS = [
  { id: "cash", label: "現金" },
  { id: "credit", label: "クレジットカード" },
  { id: "suica", label: "Suica" },
  { id: "paypay", label: "PayPay" },
  { id: "bank", label: "銀行口座" },
  { id: "other", label: "その他" },
];

function categoryLabel(type, id) {
  const list = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const found = list.find((c) => c.id === id);
  return found ? found.label : id;
}

function methodLabel(id) {
  const found = METHODS.find((m) => m.id === id);
  return found ? found.label : id;
}

const Store = {
  transactions: [],

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.transactions)) {
        this.transactions = data.transactions.filter(isValidTransaction);
      }
    } catch (e) {
      console.error("データの読み込みに失敗しました", e);
    }
  },

  persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, transactions: this.transactions })
    );
  },

  add({ type, date, amount, category, method, memo }) {
    const tx = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      date,
      amount: Math.round(amount),
      category,
      method,
      memo: memo || "",
      createdAt: new Date().toISOString(),
    };
    this.transactions.push(tx);
    this.persist();
    return tx;
  },

  remove(id) {
    this.transactions = this.transactions.filter((t) => t.id !== id);
    this.persist();
  },

  /** 指定月 ("YYYY-MM") の明細を新しい順で返す */
  byMonth(month) {
    return this.transactions
      .filter((t) => t.date.startsWith(month))
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  },

  /** 指定月の { income, expense, balance } を返す */
  summary(month) {
    let income = 0;
    let expense = 0;
    for (const t of this.transactions) {
      if (!t.date.startsWith(month)) continue;
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, balance: income - expense };
  },
};

function isValidTransaction(t) {
  return (
    t &&
    typeof t.id === "string" &&
    (t.type === "expense" || t.type === "income") &&
    typeof t.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
    Number.isFinite(t.amount) &&
    t.amount > 0 &&
    typeof t.category === "string" &&
    typeof t.method === "string"
  );
}

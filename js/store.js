/* Data store — localStorage-backed, pub/sub so every view re-renders on change. */

const Store = (() => {
  const KEY = "tacticalPlan.rows.v1";
  const FIELDS = [
    "imperative", "csf", "initiative", "function", "tactic", "deliverable",
    "category", "subcategory", "priority", "status", "start", "end",
    "lead", "budget", "comments"
  ];
  const LABELS = {
    imperative: "Imperative", csf: "CSF", initiative: "Tactical Initiative",
    function: "Function", tactic: "Tactic", deliverable: "Deliverable(s)",
    category: "Category", subcategory: "Subcategory", priority: "Priority",
    status: "Status", start: "Start date", end: "End date", lead: "Lead",
    budget: "Budget", comments: "Comments"
  };

  let rows = [];
  const listeners = [];

  function blankRow() {
    const r = {};
    FIELDS.forEach(f => { r[f] = ""; });
    return r;
  }

  function normalize(raw) {
    // keep only known fields, coerce to strings
    return raw.map(item => {
      const r = blankRow();
      FIELDS.forEach(f => { if (item[f] != null) r[f] = String(item[f]); });
      return r;
    });
  }

  function load() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        rows = normalize(JSON.parse(saved));
        return;
      }
    } catch (e) { /* corrupted or unavailable storage — fall back to seed */ }
    rows = normalize(SEED_DATA);
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) { /* storage full/blocked */ }
  }

  function notify() {
    listeners.forEach(fn => fn());
  }

  return {
    FIELDS, LABELS,
    load,
    getRows: () => rows,
    subscribe(fn) { listeners.push(fn); },

    setCell(index, field, value) {
      if (!rows[index] || !FIELDS.includes(field)) return false;
      if (rows[index][field] === value) return false;
      rows[index][field] = value;
      persist();
      notify();
      return true;
    },

    addRow() {
      rows.push(blankRow());
      persist();
      notify();
      return rows.length - 1;
    },

    deleteRow(index) {
      if (!rows[index]) return;
      rows.splice(index, 1);
      persist();
      notify();
    },

    reset() {
      rows = normalize(SEED_DATA);
      persist();
      notify();
    },

    /* Distinct non-empty values of a field, in first-appearance order. */
    distinct(field) {
      const seen = [];
      rows.forEach(r => {
        const v = r[field];
        if (v && !seen.includes(v)) seen.push(v);
      });
      return seen;
    },

    budgetOf(row) {
      const n = parseFloat(String(row.budget).replace(/[$,\s]/g, ""));
      return isFinite(n) ? n : 0;
    },

    statusOf(row) {
      return row.status && row.status.trim() ? row.status.trim() : "Not started";
    }
  };
})();

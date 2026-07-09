/* Dashboard views — one renderer parameterized by grouping dimension.
   "category" groups by Category and details Function; "function" is the mirror. */

const Dashboards = (() => {

  /* Fixed entity→color map (color follows the entity, never its rank/filter state).
     The 5 category hues are the validated categorical slots from styles.css. */
  const CATEGORY_COLORS = {
    "KOL amplification":     "#4a3aa7",
    "Evidence engine":       "#2E5EAA",
    "Promotional resources": "#e87ba4",
    "Field execution":       "#EF5F17",
    "Fulfillment":           "#1baf7a"
  };
  const OTHER_COLOR = "#8a9099";
  const FUNCTION_COLOR = "#2E5EAA"; // 10 functions > slot ceiling → one hue, identity via labels

  const PRIORITY_ORDER = ["Must do", "Should do", "Nice-to-have"];
  const PRIORITY_COLORS = { "Must do": "#1D468C", "Should do": "#4A77BE", "Nice-to-have": "#9EB6DE" };

  const STATUS_ORDER = ["Complete", "Initiated", "Not started"];
  const STATUS_COLORS = { "Complete": "#0ca30c", "Initiated": "#fab219", "Not started": "#c3c2b7" };
  const STATUS_ICONS = { "Complete": "✓", "Initiated": "◔", "Not started": "○" };

  function catColor(name) { return CATEGORY_COLORS[name] || OTHER_COLOR; }

  /* per-view filter state, kept across re-renders */
  const state = {
    category: { group: "", status: "", priority: "", search: "" },
    function: { group: "", status: "", priority: "", search: "" }
  };

  function groupValue(row, field) {
    return row[field] && row[field].trim() ? row[field].trim() : "(unassigned)";
  }

  function applyFilters(rows, f) {
    return rows.filter(r => {
      if (f.status && Store.statusOf(r) !== f.status) return false;
      if (f.priority && r.priority !== f.priority) return false;
      if (f.search) {
        const q = f.search.toLowerCase();
        const hay = Store.FIELDS.map(k => r[k]).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function statusBadge(status) {
    const span = document.createElement("span");
    span.className = "status-badge";
    const dot = document.createElement("span");
    dot.className = "status-dot";
    dot.style.background = STATUS_COLORS[status] || STATUS_COLORS["Not started"];
    span.appendChild(dot);
    span.appendChild(document.createTextNode(`${STATUS_ICONS[status] || ""} ${status}`));
    return span;
  }

  function kpi(label, value, sub, accent) {
    const d = document.createElement("div");
    d.className = "kpi" + (accent ? " kpi-accent" : "");
    const l = document.createElement("div"); l.className = "kpi-label"; l.textContent = label;
    const v = document.createElement("div"); v.className = "kpi-value"; v.textContent = value;
    d.appendChild(l); d.appendChild(v);
    if (sub) { const s = document.createElement("div"); s.className = "kpi-sub"; s.textContent = sub; d.appendChild(s); }
    return d;
  }

  function chartCard(title, sub) {
    const card = document.createElement("div");
    card.className = "chart-card";
    const h = document.createElement("h3"); h.textContent = title;
    card.appendChild(h);
    if (sub) { const s = document.createElement("div"); s.className = "chart-sub"; s.textContent = sub; card.appendChild(s); }
    const body = document.createElement("div");
    card.appendChild(body);
    return { card, body };
  }

  /* ---------------- main renderer ---------------- */

  function render(root, mode) {
    const groupField = mode === "category" ? "category" : "function";
    const crossField = mode === "category" ? "function" : "category";
    const crossLabel = mode === "category" ? "Function" : "Category";
    const groupLabel = mode === "category" ? "Category" : "Function";
    const f = state[mode];

    const allRows = Store.getRows();
    let rows = applyFilters(allRows, f);

    /* group selector options come from ALL rows (not the filtered slice), so
       the dropdown never loses entries as other filters narrow the view */
    const groupOptions = [];
    allRows.forEach(r => {
      const g = groupValue(r, groupField);
      if (!groupOptions.includes(g)) groupOptions.push(g);
    });
    groupOptions.sort((a, b) => a.localeCompare(b));
    if (f.group && !groupOptions.includes(f.group)) f.group = "";
    if (f.group) rows = rows.filter(r => groupValue(r, groupField) === f.group);

    root.textContent = "";

    /* ---- filter row (one row, above everything it scopes) ---- */
    const bar = document.createElement("div");
    bar.className = "filter-row";
    bar.appendChild(filterSelect(groupLabel, ["", ...groupOptions], f.group,
      v => { f.group = v; render(root, mode); },
      `All ${groupLabel.toLowerCase() === "category" ? "categories" : "functions"}`));
    bar.appendChild(filterSelect("Status", ["", ...STATUS_ORDER], f.status, v => { f.status = v; render(root, mode); }));
    bar.appendChild(filterSelect("Priority", ["", ...PRIORITY_ORDER], f.priority, v => { f.priority = v; render(root, mode); }));

    const searchField = document.createElement("div");
    searchField.className = "filter-field";
    const sl = document.createElement("label"); sl.textContent = "Search"; sl.htmlFor = `search-${mode}`;
    const si = document.createElement("input");
    si.type = "search"; si.id = `search-${mode}`; si.placeholder = "Tactic, deliverable, lead…"; si.value = f.search;
    si.addEventListener("input", () => {
      f.search = si.value;
      clearTimeout(si._t);
      si._t = setTimeout(() => render(root, mode), 200);
    });
    searchField.appendChild(sl); searchField.appendChild(si);
    bar.appendChild(searchField);

    if (f.group || f.status || f.priority || f.search) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "btn btn-ghost filter-clear";
      clear.textContent = "Clear filters";
      clear.addEventListener("click", () => { f.group = ""; f.status = ""; f.priority = ""; f.search = ""; render(root, mode); });
      bar.appendChild(clear);
    }
    root.appendChild(bar);

    /* ---- group aggregation ---- */
    const groups = new Map();
    rows.forEach(r => {
      const g = groupValue(r, groupField);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    });
    const groupNames = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);
    const colorOf = mode === "category" ? catColor : () => FUNCTION_COLOR;

    /* ---- KPI row ---- */
    const totalBudget = rows.reduce((s, r) => s + Store.budgetOf(r), 0);
    const complete = rows.filter(r => Store.statusOf(r) === "Complete").length;
    const mustDo = rows.filter(r => r.priority === "Must do").length;
    const kpis = document.createElement("div");
    kpis.className = "kpi-row";
    kpis.appendChild(kpi("Tactics in view", String(rows.length), `of ${allRows.length} total`, true));
    kpis.appendChild(kpi(groupLabel === "Category" ? "Categories" : "Functions", String(groupNames.length), "with tactics in view"));
    kpis.appendChild(kpi("Complete", String(complete), rows.length ? Math.round(100 * complete / rows.length) + "% of view" : ""));
    kpis.appendChild(kpi("Must-do tactics", String(mustDo), "highest priority"));
    kpis.appendChild(kpi("Budget in view", totalBudget > 0 ? Charts.fmtMoney(totalBudget) : "$0", totalBudget > 0 ? "sum of entered budgets" : "add budgets on the Data page"));
    root.appendChild(kpis);

    /* ---- charts ----
       Default: bars per group. With a single group selected, the bar charts
       pivot to the cross dimension so the view reads as a drill-down instead
       of a one-bar chart. */
    const drill = Boolean(f.group);
    const chartField = drill ? crossField : groupField;
    const chartDim = drill ? crossLabel : groupLabel;
    const chartGroups = new Map();
    rows.forEach(r => {
      const g = groupValue(r, chartField);
      if (!chartGroups.has(g)) chartGroups.set(g, []);
      chartGroups.get(g).push(r);
    });
    const chartNames = [...chartGroups.keys()].sort((a, b) => chartGroups.get(b).length - chartGroups.get(a).length);
    const chartColorOf = chartField === "category" ? catColor : () => FUNCTION_COLOR;

    const grid = document.createElement("div");
    grid.className = "chart-grid";

    const inSel = drill ? ` in ${f.group}` : "";
    const c1 = chartCard(`Tactics by ${chartDim.toLowerCase()}${inSel}`,
      drill ? `How ${f.group} breaks down by ${chartDim.toLowerCase()}` : "Click a bar to jump to its details");
    Charts.hBars(c1.body, chartNames.map(g => ({
      label: g, value: chartGroups.get(g).length, color: chartColorOf(g), sub: "tactics"
    })), {
      onClick: drill ? null : item => revealGroup(root, item.label),
      title: `Tactics by ${chartDim.toLowerCase()}`
    });
    grid.appendChild(c1.card);

    const c2 = chartCard(`Priority mix${inSel}`, `Must do → Nice-to-have per ${chartDim.toLowerCase()}`);
    Charts.stackedHBars(c2.body, chartNames.map(g => ({
      label: g,
      segments: PRIORITY_ORDER.map(p => ({
        key: p, color: PRIORITY_COLORS[p],
        value: chartGroups.get(g).filter(r => r.priority === p).length
      }))
    })));
    Charts.legend(c2.body, PRIORITY_ORDER.map(p => ({ label: p, color: PRIORITY_COLORS[p] })));
    grid.appendChild(c2.card);

    const c3 = chartCard(`Status overview${inSel}`, "All tactics in the current view");
    Charts.donut(c3.body, STATUS_ORDER.map(s => ({
      key: s, color: STATUS_COLORS[s],
      value: rows.filter(r => Store.statusOf(r) === s).length
    })));
    Charts.legend(c3.body, STATUS_ORDER.map(s => ({
      label: `${STATUS_ICONS[s]} ${s} · ${rows.filter(r => Store.statusOf(r) === s).length}`,
      color: STATUS_COLORS[s]
    })));
    grid.appendChild(c3.card);

    const c4 = chartCard(`Budget by ${chartDim.toLowerCase()}${inSel}`, "Sum of budgets entered on the Data page");
    Charts.hBars(c4.body, chartNames.map(g => ({
      label: g, value: chartGroups.get(g).reduce((s, r) => s + Store.budgetOf(r), 0),
      color: chartColorOf(g), sub: "budget"
    })), {
      format: Charts.fmtMoney,
      emptyText: "No budgets entered yet — add amounts in the Budget column on the Data page and this chart fills in."
    });
    grid.appendChild(c4.card);

    root.appendChild(grid);

    /* ---- group detail cards ---- */
    const title = document.createElement("h2");
    title.className = "section-title";
    title.textContent = `${groupLabel} details`;
    root.appendChild(title);
    const note = document.createElement("p");
    note.className = "section-note";
    note.textContent = `Expand a ${groupLabel.toLowerCase()} for its subcategories, deliverables, tactics, status, budget and ${crossLabel.toLowerCase()}.`;
    root.appendChild(note);

    const list = document.createElement("div");
    list.className = "group-list";
    groupNames.forEach(g => {
      const card = groupCard(g, groups.get(g), colorOf(g), crossField, crossLabel);
      if (f.group) card.open = true; // single group selected — show its details right away
      list.appendChild(card);
    });
    if (!groupNames.length) {
      const empty = document.createElement("div");
      empty.className = "chart-empty";
      empty.textContent = "Nothing matches the current filters.";
      list.appendChild(empty);
    }
    root.appendChild(list);
  }

  function filterSelect(label, options, current, onChange, allLabel) {
    const wrap = document.createElement("div");
    wrap.className = "filter-field";
    const l = document.createElement("label");
    l.textContent = label;
    const sel = document.createElement("select");
    l.htmlFor = sel.id = "flt-" + label + "-" + Math.random().toString(36).slice(2, 7);
    options.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o === "" ? (allLabel || "All") : o;
      if (o === current) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => onChange(sel.value));
    wrap.appendChild(l); wrap.appendChild(sel);
    return wrap;
  }

  function revealGroup(root, name) {
    const card = root.querySelector(`details[data-group="${CSS.escape(name)}"]`);
    if (!card) return;
    card.open = true;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1200);
  }

  function groupCard(name, rows, color, crossField, crossLabel) {
    const details = document.createElement("details");
    details.className = "group-card";
    details.dataset.group = name;

    const summary = document.createElement("summary");
    const chip = document.createElement("span");
    chip.className = "group-chip";
    chip.style.background = color;
    summary.appendChild(chip);

    const nm = document.createElement("span");
    nm.className = "group-name";
    nm.textContent = name;
    summary.appendChild(nm);

    const meta = document.createElement("span");
    meta.className = "group-meta";

    const count = document.createElement("span");
    count.className = "group-stat";
    const strong = document.createElement("strong");
    strong.textContent = String(rows.length);
    count.appendChild(strong);
    count.appendChild(document.createTextNode(rows.length === 1 ? " tactic" : " tactics"));
    meta.appendChild(count);

    const budget = rows.reduce((s, r) => s + Store.budgetOf(r), 0);
    const b = document.createElement("span");
    b.className = "group-stat";
    const bs = document.createElement("strong");
    bs.textContent = budget > 0 ? Charts.fmtMoney(budget) : "$0";
    b.appendChild(bs);
    b.appendChild(document.createTextNode(" budget"));
    meta.appendChild(b);

    const pills = document.createElement("span");
    pills.className = "status-pills";
    STATUS_ORDER.forEach(s => {
      const n = rows.filter(r => Store.statusOf(r) === s).length;
      if (!n) return;
      const pill = document.createElement("span");
      pill.className = "status-pill";
      const dot = document.createElement("span");
      dot.className = "status-dot";
      dot.style.background = STATUS_COLORS[s];
      pill.appendChild(dot);
      pill.appendChild(document.createTextNode(`${s} ${n}`));
      pills.appendChild(pill);
    });
    meta.appendChild(pills);

    const caret = document.createElement("span");
    caret.className = "caret";
    caret.textContent = "▶";
    meta.appendChild(caret);
    summary.appendChild(meta);
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "group-body";

    // subcategory chips
    const subcats = new Map();
    rows.forEach(r => {
      const s = r.subcategory && r.subcategory.trim() ? r.subcategory.trim() : null;
      if (s) subcats.set(s, (subcats.get(s) || 0) + 1);
    });
    if (subcats.size) {
      const chips = document.createElement("div");
      chips.className = "subcat-chips";
      [...subcats.entries()].sort((a, b) => b[1] - a[1]).forEach(([s, n]) => {
        const c = document.createElement("span");
        c.className = "subcat-chip";
        c.textContent = `${s} · ${n}`;
        chips.appendChild(c);
      });
      body.appendChild(chips);
    }

    // detail table: subcategory, deliverable, tactic, status, budget, cross-dimension
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const table = document.createElement("table");
    table.className = "detail";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    ["Subcategory", "Deliverable", "Tactic", "Status", "Budget", crossLabel].forEach(h => {
      const th = document.createElement("th");
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const sorted = [...rows].sort((a, b) =>
      (a.subcategory || "￿").localeCompare(b.subcategory || "￿") ||
      (a.tactic || "").localeCompare(b.tactic || ""));
    sorted.forEach(r => {
      const tr = document.createElement("tr");
      tr.appendChild(td(r.subcategory || "—"));
      tr.appendChild(td(r.deliverable || "—"));
      tr.appendChild(td(r.tactic || "—", "strong"));
      const st = document.createElement("td");
      st.appendChild(statusBadge(Store.statusOf(r)));
      tr.appendChild(st);
      const bud = Store.budgetOf(r);
      tr.appendChild(td(bud > 0 ? Charts.fmtMoney(bud) : "—", "num"));
      tr.appendChild(td(r[crossField] || "—"));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    body.appendChild(wrap);
    details.appendChild(body);
    return details;
  }

  function td(text, cls) {
    const cell = document.createElement("td");
    if (cls) cell.className = cls;
    cell.textContent = text;
    return cell;
  }

  return { render };
})();

/* Data page — the full Master-sheet table, editable in place.
   Click a cell to edit; constrained columns (function, category, subcategory,
   priority, status, imperative, csf) get a dropdown of existing values plus
   free-text entry. Every commit persists and re-renders the dashboards. */

const DataPage = (() => {

  const SELECT_FIELDS = ["imperative", "csf", "function", "category", "subcategory", "priority", "status"];
  const state = { search: "", scrollTop: 0, scrollLeft: 0 };

  function render(root) {
    const prev = root.querySelector("#grid-wrap") || document.getElementById("grid-wrap");
    if (prev) { state.scrollTop = prev.scrollTop; state.scrollLeft = prev.scrollLeft; }
    root.textContent = "";

    const toolbar = document.createElement("div");
    toolbar.className = "data-toolbar";

    const search = document.createElement("input");
    search.type = "search";
    search.className = "data-search";
    search.placeholder = "Filter rows…";
    search.value = state.search;
    search.addEventListener("input", () => {
      state.search = search.value;
      clearTimeout(search._t);
      search._t = setTimeout(() => renderTable(root), 200);
    });
    toolbar.appendChild(search);

    const count = document.createElement("span");
    count.className = "data-count";
    count.id = "data-count";
    toolbar.appendChild(count);

    const spacer = document.createElement("span");
    spacer.className = "spacer";
    toolbar.appendChild(spacer);

    const addBtn = button("Add row", "btn btn-primary", () => {
      state.search = "";
      Store.addRow();
    });

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".csv,.txt,.xlsx,.xls,.xlsm";
    fileInput.hidden = true;
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      try {
        const result = await Importer.importFile(file);
        const mode = await Importer.confirmImport(result);
        if (!mode) return;
        state.search = "";
        const n = Store.importRows(result.records, mode);
        flashSaved(`Imported ${n} rows — dashboards updated`);
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    });
    const importBtn = button("Import Excel / CSV", "btn btn-secondary", () => fileInput.click());

    const exportBtn = button("Export CSV", "btn btn-secondary", exportCsv);
    const resetBtn = button("Reset data", "btn btn-ghost", () => {
      if (confirm("Discard all edits and restore the original spreadsheet data?")) Store.reset();
    });
    toolbar.appendChild(addBtn);
    toolbar.appendChild(importBtn);
    toolbar.appendChild(fileInput);
    toolbar.appendChild(exportBtn);
    toolbar.appendChild(resetBtn);
    root.appendChild(toolbar);

    const wrap = document.createElement("div");
    wrap.className = "grid-wrap";
    wrap.id = "grid-wrap";
    root.appendChild(wrap);

    const hint = document.createElement("p");
    hint.className = "section-note";
    hint.style.marginTop = "0.75rem";
    hint.textContent = "Click any cell to edit — changes save automatically and update both dashboards. Budget accepts numbers (e.g. 25000). Import accepts .xlsx, .xls, or .csv files whose first row has the Master-sheet column headers.";
    root.appendChild(hint);

    renderTable(root);
  }

  function renderTable(root) {
    const wrap = root.querySelector("#grid-wrap");
    if (!wrap) return;
    wrap.textContent = "";

    const rows = Store.getRows();
    const q = state.search.trim().toLowerCase();
    const visible = [];
    rows.forEach((r, i) => {
      if (!q || Store.FIELDS.map(k => r[k]).join(" ").toLowerCase().includes(q)) visible.push(i);
    });

    const count = root.querySelector("#data-count");
    if (count) count.textContent = q ? `${visible.length} of ${rows.length} rows` : `${rows.length} rows`;

    const table = document.createElement("table");
    table.className = "grid";

    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const numTh = document.createElement("th");
    numTh.textContent = "#";
    hr.appendChild(numTh);
    Store.FIELDS.forEach(f => {
      const th = document.createElement("th");
      th.textContent = Store.LABELS[f];
      hr.appendChild(th);
    });
    const delTh = document.createElement("th");
    delTh.textContent = "";
    hr.appendChild(delTh);
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    visible.forEach(i => {
      const r = rows[i];
      const tr = document.createElement("tr");

      const num = document.createElement("td");
      num.className = "row-num";
      num.textContent = String(i + 1);
      tr.appendChild(num);

      Store.FIELDS.forEach(f => {
        tr.appendChild(cellTd(i, f, r[f]));
      });

      const delTd = document.createElement("td");
      delTd.className = "row-num";
      const del = document.createElement("button");
      del.type = "button";
      del.className = "row-del";
      del.title = "Delete row";
      del.setAttribute("aria-label", `Delete row ${i + 1}`);
      del.textContent = "✕";
      del.addEventListener("click", () => {
        if (confirm(`Delete row ${i + 1}${r.tactic ? ` (“${r.tactic}”)` : ""}?`)) Store.deleteRow(i);
      });
      delTd.appendChild(del);
      tr.appendChild(delTd);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    wrap.scrollTop = state.scrollTop;
    wrap.scrollLeft = state.scrollLeft;
  }

  function cellTd(rowIndex, field, value) {
    const td = document.createElement("td");
    const cell = document.createElement("span");
    cell.className = "cell";
    cell.tabIndex = 0;
    cell.textContent = value;
    cell.setAttribute("role", "button");
    cell.setAttribute("aria-label", `${Store.LABELS[field]}, row ${rowIndex + 1}: ${value || "empty"}. Press Enter to edit.`);

    const startEdit = () => beginEdit(td, rowIndex, field);
    cell.addEventListener("click", startEdit);
    cell.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startEdit(); }
    });
    td.appendChild(cell);
    return td;
  }

  function beginEdit(td, rowIndex, field) {
    const current = Store.getRows()[rowIndex][field];
    td.textContent = "";

    let editor;
    if (SELECT_FIELDS.includes(field)) {
      editor = document.createElement("select");
      editor.className = "cell-select";
      const opts = Store.distinct(field);
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "— empty —";
      editor.appendChild(blank);
      opts.forEach(o => {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        if (o === current) opt.selected = true;
        editor.appendChild(opt);
      });
      const custom = document.createElement("option");
      custom.value = "__custom__";
      custom.textContent = "✎ Type a new value…";
      editor.appendChild(custom);

      editor.addEventListener("change", () => {
        if (editor.value === "__custom__") {
          swapToTextInput(td, rowIndex, field, current);
        } else {
          commit(td, rowIndex, field, editor.value);
        }
      });
      editor.addEventListener("blur", () => {
        if (editor.value !== "__custom__") commit(td, rowIndex, field, editor.value);
      });
      editor.addEventListener("keydown", e => {
        if (e.key === "Escape") commit(td, rowIndex, field, current);
      });
    } else {
      editor = makeTextInput(td, rowIndex, field, current);
    }

    td.appendChild(editor);
    editor.focus();
    if (editor.select) editor.select();
  }

  function makeTextInput(td, rowIndex, field, current) {
    const input = document.createElement("input");
    input.className = "cell-input";
    input.type = field === "budget" ? "number" : (field === "start" || field === "end") ? "date" : "text";
    if (field === "budget") { input.min = "0"; input.step = "any"; }
    input.value = current;
    input.addEventListener("blur", () => commit(td, rowIndex, field, input.value));
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); commit(td, rowIndex, field, input.value); }
      if (e.key === "Escape") { e.preventDefault(); commit(td, rowIndex, field, current); }
    });
    return input;
  }

  function swapToTextInput(td, rowIndex, field, current) {
    td.textContent = "";
    const input = makeTextInput(td, rowIndex, field, current);
    td.appendChild(input);
    input.focus();
    input.select();
  }

  function commit(td, rowIndex, field, value) {
    const changed = Store.setCell(rowIndex, field, value.trim());
    if (changed) {
      flashSaved();
      // Store.notify re-renders the whole view; nothing more to do.
    } else {
      // unchanged — restore the plain cell without a full re-render
      const fresh = cellTd(rowIndex, field, Store.getRows()[rowIndex][field]);
      td.replaceWith(fresh);
    }
  }

  function flashSaved(message) {
    let el = document.querySelector(".save-flash");
    if (!el) {
      el = document.createElement("div");
      el.className = "save-flash";
      document.body.appendChild(el);
    }
    el.textContent = message || "Saved — dashboards updated";
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 1600);
  }

  function exportCsv() {
    const esc = v => {
      const s = String(v == null ? "" : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [Store.FIELDS.map(f => esc(Store.LABELS[f])).join(",")];
    Store.getRows().forEach(r => lines.push(Store.FIELDS.map(f => esc(r[f])).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tactical-plan.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function button(label, cls, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  return { render };
})();

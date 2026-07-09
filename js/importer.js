/* File import — CSV (native parser, no dependencies) and Excel (.xlsx/.xls via
   the vendored SheetJS mini build, lazy-loaded on first use).

   Headers are matched case/punctuation-insensitively against the Master-sheet
   column names, so both the original workbook and this app's own CSV export
   round-trip cleanly. Unknown columns are ignored; missing ones import empty. */

const Importer = (() => {

  /* normalized header → store field */
  const HEADER_MAP = {
    imperative: "imperative",
    csf: "csf",
    tacticalinitiative: "initiative",
    initiative: "initiative",
    function: "function",
    tactic: "tactic",
    deliverable: "deliverable",
    deliverables: "deliverable",
    category: "category",
    subcategory: "subcategory",
    priority: "priority",
    status: "status",
    startdate: "start",
    start: "start",
    enddate: "end",
    end: "end",
    lead: "lead",
    budget: "budget",
    comments: "comments",
    comment: "comments"
  };

  function normHeader(h) {
    return String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  /* ---------- CSV (RFC 4180: quoted fields, embedded commas/quotes/newlines) ---------- */

  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    // strip BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /* ---------- Excel (lazy-load the vendored SheetJS build) ---------- */

  let xlsxLoading = null;
  function loadXlsxLib() {
    if (window.XLSX) return Promise.resolve();
    if (!xlsxLoading) {
      xlsxLoading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "js/vendor/xlsx.mini.min.js";
        s.onload = () => resolve();
        s.onerror = () => { xlsxLoading = null; reject(new Error("Could not load the Excel parser (js/vendor/xlsx.mini.min.js).")); };
        document.head.appendChild(s);
      });
    }
    return xlsxLoading;
  }

  async function parseExcel(file) {
    await loadXlsxLib();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    // prefer a sheet named like "Master sheet", else the first sheet
    const name = wb.SheetNames.find(n => normHeader(n).includes("master")) || wb.SheetNames[0];
    const ws = wb.Sheets[name];
    if (!ws) throw new Error("The workbook has no readable sheets.");
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    return { matrix, sheetName: name };
  }

  /* ---------- matrix → records ---------- */

  function matrixToRecords(matrix) {
    if (!matrix.length) throw new Error("The file is empty.");
    const headers = matrix[0].map(normHeader);
    const mapping = headers.map(h => HEADER_MAP[h] || null);
    const matched = mapping.filter(Boolean);
    if (!matched.length) {
      throw new Error("No recognizable columns found. The first row must contain headers like Category, Function, Tactic, Priority, Status, Budget…");
    }
    const records = [];
    for (let i = 1; i < matrix.length; i++) {
      const rec = {};
      let hasValue = false;
      mapping.forEach((field, col) => {
        if (!field) return;
        const v = String(matrix[i][col] == null ? "" : matrix[i][col]).trim();
        // first matching column wins if a header repeats
        if (!(field in rec) || rec[field] === "") rec[field] = v;
        if (v) hasValue = true;
      });
      if (hasValue) records.push(rec);
    }
    if (!records.length) throw new Error("Headers were recognized but no data rows were found.");
    return { records, matchedColumns: [...new Set(matched)] };
  }

  /* ---------- public entry: parse a File, then confirm + apply ---------- */

  async function importFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    let matrix, source;
    if (ext === "csv" || ext === "txt") {
      matrix = parseCsv(await file.text());
      source = "CSV";
    } else if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
      const parsed = await parseExcel(file);
      matrix = parsed.matrix;
      source = `Excel (sheet “${parsed.sheetName}”)`;
    } else {
      throw new Error(`Unsupported file type “.${ext}” — upload a .csv, .xlsx, or .xls file.`);
    }
    const { records, matchedColumns } = matrixToRecords(matrix);
    return { records, matchedColumns, source, fileName: file.name };
  }

  /* ---------- confirmation dialog ---------- */

  function confirmImport(result) {
    return new Promise(resolve => {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";

      const box = document.createElement("div");
      box.className = "modal";

      const h = document.createElement("h3");
      h.textContent = "Import data";
      box.appendChild(h);

      const p1 = document.createElement("p");
      p1.textContent = `${result.fileName} — ${result.source}`;
      p1.className = "modal-file";
      box.appendChild(p1);

      const p2 = document.createElement("p");
      p2.textContent = `Found ${result.records.length} row${result.records.length === 1 ? "" : "s"} across ${result.matchedColumns.length} recognized column${result.matchedColumns.length === 1 ? "" : "s"} (${result.matchedColumns.map(f => Store.LABELS[f]).join(", ")}).`;
      box.appendChild(p2);

      const p3 = document.createElement("p");
      p3.className = "modal-note";
      p3.textContent = "Replace swaps out everything currently in the app; Append adds these rows below the existing ones. Either way the dashboards update immediately.";
      box.appendChild(p3);

      const actions = document.createElement("div");
      actions.className = "modal-actions";

      const mkBtn = (label, cls, value) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = label;
        b.addEventListener("click", () => { document.body.removeChild(overlay); resolve(value); });
        return b;
      };
      actions.appendChild(mkBtn("Cancel", "btn btn-ghost", null));
      actions.appendChild(mkBtn(`Append ${result.records.length} rows`, "btn btn-secondary", "append"));
      actions.appendChild(mkBtn("Replace all data", "btn btn-primary", "replace"));
      box.appendChild(actions);

      overlay.appendChild(box);
      overlay.addEventListener("click", e => {
        if (e.target === overlay) { document.body.removeChild(overlay); resolve(null); }
      });
      document.body.appendChild(overlay);
      box.querySelector(".btn-primary").focus();
    });
  }

  return { importFile, confirmImport };
})();

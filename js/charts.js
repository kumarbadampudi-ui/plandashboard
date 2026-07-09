/* SVG chart primitives — horizontal bars, stacked bars, donut, legend, tooltip.
   Mark specs: bars ≤ 24px thick, 4px rounded data-end (square at baseline),
   2px surface gaps between stacked segments, hairline solid grid, direct
   labels in ink (never the series color). All labels inserted via textContent. */

const Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const SURFACE = "#ffffff";
  const INK2 = "#52514e";

  function el(name, attrs) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function fmtCount(n) { return String(n); }

  function fmtMoney(n) {
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + "K";
    return "$" + Math.round(n).toLocaleString("en-US");
  }

  /* ---- shared tooltip (content built with textContent only) ---- */

  const tip = () => document.getElementById("tooltip");

  function showTip(evt, title, rows) {
    const t = tip();
    t.textContent = "";
    if (title) {
      const h = document.createElement("div");
      h.className = "tt-title";
      h.textContent = title;
      t.appendChild(h);
    }
    (rows || []).forEach(r => {
      const line = document.createElement("div");
      line.className = "tt-row";
      if (r.color) {
        const key = document.createElement("span");
        key.className = "tt-key";
        key.style.background = r.color;
        line.appendChild(key);
      }
      const val = document.createElement("span");
      val.className = "tt-val";
      val.textContent = r.value;
      const lbl = document.createElement("span");
      lbl.className = "tt-lbl";
      lbl.textContent = r.label;
      line.appendChild(val);
      line.appendChild(lbl);
      t.appendChild(line);
    });
    t.hidden = false;
    moveTip(evt);
  }

  function moveTip(evt) {
    const t = tip();
    const pad = 14;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    const r = t.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    t.style.left = x + "px";
    t.style.top = y + "px";
  }

  function hideTip() { tip().hidden = true; }

  function bindTip(node, contentFn) {
    node.addEventListener("pointerenter", e => { const c = contentFn(); showTip(e, c.title, c.rows); });
    node.addEventListener("pointermove", moveTip);
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("focus", () => {
      const c = contentFn();
      const r = node.getBoundingClientRect();
      showTip({ clientX: r.right, clientY: r.top }, c.title, c.rows);
    });
    node.addEventListener("blur", hideTip);
  }

  /* Horizontal bar: rounded 4px at the data end (right), square at baseline. */
  function hBarPath(x, y, w, h) {
    const r = Math.min(4, w);
    return `M${x},${y} h${Math.max(0, w - r)} q${r},0 ${r},${r} v${Math.max(0, h - 2 * r)} q0,${r} -${r},${r} h${-Math.max(0, w - r)} z`;
  }

  /* ------------------------------------------------------------------
     Horizontal bar chart.
     items: [{label, value, color, sub}] — direct value label at bar tip.
     opts: {format, onClick(item), labelWidth}
     ------------------------------------------------------------------ */
  function hBars(container, items, opts = {}) {
    container.textContent = "";
    if (!items.length || items.every(i => !i.value)) {
      const empty = document.createElement("div");
      empty.className = "chart-empty";
      empty.textContent = opts.emptyText || "No data for the current filters.";
      container.appendChild(empty);
      return;
    }
    const fmt = opts.format || fmtCount;
    const labelW = opts.labelWidth || 150;
    const rowH = 30, barH = 16, padTop = 4, valueW = 56;
    const width = 560;
    const height = padTop + items.length * rowH + 4;
    const plotW = width - labelW - valueW - 8;
    const max = Math.max(...items.map(i => i.value));

    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" });
    if (opts.title) {
      const t = el("title", {});
      t.textContent = opts.title;
      svg.appendChild(t);
    }

    items.forEach((item, i) => {
      const y = padTop + i * rowH;
      const w = max > 0 ? Math.max(2, (item.value / max) * plotW) : 2;

      const g = el("g", { class: "bar-hit", tabindex: "0", role: "listitem" });

      // full-row transparent hit target (bigger than the mark)
      g.appendChild(el("rect", { x: 0, y: y - 2, width, height: rowH, fill: "transparent" }));

      const lbl = el("text", { x: labelW - 10, y: y + barH / 2 + 4.2, "text-anchor": "end", class: "axis-label" });
      lbl.textContent = item.label.length > 22 ? item.label.slice(0, 21) + "…" : item.label;
      g.appendChild(lbl);

      const bar = el("path", { d: hBarPath(labelW, y, w, barH), fill: item.color, class: "bar-mark" });
      g.appendChild(bar);

      const val = el("text", { x: labelW + w + 8, y: y + barH / 2 + 4.2, class: "value-label" });
      val.textContent = fmt(item.value);
      g.appendChild(val);

      bindTip(g, () => ({
        title: item.label,
        rows: [{ color: item.color, value: fmt(item.value), label: item.sub || "" }]
      }));
      if (opts.onClick) {
        g.addEventListener("click", () => opts.onClick(item));
        g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onClick(item); } });
      }
      svg.appendChild(g);
    });

    container.appendChild(svg);
  }

  /* ------------------------------------------------------------------
     Stacked horizontal bar chart (counts), 2px surface gaps between segments.
     items: [{label, segments: [{key, value, color}]}]
     ------------------------------------------------------------------ */
  function stackedHBars(container, items, opts = {}) {
    container.textContent = "";
    const totalAll = items.reduce((s, it) => s + it.segments.reduce((a, b) => a + b.value, 0), 0);
    if (!items.length || totalAll === 0) {
      const empty = document.createElement("div");
      empty.className = "chart-empty";
      empty.textContent = opts.emptyText || "No data for the current filters.";
      container.appendChild(empty);
      return;
    }
    const labelW = opts.labelWidth || 150;
    const rowH = 30, barH = 16, padTop = 4, valueW = 44;
    const width = 560;
    const height = padTop + items.length * rowH + 4;
    const plotW = width - labelW - valueW - 8;
    const max = Math.max(...items.map(it => it.segments.reduce((a, b) => a + b.value, 0)));

    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" });

    items.forEach((item, i) => {
      const y = padTop + i * rowH;
      const total = item.segments.reduce((a, b) => a + b.value, 0);
      const g = el("g", { class: "bar-hit", tabindex: "0" });
      g.appendChild(el("rect", { x: 0, y: y - 2, width, height: rowH, fill: "transparent" }));

      const lbl = el("text", { x: labelW - 10, y: y + barH / 2 + 4.2, "text-anchor": "end", class: "axis-label" });
      lbl.textContent = item.label.length > 22 ? item.label.slice(0, 21) + "…" : item.label;
      g.appendChild(lbl);

      let x = labelW;
      const nonzero = item.segments.filter(s => s.value > 0);
      nonzero.forEach((seg, si) => {
        const w = max > 0 ? (seg.value / max) * plotW : 0;
        const isLast = si === nonzero.length - 1;
        const gap = isLast ? 0 : 2; // 2px surface gap between touching segments
        const segW = Math.max(1, w - gap);
        if (isLast) {
          g.appendChild(el("path", { d: hBarPath(x, y, segW, barH), fill: seg.color }));
        } else {
          g.appendChild(el("rect", { x, y, width: segW, height: barH, fill: seg.color }));
        }
        x += w;
      });

      const val = el("text", { x: labelW + (max > 0 ? (total / max) * plotW : 0) + 8, y: y + barH / 2 + 4.2, class: "value-label" });
      val.textContent = String(total);
      g.appendChild(val);

      bindTip(g, () => ({
        title: item.label,
        rows: item.segments.map(s => ({ color: s.color, value: String(s.value), label: s.key }))
      }));
      svg.appendChild(g);
    });

    container.appendChild(svg);
  }

  /* ------------------------------------------------------------------
     Donut — part-to-whole at a glance (≤ 6 segments), total in the center.
     segments: [{key, value, color}]
     ------------------------------------------------------------------ */
  function donut(container, segments, opts = {}) {
    container.textContent = "";
    const total = segments.reduce((s, x) => s + x.value, 0);
    if (total === 0) {
      const empty = document.createElement("div");
      empty.className = "chart-empty";
      empty.textContent = opts.emptyText || "No data for the current filters.";
      container.appendChild(empty);
      return;
    }
    const size = 190, cx = size / 2, cy = size / 2, r = 72, thick = 26;
    const svg = el("svg", { viewBox: `0 0 ${size} ${size}`, role: "img", style: "max-width:230px;margin:0 auto" });

    let angle = -Math.PI / 2;
    segments.filter(s => s.value > 0).forEach(seg => {
      const frac = seg.value / total;
      const a0 = angle, a1 = angle + frac * Math.PI * 2;
      angle = a1;
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      const ro = r, ri = r - thick;
      const p = [
        `M${cx + ro * Math.cos(a0)},${cy + ro * Math.sin(a0)}`,
        `A${ro},${ro} 0 ${large} 1 ${cx + ro * Math.cos(a1)},${cy + ro * Math.sin(a1)}`,
        `L${cx + ri * Math.cos(a1)},${cy + ri * Math.sin(a1)}`,
        `A${ri},${ri} 0 ${large} 0 ${cx + ri * Math.cos(a0)},${cy + ri * Math.sin(a0)}`,
        "Z"
      ].join(" ");
      // 2px surface stroke = the surface gap between touching fills
      const path = el("path", { d: p, fill: seg.color, stroke: SURFACE, "stroke-width": 2, class: "bar-mark", tabindex: "0" });
      const pct = Math.round(frac * 100) + "%";
      bindTip(path, () => ({ title: seg.key, rows: [{ color: seg.color, value: String(seg.value), label: pct + " of tactics" }] }));
      svg.appendChild(path);
    });

    const num = el("text", { x: cx, y: cy - 1, "text-anchor": "middle", style: `font:800 30px Raleway,sans-serif;fill:#002C77` });
    num.textContent = String(total);
    svg.appendChild(num);
    const cap = el("text", { x: cx, y: cy + 18, "text-anchor": "middle", style: `font:600 10px Raleway,sans-serif;fill:${INK2};letter-spacing:.08em;text-transform:uppercase` });
    cap.textContent = opts.centerLabel || "tactics";
    svg.appendChild(cap);

    container.appendChild(svg);
  }

  /* Legend — swatch + label rows under a chart (identity never color-alone). */
  function legend(container, entries) {
    const box = document.createElement("div");
    box.className = "legend";
    entries.forEach(e => {
      const item = document.createElement("span");
      item.className = "legend-item";
      const sw = document.createElement("span");
      sw.className = "legend-swatch";
      sw.style.background = e.color;
      const txt = document.createElement("span");
      txt.textContent = e.label;
      item.appendChild(sw);
      item.appendChild(txt);
      box.appendChild(item);
    });
    container.appendChild(box);
  }

  return { hBars, stackedHBars, donut, legend, fmtMoney, fmtCount };
})();

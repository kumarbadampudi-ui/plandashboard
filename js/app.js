/* App shell — hash routing between the two dashboards and the data page.
   Store changes re-render whichever view is active, so dashboards always
   reflect the latest edits. */

(() => {
  const VIEWS = {
    category: root => Dashboards.render(root, "category"),
    function: root => Dashboards.render(root, "function"),
    data: root => DataPage.render(root)
  };

  let current = "category";

  function viewFromHash() {
    const m = location.hash.match(/^#\/(\w+)/);
    return m && VIEWS[m[1]] ? m[1] : "category";
  }

  function renderCurrent() {
    const root = document.getElementById("view");
    VIEWS[current](root);
    document.querySelectorAll(".tab").forEach(t => {
      t.classList.toggle("active", t.dataset.view === current);
    });
  }

  function navigate() {
    current = viewFromHash();
    renderCurrent();
    window.scrollTo({ top: 0 });
  }

  window.addEventListener("hashchange", navigate);

  Store.load();
  Store.subscribe(() => renderCurrent());

  document.getElementById("footer-reset").addEventListener("click", () => {
    if (confirm("Discard all edits and restore the original spreadsheet data?")) Store.reset();
  });

  if (!location.hash) location.hash = "#/category";
  navigate();
})();

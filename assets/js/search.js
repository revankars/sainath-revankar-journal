(() => {
  const entries = window.SITE_SEARCH_INDEX;
  const pageForm = document.querySelector("#site-search-form");
  const pageInput = document.querySelector("#site-search-query");
  const pageStatus = document.querySelector("#site-search-status");
  const pageResults = document.querySelector("#site-search-results");
  const searchLink = document.querySelector('.nav-links a[href$="search.html"]');
  const searchRoot = document.currentScript?.src
    ? new URL("../../", document.currentScript.src)
    : new URL("./", window.location.href);

  const normalize = value => String(value).normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const updateQueryString = input => {
    const url = new URL(window.location.href);
    const query = input.value.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  };

  const makeResult = (entry, terms) => {
    const item = document.createElement("li");
    item.className = "site-search-result";
    const category = document.createElement("div");
    category.className = "meta";
    category.textContent = entry.type;
    const heading = document.createElement("h2");
    const link = document.createElement("a");
    link.href = entry.external ? entry.url : new URL(entry.url, searchRoot).href;
    link.textContent = entry.title;
    if (entry.external) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    heading.append(link);
    const description = document.createElement("p");
    const text = entry.content || "";
    const folded = text.toLocaleLowerCase();
    const matchPosition = terms.map(term => folded.indexOf(term))
      .filter(position => position >= 0)
      .sort((left, right) => left - right)[0] || 0;
    const start = Math.max(0, matchPosition - 70);
    const snippet = text.slice(start, start + 240).trim();
    description.textContent = `${start ? "… " : ""}${snippet}${start + 240 < text.length ? " …" : ""}`;
    item.append(category, heading, description);
    return item;
  };

  const renderResults = (input, status, results) => {
    results.replaceChildren();
    if (!Array.isArray(entries)) {
      status.textContent = "Site search is unavailable. Please try again later.";
      return;
    }

    const query = input.value.trim();
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (!terms.length) {
      status.textContent = "Search across articles, projects, credentials and site pages.";
      return;
    }

    const matches = entries.map((entry, order) => {
      const title = normalize(entry.title);
      const type = normalize(entry.type);
      const content = normalize(entry.content);
      const searchable = `${title} ${type} ${content}`;
      if (!terms.every(term => searchable.includes(term))) return null;
      const score = terms.reduce((total, term) =>
        total + (title.includes(term) ? 12 : 0) + (type.includes(term) ? 4 : 0)
          + (content.includes(term) ? 1 : 0), 0);
      return { entry, order, score };
    }).filter(Boolean).sort((left, right) =>
      right.score - left.score || left.order - right.order);

    status.textContent = matches.length
      ? `${matches.length} ${matches.length === 1 ? "result" : "results"} for “${query}”.`
      : `No results for “${query}”. Try different or fewer words.`;
    matches.forEach(({ entry }) => results.append(makeResult(entry, terms)));
  };

  const bindForm = (form, input, status, results, updateUrl = false) => {
    if (!form || !input || !status || !results) return;
    const update = () => {
      if (updateUrl) updateQueryString(input);
      renderResults(input, status, results);
    };
    form.addEventListener("submit", event => {
      event.preventDefault();
      update();
    });
    input.addEventListener("input", update);
    update();
  };

  if (pageInput) pageInput.value = new URLSearchParams(window.location.search).get("q") || "";
  bindForm(pageForm, pageInput, pageStatus, pageResults, true);
  if (pageForm) {
    window.addEventListener("popstate", () => {
      pageInput.value = new URLSearchParams(window.location.search).get("q") || "";
      renderResults(pageInput, pageStatus, pageResults);
    });
  }

  if (!searchLink) return;

  const dialog = document.createElement("dialog");
  dialog.className = "site-search-dialog";
  dialog.setAttribute("aria-labelledby", "site-search-dialog-title");
  const panel = document.createElement("div");
  panel.className = "site-search-dialog-panel";
  const header = document.createElement("div");
  header.className = "site-search-dialog-header";
  const title = document.createElement("h2");
  title.id = "site-search-dialog-title";
  title.textContent = "Search the website";
  const closeButton = document.createElement("button");
  closeButton.className = "site-search-dialog-close";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.setAttribute("aria-label", "Close site search");
  header.append(title, closeButton);

  const dialogForm = document.createElement("form");
  dialogForm.className = "site-search-form";
  dialogForm.setAttribute("role", "search");
  const label = document.createElement("label");
  label.htmlFor = "site-search-dialog-query";
  label.textContent = "Search the website";
  const row = document.createElement("div");
  row.className = "site-search-row";
  const dialogInput = document.createElement("input");
  dialogInput.id = "site-search-dialog-query";
  dialogInput.name = "q";
  dialogInput.type = "search";
  dialogInput.placeholder = "Try “event forwarding” or “Customer Journey Analytics”";
  dialogInput.autocomplete = "off";
  const submitButton = document.createElement("button");
  submitButton.className = "button";
  submitButton.type = "submit";
  submitButton.textContent = "Search";
  row.append(dialogInput, submitButton);
  dialogForm.append(label, row);

  const dialogStatus = document.createElement("p");
  dialogStatus.className = "collection-status";
  dialogStatus.setAttribute("role", "status");
  dialogStatus.setAttribute("aria-live", "polite");
  const dialogResults = document.createElement("ol");
  dialogResults.className = "site-search-results";
  panel.append(header, dialogForm, dialogStatus, dialogResults);
  dialog.append(panel);
  document.body.append(dialog);
  bindForm(dialogForm, dialogInput, dialogStatus, dialogResults);

  dialogInput.value = pageInput?.value || new URLSearchParams(window.location.search).get("q") || "";
  searchLink.addEventListener("click", event => {
    event.preventDefault();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    renderResults(dialogInput, dialogStatus, dialogResults);
    dialogInput.focus();
  });
  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => searchLink.focus());
})();

(() => {
  const form = document.querySelector("#site-search-form");
  const input = document.querySelector("#site-search-query");
  const status = document.querySelector("#site-search-status");
  const results = document.querySelector("#site-search-results");
  const entries = window.SITE_SEARCH_INDEX;

  const normalize = value => String(value).normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const updateQueryString = () => {
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
    link.href = entry.url;
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

  const renderResults = () => {
    results.replaceChildren();
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

  input.value = new URLSearchParams(window.location.search).get("q") || "";
  form.addEventListener("submit", event => {
    event.preventDefault();
    updateQueryString();
    renderResults();
  });
  input.addEventListener("input", () => {
    updateQueryString();
    renderResults();
  });
  window.addEventListener("popstate", () => {
    input.value = new URLSearchParams(window.location.search).get("q") || "";
    renderResults();
  });

  if (!Array.isArray(entries)) {
    status.textContent = "Site search is unavailable. Please try again later.";
    return;
  }
  renderResults();
})();

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const articles = JSON.parse(await read("data/articles.json"));
const linkedArticles = JSON.parse(await read("data/linked-articles.json"));
const images = JSON.parse(await read("data/article-images.json"));
const articlePaths = articles.map(article => `journal/articles/${article.slug}/index.html`);
const generatedPaths = ["index.html", "journal/index.html", "search.html", "assets/js/search-index.js", "sitemap.xml", ...articlePaths];

test("publishing is repeatable and retains the complete article bodies and dates", async () => {
  const before = await Promise.all(generatedPaths.map(read));
  execFileSync(process.execPath, ["scripts/publish-articles.mjs"], { cwd: root });
  assert.deepEqual(await Promise.all(generatedPaths.map(read)), before);
  for (const [index, article] of articles.entries()) {
    const html = await read(articlePaths[index]);
    const source = await read(`data/articles/${article.slug}.html`);
    const body = html.match(/<article class="article-content">([\s\S]*?)<\/article>/)?.[1];
    assert.ok(body, `Static article body: ${article.slug}`);
    const withoutGeneratedMarkup = body.replace(/\n<figure>[\s\S]*?<\/figure>/g, "")
      .replace(/<h2 id="[^"]+">/g, "<h2>").replace(/\s+/g, " ").trim();
    assert.equal(withoutGeneratedMarkup, source.replace(/\s+/g, " ").trim());
    const schema = JSON.parse(html.match(/id="site-structured-data">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema.datePublished, article.date);
    assert.equal(schema.headline, article.title);
    assert.equal(schema.isBasedOn, article.source);
    assert.ok(html.includes(`datetime="${article.date}"`));
    const expectedImages = images.filter(image => (image.article || "understanding-merchandising-evars") === article.slug);
    assert.equal((body.match(/<figure>/g) || []).length, expectedImages.length);
    for (const image of expectedImages) {
      assert.ok(body.includes(`assets/images/articles/${image.name}.png`));
    }
  }
});

test("published navigation, table of contents and assets resolve at a project prefix", async () => {
  const prefix = "/example-project/";
  for (const path of [
    "index.html", "about.html", "journal/index.html", "projects.html", "certifications.html",
    "contact.html", "404.html", "search.html",
    "journal/articles/designing-connected-martech/index.html",
    "journal/articles/experience-data-foundations/index.html",
    "journal/articles/from-measurement-to-journey-insight/index.html",
    ...articlePaths
  ]) {
    const html = await read(path);
    const searchHref = path.startsWith("journal/articles/")
      ? "../../../search.html"
      : path === "journal/index.html" ? "../search.html" : "search.html";
    assert.ok(html.includes(`href="${searchHref}">Search</a>`), `${path}: missing site-wide search link`);
    const base = new URL(`${prefix}${path}`, "https://example.test");
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = new URL(match[1].replaceAll("&amp;", "&"), base);
      if (target.origin !== base.origin) continue;
      assert.ok(target.pathname.startsWith(prefix), `${path}: ${match[1]} leaves the project`);
      let relative = decodeURIComponent(target.pathname.slice(prefix.length));
      if (!relative || relative.endsWith("/")) relative += "index.html";
      const information = await stat(new URL(relative, root));
      assert.ok(information.isFile(), `${path}: ${match[1]}`);
      if (target.hash) {
        const destination = relative === path ? html : await read(relative);
        assert.ok(destination.includes(`id="${decodeURIComponent(target.hash.slice(1))}"`), `${path}: broken fragment ${target.hash}`);
      }
    }
  }
});

test("site search index covers articles, projects, credentials and internal destinations", async () => {
  const context = { window: {} };
  vm.runInNewContext(await read("assets/js/search-index.js"), context);
  const searchIndex = context.window.SITE_SEARCH_INDEX;
  assert.ok(Array.isArray(searchIndex));
  assert.ok(searchIndex.some(entry => entry.title === "How to design event forwarding rules that scale"
    && entry.external && entry.url.startsWith("https://experienceleague.adobe.com/")));
  assert.ok(searchIndex.some(entry => entry.title === "Adobe Web SDK: Transforming Customer Experiences at Enterprise Scale"
    && entry.external && entry.url.startsWith("https://www.merkle.com/")));
  assert.ok(searchIndex.some(entry => entry.title === "Marketo Lead Uploader" && entry.url === "projects.html#marketo-lead-uploader"));
  assert.ok(searchIndex.some(entry => entry.type === "Credentials page"
    && entry.content.includes("Adobe Certified Master - Adobe Analytics Architect")));
  assert.ok(searchIndex.some(entry => entry.title.startsWith("Understanding Merchandising eVars")
    && entry.content.includes("binding event")));
  for (const entry of searchIndex.filter(item => !item.external)) {
    const target = new URL(entry.url, "https://example.test/");
    const path = decodeURIComponent(target.pathname.slice(1));
    const html = await read(path);
    if (target.hash) assert.ok(html.includes(`id="${decodeURIComponent(target.hash.slice(1))}"`), entry.url);
  }
});

test("site search returns relevant results and handles empty matches", async () => {
  const indexContext = { window: {} };
  vm.runInNewContext(await read("assets/js/search-index.js"), indexContext);
  const elements = new Map();
  const makeElement = () => ({
    children: [],
    listeners: {},
    addEventListener(event, listener) { this.listeners[event] = listener; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); }
  });
  for (const selector of ["#site-search-form", "#site-search-query", "#site-search-status", "#site-search-results"]) {
    elements.set(selector, makeElement());
  }
  const document = {
    querySelector(selector) { return elements.get(selector); },
    createElement() { return makeElement(); }
  };
  const window = {
    ...indexContext.window,
    location: { href: "https://example.test/search.html?q=binding+event", search: "?q=binding+event" },
    history: {
      replaceState(_state, _title, url) {
        this.url = String(url);
        window.location.href = this.url;
        window.location.search = new URL(this.url).search;
      }
    },
    addEventListener() {}
  };
  vm.runInNewContext(await read("assets/js/search.js"), { document, window, URL, URLSearchParams });
  const input = elements.get("#site-search-query");
  const status = elements.get("#site-search-status");
  const results = elements.get("#site-search-results");
  assert.ok(status.textContent.includes("result"));
  assert.ok(results.children.some(item => item.children.some(child =>
    child.children?.some(link => link.textContent.startsWith("Understanding Merchandising eVars")))));
  input.value = "no matching content phrase";
  input.listeners.input();
  assert.match(status.textContent, /No results/);
  assert.equal(results.children.length, 0);
});

test("journal cards use their locally hosted article covers", async () => {
  const journal = await read("journal/index.html");
  for (const article of articles) {
    const journalCard = journal.split('<article class="article-card"').find(card => card.includes(`articles/${article.slug}/index.html`));
    assert.ok(journalCard?.includes(`src="../assets/images/covers/${article.cover}"`), article.slug);
  }
});

test("home features the newest dated articles from both catalogs", async () => {
  const home = await read("index.html");
  const cards = home.match(/<article class="feature-card">[\s\S]*?<\/article>/g);
  const newest = [...articles, ...linkedArticles]
    .filter(article => article.date)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  assert.equal(cards.length, newest.length);
  for (const [index, article] of newest.entries()) {
    const link = article.slug ? `journal/articles/${article.slug}/index.html` : article.source;
    assert.ok(cards[index].includes(`href="${link}"`), article.title);
    assert.ok(cards[index].includes(`datetime="${article.date}"`), article.title);
    if (article.cover) {
      assert.ok(cards[index].includes(`src="assets/images/covers/${article.cover}"`), article.title);
    } else {
      assert.ok(cards[index].includes('<div class="feature-visual" aria-hidden="true"></div>'), article.title);
    }
    if (!article.slug) {
      assert.ok(cards[index].includes('target="_blank" rel="noopener noreferrer"'));
      assert.ok(cards[index].includes("Read on LinkedIn"));
    } else {
      assert.ok(cards[index].includes("Read on this website"));
    }
  }
});

test("linked articles appear in chronological order with their covers and original links", async () => {
  const journal = await read("journal/index.html");
  const cards = journal.match(/<article class="article-card"[\s\S]*?<\/article>/g);
  const expectedSources = [
    "custom-aka-saint-classification-adobe-analytics-sainath-revankar",
    "adobe-target-cja-reporting-gap-can-surface-days-before-revankar-h7erc",
    "what-your-best-audience-already-exists-outside-adobe-sainath-revankar-vdyuc",
    "empty-beacons-arent-data-what-devtools-doesnt-tell-you-revankar-0tnxc",
    "demystifying-complex-fields-adobe-experience-platform-revankar-qbtzc",
    "when-campaign-disappears-bringing-lost-attribution-back-revankar-hvshc",
    "integrating-sa360-data-adobe-analytics-using-sources-sainath-revankar-yuujc",
    "offer-decisioning-ajo-how-weather-can-power-smarter-offers-revankar-oivac",
    "adobe-target-aep-web-sdk-understanding-requests-display-revankar-yru2c",
    "adobe-target-trigger-views-atjs-2x-vs-web-sdk-what-you-revankar-tytqc",
    "identity-edge-personalization-what-every-aep-should-know-revankar-1xewc",
    "building-xdm-adobe-experience-platform-from-design-profile-revankar-rxzdc",
    "week-changed-how-i-think-experience-orchestration-journey-revankar-153hc",
    "monitoring-validating-events-adobe-experience-sainath-revankar-z08rc",
    "activating-right-speed-when-use-edge-streaming-batch-adobe-revankar-xrm4c",
    "adobe-experience-platform-web-sdk-one-click-collect-event-revankar-ievlc",
    "personalizing-known-users-without-ajo-driving-upsell-adobe-revankar-2fvhc",
    "driving-smarter-personalization-ajo-ranking-based-sainath-revankar-t3mpc",
    "from-spreadsheet-story-turning-webinar-attendees-adobe-revankar-uo7pf",
    "how-implement-adobe-web-sdk-tags-tealium-iq-sainath-revankar-qeeff",
    "dynamic-datastreams-adobe-experience-platform-smarter-revankar-np7xf",
    "unlocking-true-aep-intelligence-why-n8n-llms-go-far-beyond-revankar-wbatc",
    "from-questions-insights-ai-driven-sql-agents-bring-your-revankar-fd2ic",
    "unlocking-instant-customer-engagement-real-time-event-revankar-wv2mc",
    "streaming-meta-marketing-api-data-adobe-experience-aep-revankar-vtqec",
    "automated-data-health-monitoring-counts-adobe-journey-revankar-dczuc",
    "secret-weapon-behind-holistic-customer-insights-adobe-revankar-me6fc",
    "server-side-marketing-migration-embracing-future-digital-revankar-2rk0c",
    "leveraging-google-search-console-api-strategic-data-sainath-revankar-kpryc",
    "case-study-server-side-migration-enhanced-website-data-revankar-gdeee",
    "websdk-vs-without-faster-smarter-more-efficient-sainath-revankar-evjfc",
    "protecting-e-commerce-platforms-from-bot-traffic-how-b2bb2c-revankar-sijkc",
    "unlocking-power-customer-insights-adobe-experience-clouds-revankar-hq0bc",
    "web-scraping-retail-optimization-using-jupyter-adobe-aep-revankar-hcrmc",
    "harnessing-power-adobe-experience-platform-sink-data-from-revankar-vtnec",
    "streamlining-personalization-automating-catalog-adobe-revankar-ehitc",
    "leveraging-summary-data-adobes-customer-journey-sainath-revankar-mejmc",
    "deploying-demandbase-tealium-iq-comprehensive-guide-api-revankar-lwxgc",
    "future-proofing-your-data-strategy-migrating-tagging-tealium-sainath-gsjzc",
    "optimizing-data-integration-coexisting-appmeasurement-revankar-xtqlc",
    "aep-cdp-sainath-revankar-pbm2c",
    "adobe-analytics-data-feed-sainath-revankar",
    "adobe-analytics-plugin-gettimebetweenevents-sainath-revankar",
    "automate-liftconfidence-calculation-within-adobe-sainath-revankar",
    "backup-strategy-adobe-launch-aka-data-collection-sainath-revankar",
    "next-best-action-adobes-journey-orchestration-sainath-revankar",
    "adobe-target-recommendations-using-apriori-algorithm-sainath-revankar"
  ];
  assert.equal(cards.length, articles.length + linkedArticles.length);
  assert.ok(journal.includes(`<p class="collection-count" id="journal-total">${cards.length} articles in total</p>`));
  assert.deepEqual(linkedArticles.filter(article => new URL(article.source).hostname === "www.linkedin.com")
    .map(article => new URL(article.source).pathname.split("/")[2]).sort(), expectedSources.sort());
  const dates = cards.map(card => card.match(/datetime="([^"]+)"/)?.[1] || "");
  assert.deepEqual(dates, [...dates].sort().reverse());
  for (const article of linkedArticles) {
    const card = cards.find(item => item.includes(`href="${article.source}"`));
    assert.ok(card, article.title);
    if (article.cover === null) {
      assert.ok(card.includes('<div class="visual" aria-hidden="true"></div>'));
    } else {
      assert.ok(card.includes(`src="../assets/images/covers/${article.cover}"`));
    }
    if (article.date === null) {
      assert.ok(card.includes("Publication date unavailable"));
    } else {
      assert.ok(card.includes(`datetime="${article.date}"`));
    }
    assert.ok(card.includes(`data-category="${article.filters.join(" ")}"`));
    assert.ok(card.includes('target="_blank" rel="noopener noreferrer"'));
    assert.ok(card.includes(`Read on ${article.sourceLabel || "LinkedIn"} ↗`));
  }
});

test("external Adobe and Merkle articles appear with their original publication labels", async () => {
  const journal = await read("journal/index.html");
  for (const [source, label, date] of [
    ["https://experienceleague.adobe.com/en/perspectives/how-to-design-event-forwarding-rules-that-scale", "Adobe Experience League", "2026-11-11"],
    ["https://www.merkle.com/en/merkle-now/articles-blogs/2025/adobe-web-sdk-transforming-customer-experiences-enterprise-scale.html", "Merkle", "2025-07-25"]
  ]) {
    const card = journal.match(new RegExp(`<article class="article-card"[\\s\\S]*?href="${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?<\\/article>`))?.[0];
    assert.ok(card, source);
    assert.ok(card.includes(`datetime="${date}"`), source);
    assert.ok(card.includes(`Read on ${label} ↗`), source);
    assert.ok(card.includes('target="_blank" rel="noopener noreferrer"'), source);
  }
});

test("Adobe User Group speaking details link to the event and Teams webinar", async () => {
  const html = await read("certifications.html");
  assert.ok(html.includes("Insider Tips &amp; Considerations for Adobe Event Forwarding"));
  assert.ok(html.includes('href="https://usergroups.adobe.com/events/details/adobe-user-groups-experience-platform-apps-utah-chapter-presents-insider-tips-amp-considerations-for-adobe-event-forwarding/"'));
  assert.ok(html.includes('href="https://events.teams.microsoft.com/event/dc7962d8-1935-4958-a29d-350c65d37e10@6e8992ec-76d5-4ea5-8eae-b0c5e558749a"'));
});

test("About page highlights the speaking engagement near the top", async () => {
  const html = await read("about.html");
  const highlight = html.indexOf('aria-labelledby="featured-speaking"');
  const profile = html.indexOf('class="container about-grid"');
  assert.ok(highlight >= 0 && highlight < profile);
  assert.ok(html.includes('id="featured-speaking">Insider Tips &amp; Considerations for Adobe Event Forwarding</h2>'));
  assert.ok(html.includes('>Webinar event ↗</a>'));
  assert.ok(html.includes('>Adobe User Group details ↗</a>'));
});

test("previously unavailable article details and covers appear in the journal", async () => {
  const journal = await read("journal/index.html");
  const cards = journal.match(/<article class="article-card"[\s\S]*?<\/article>/g);
  for (const [slug, date, cover] of [
    ["unlocking-instant-customer-engagement-real-time-event-revankar-wv2mc", "2025-09-27", "snowflake-real-time-activation.jpg"],
    ["adobe-analytics-plugin-gettimebetweenevents-sainath-revankar", "2023-04-02", "get-time-between-events.jpg"]
  ]) {
    const card = cards.find(item => item.includes(slug));
    assert.ok(card?.includes(`datetime="${date}"`), slug);
    assert.ok(card.includes(`src="../assets/images/covers/${cover}"`), slug);
    assert.ok(!card.includes("Publication details could not be retrieved"), slug);
  }
});

test("approved credited covers display without cropping", async () => {
  const journal = await read("journal/index.html");
  const cards = journal.match(/<article class="article-card"[\s\S]*?<\/article>/g);
  for (const [slug, cover, credit] of [
    ["adobe-analytics-data-feed-sainath-revankar", "adobe-analytics-data-feed.jpg", "ipopba"],
    ["next-best-action-adobes-journey-orchestration-sainath-revankar", "next-best-action.jpg", "Pointillist"],
    ["adobe-target-recommendations-using-apriori-algorithm-sainath-revankar", "target-apriori-recommendations.jpg", "Google"]
  ]) {
    const card = cards.find(item => item.includes(slug));
    assert.ok(card?.includes(`src="../assets/images/covers/${cover}"`), slug);
    assert.ok(card.includes("cover-visual cover-contain"), slug);
    assert.ok(card.includes(`Image credit: ${credit}`), slug);
  }
});

test("projects show matching covers and the Marketo project links", async () => {
  const html = await read("projects.html");
  const count = (html.match(/<article class="project"/g) || []).length;
  assert.ok(html.includes(`<p class="collection-count" id="project-total">${count} projects in total</p>`));
  const expected = [
    ["marketo-lead-uploader", "marketo-lead-uploader.jpg"],
    ["tags-audit", "tags-audit.jpg"],
    ["cja-intelligence", "cja-intelligence.jpg"],
    ["direct-data-insertion", "direct-data-insertion.jpg"],
    ["bulk-data-insertion", "bulk-data-insertion.jpg"]
  ];
  for (const [id, cover] of expected) {
    const card = html.match(new RegExp(`<article class="project" id="${id}">([\\s\\S]*?)</article>`))?.[1];
    assert.ok(card?.includes(`src="assets/images/covers/${cover}"`), id);
    if (id === "marketo-lead-uploader") {
      assert.ok(card.includes('href="https://marketo-lead-uploader-api.onrender.com/"'));
      assert.ok(card.includes('href="https://www.linkedin.com/pulse/when-campaign-disappears-bringing-lost-attribution-back-revankar-hvshc/"'));
      assert.ok(card.includes("does not automatically recreate historical touchpoints"));
    }
  }
  assert.ok(html.includes('src="assets/images/covers/analytics-audit.jpg"'));
});

test("home credentials card uses its local illustration", async () => {
  const home = await read("index.html");
  const illustration = await read("assets/images/covers/certifications-honors.svg");
  assert.ok(home.includes('src="assets/images/covers/certifications-honors.svg"'));
  assert.ok(home.includes('<div class="meta">Certifications · Honors</div>'));
  assert.ok(illustration.includes('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="719"'));
});

test("contact page configures the Medium profile link", async () => {
  const html = await read("contact.html");
  assert.ok(html.includes('data-config-link="mediumUrl" href="https://medium.com/@sainathrevankar"'));
  const mediumLink = { dataset: { configLink: "mediumUrl" } };
  const window = { location: { href: "https://example.test/contact.html", pathname: "/contact.html" }, matchMedia: () => ({ matches: false }) };
  vm.runInNewContext(await read("assets/js/site-config.js"), { window });
  const document = {
    title: "Contact",
    querySelector(selector) { return selector === 'link[rel="canonical"]' ? {} : null; },
    querySelectorAll(selector) { return selector === "[data-config-link]" ? [mediumLink] : []; },
    createElement() { return {}; },
    head: { append() {} }
  };
  vm.runInNewContext(await read("assets/js/main.js"), { document, window, URL });
  assert.equal(mediumLink.href, "https://medium.com/@sainathrevankar");
  assert.equal(mediumLink.target, "_blank");
  assert.equal(mediumLink.rel, "noopener noreferrer");
});

test("Datorama credentials use specific links or the LinkedIn certifications fallback", async () => {
  const html = await read("certifications.html");
  const cards = html.match(/<article class="credential">[\s\S]*?<\/article>/g);
  const fallback = "https://www.linkedin.com/in/sainathrevankar/details/certifications/";
  for (const [title, date] of [
    ["Datorama Solution Architect", "2019-05"],
    ["Datorama Champion", "2019-01"],
    ["Partners' Level 3", "2018-12"]
  ]) {
    const matches = cards.filter(card => card.includes(`<h3>${title}</h3>`));
    assert.equal(matches.length, 1, title);
    assert.ok(matches[0].includes(`datetime="${date}"`), title);
    assert.ok(matches[0].includes(`href="${fallback}"`), title);
  }
  for (const title of ["Admin Certification (Level 1)", "Datorama Expert (Level 2)"]) {
    const matches = cards.filter(card => card.includes(`<h3>${title}</h3>`));
    assert.equal(matches.length, 1, title);
    assert.ok(matches[0].includes("https://s3.amazonaws.com/datorama_certification/"), title);
  }
  for (const title of [
    "9A0-381: Analytics Business Practitioner Exam",
    "Tealium iQ Tag Management - Product Certified!",
    "MongoDB fo DBAs",
    "MongoDB for Developers",
    "Teradata 12 Certified Professional",
    "Six Sigma Yellow Belt Certification"
  ]) {
    const card = cards.find(item => item.includes(`<h3>${title}</h3>`));
    assert.ok(card?.includes(`href="${fallback}"`), title);
  }
});

test("journal and project search, topic filters and pagination work with the published catalog", async () => {
  const element = properties => ({
    ...properties, addEventListener(event, listener) { this[event] = listener; },
    classList: { toggle() {} }, setAttribute(name, value) { this[name] = value; },
    matches(selector) { return selector === "article"; }
  });
  const search = element({ value: "" });
  const projectSearch = element({ value: "" });
  const journalEmpty = { hidden: true };
  const projectEmpty = { hidden: true };
  const journalTotal = {};
  const projectTotal = {};
  const journalResults = {};
  const projectResults = {};
  const filters = ["all", "analytics", "architecture", "data", "aep"].map(filter =>
    element({ dataset: { filter } }));
  const cards = [...articles, ...linkedArticles].map(article => element({
    dataset: { category: article.filters.join(" ") },
    textContent: `${article.title} ${article.description}`, hidden: false
  }));
  const projects = [
    "Adobe Analytics Classification Manager", "Marketo Lead Uploader", "Tags Audit",
    "CJA Intelligence", "Direct Data Insertion", "Bulk Data Insertion", "Adobe Analytics Audit Tool"
  ].map(title => element({ dataset: {}, textContent: title, hidden: false }));
  const createPagination = () => ({
    hidden: true, children: [],
    replaceChildren() { this.children = []; },
    append(button) { this.children.push(button); }
  });
  const journalPagination = createPagination();
  const projectPagination = createPagination();
  const journalGrid = { children: cards };
  const projectGrid = { children: projects };
  const document = {
    title: "Journal",
    querySelector(selector) {
      if (selector === "#article-search") return search;
      if (selector === "#project-search") return projectSearch;
      if (selector === ".journal-grid") return journalGrid;
      if (selector === ".project-grid") return projectGrid;
      if (selector === "#journal-empty") return journalEmpty;
      if (selector === "#project-empty") return projectEmpty;
      if (selector === "#journal-pagination") return journalPagination;
      if (selector === "#project-pagination") return projectPagination;
      if (selector === "#journal-results") return journalResults;
      if (selector === "#project-results") return projectResults;
      if (selector === "#journal-total") return journalTotal;
      if (selector === "#project-total") return projectTotal;
      if (selector === 'link[rel="canonical"]') return {};
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".filter-chip[data-filter]") return filters;
      if (selector === ".journal-grid .article-card") return cards;
      if (selector === ".project-grid .project") return projects;
      return [];
    },
    createElement() { return element({}); },
    head: { append() {} }
  };
  vm.runInNewContext(await read("assets/js/main.js"), {
    document, URL, window: { location: { href: "https://example.test/journal/" }, matchMedia: () => ({ matches: false }) }
  });
  const visible = collection => collection.filter(card => !card.hidden).length;
  assert.equal(journalTotal.textContent, `${articles.length + linkedArticles.length} articles in total`);
  assert.equal(projectTotal.textContent, "7 projects in total");
  assert.equal(visible(cards), 6);
  assert.equal(journalPagination.children.length, 11);
  journalPagination.children.find(button => button.textContent === "2").click();
  assert.equal(visible(cards), 6);
  assert.equal(journalResults.textContent, `Showing 7–12 of ${articles.length + linkedArticles.length} articles`);
  filters[1].click();
  assert.equal(visible(cards), 6);
  assert.equal(journalResults.textContent, "Showing 1–6 of 25 articles");
  filters[2].click();
  assert.equal(visible(cards), 6);
  search.value = "Classification";
  search.input();
  assert.equal(visible(cards), 1);
  filters[3].click();
  assert.equal(visible(cards), 1);
  assert.equal(journalEmpty.hidden, true);
  search.value = "   MeRcHaNdIsInG ";
  search.input();
  assert.equal(visible(cards), 1);
  assert.equal(journalEmpty.hidden, true);
  filters[4].click();
  assert.equal(visible(cards), 0);
  assert.equal(journalEmpty.hidden, false);
  assert.equal(journalTotal.textContent, `${articles.length + linkedArticles.length} articles in total`);
  search.value = "Identity, Edge, and Personalization";
  search.input();
  assert.equal(visible(cards), 1);
  assert.equal(journalEmpty.hidden, true);
  search.value = "";
  filters[0].click();
  assert.equal(visible(cards), 6);

  assert.equal(visible(projects), 6);
  assert.equal(projectPagination.children.length, 4);
  projectPagination.children.find(button => button.textContent === "2").click();
  assert.equal(visible(projects), 1);
  projectSearch.value = "Classification Manager";
  projectSearch.input();
  assert.equal(visible(projects), 1);
  assert.equal(projectPagination.hidden, true);
  projectSearch.value = "no matching project";
  projectSearch.input();
  assert.equal(visible(projects), 0);
  assert.equal(projectEmpty.hidden, false);
});

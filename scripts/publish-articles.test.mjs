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
const generatedPaths = ["index.html", "journal/index.html", "sitemap.xml", ...articlePaths];

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
  for (const path of ["index.html", "journal/index.html", "projects.html", "certifications.html", ...articlePaths]) {
    const html = await read(path);
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
  assert.equal(cards.length, articles.length + expectedSources.length);
  assert.ok(journal.includes(`<p class="collection-count" id="journal-total">${cards.length} articles in total</p>`));
  assert.deepEqual(linkedArticles.map(article => new URL(article.source).pathname.split("/")[2]).sort(), expectedSources.sort());
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
    assert.ok(card.includes("Read on LinkedIn"));
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

test("combined search and topic filters work with the published catalog", async () => {
  const element = properties => ({
    ...properties, addEventListener(event, listener) { this[event] = listener; },
    classList: { toggle() {} }, setAttribute() {}
  });
  const search = element({ value: "" });
  const empty = { hidden: true };
  const journalTotal = {};
  const projectTotal = {};
  const filters = ["all", "analytics", "architecture", "data", "aep"].map(filter =>
    element({ dataset: { filter } }));
  const cards = [...articles, ...linkedArticles].map(article => ({
    dataset: { category: article.filters.join(" ") },
    textContent: `${article.title} ${article.description}`, hidden: false
  }));
  const document = {
    title: "Journal",
    querySelector(selector) {
      if (selector === "#article-search") return search;
      if (selector === ".empty-note") return empty;
      if (selector === "#journal-total") return journalTotal;
      if (selector === "#project-total") return projectTotal;
      if (selector === 'link[rel="canonical"]') return {};
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".filter-chip[data-filter]") return filters;
      if (selector === "[data-category]") return cards;
      if (selector === ".journal-grid .article-card") return cards;
      if (selector === ".project-grid .project") return [{}];
      return [];
    },
    createElement() { return {}; },
    head: { append() {} }
  };
  vm.runInNewContext(await read("assets/js/main.js"), {
    document, URL, window: { location: { href: "https://example.test/journal/" }, matchMedia: () => ({ matches: false }) }
  });
  const visible = () => cards.filter(card => !card.hidden).length;
  assert.equal(journalTotal.textContent, "50 articles in total");
  assert.equal(projectTotal.textContent, "1 project in total");
  filters[1].click();
  assert.equal(visible(), 25);
  filters[2].click();
  assert.equal(visible(), 32);
  search.value = "Classification";
  search.input();
  assert.equal(visible(), 1);
  filters[3].click();
  assert.equal(visible(), 1);
  assert.equal(empty.hidden, true);
  search.value = "   MeRcHaNdIsInG ";
  search.input();
  assert.equal(visible(), 1);
  assert.equal(empty.hidden, true);
  filters[4].click();
  assert.equal(visible(), 0);
  assert.equal(journalTotal.textContent, "50 articles in total");
  search.value = "Identity, Edge, and Personalization";
  search.input();
  assert.equal(visible(), 1);
  assert.equal(empty.hidden, true);
  search.value = "";
  filters[0].click();
  assert.equal(visible(), 50);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const articles = JSON.parse(await read("data/articles.json"));
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

test("journal and featured cards use their locally hosted article covers", async () => {
  const journal = await read("journal/index.html");
  const home = await read("index.html");
  for (const [index, article] of articles.entries()) {
    const journalCard = journal.split('<article class="article-card"').find(card => card.includes(`articles/${article.slug}/index.html`));
    assert.ok(journalCard?.includes(`src="../assets/images/covers/${article.cover}"`), article.slug);
    if (index < 2) {
      const homeCard = home.split('<article class="feature-card"').find(card => card.includes(`journal/articles/${article.slug}/index.html`));
      assert.ok(homeCard?.includes(`src="assets/images/covers/${article.cover}"`), article.slug);
    }
  }
});

test("projects show matching covers and the Marketo project links", async () => {
  const html = await read("projects.html");
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

test("combined search and topic filters work with the published catalog", async () => {
  const element = properties => ({
    ...properties, addEventListener(event, listener) { this[event] = listener; },
    classList: { toggle() {} }, setAttribute() {}
  });
  const search = element({ value: "" });
  const empty = { hidden: true };
  const filters = ["all", "analytics", "architecture", "data", "aep"].map(filter =>
    element({ dataset: { filter } }));
  const cards = articles.map(article => ({
    dataset: { category: article.filters.join(" ") },
    textContent: `${article.title} ${article.description}`, hidden: false
  }));
  const document = {
    title: "Journal",
    querySelector(selector) {
      if (selector === "#article-search") return search;
      if (selector === ".empty-note") return empty;
      if (selector === 'link[rel="canonical"]') return {};
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".filter-chip[data-filter]") return filters;
      if (selector === "[data-category]") return cards;
      return [];
    },
    createElement() { return {}; },
    head: { append() {} }
  };
  vm.runInNewContext(await read("assets/js/main.js"), {
    document, URL, window: { location: { href: "https://example.test/journal/" }, matchMedia: () => ({ matches: false }) }
  });
  const visible = () => cards.filter(card => !card.hidden).length;
  filters[1].click();
  assert.equal(visible(), 3);
  filters[2].click();
  assert.equal(visible(), 2);
  search.value = "Classification";
  search.input();
  assert.equal(visible(), 1);
  filters[3].click();
  assert.equal(visible(), 0);
  assert.equal(empty.hidden, false);
  search.value = "   MeRcHaNdIsInG ";
  search.input();
  assert.equal(visible(), 1);
  assert.equal(empty.hidden, true);
  filters[4].click();
  assert.equal(visible(), 0);
  search.value = "";
  filters[0].click();
  assert.equal(visible(), 3);
});

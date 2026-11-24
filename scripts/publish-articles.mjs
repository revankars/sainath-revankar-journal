import { readFile, writeFile, mkdir } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const escape = text => String(text).replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const htmlToText = html => html
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&apos;|&#39;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&mdash;/gi, "—")
  .replace(/&ndash;/gi, "–")
  .replace(/&rsquo;|&lsquo;/gi, "'")
  .replace(/&rdquo;|&ldquo;/gi, '"')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/\s+/g, " ")
  .trim();
const articles = JSON.parse(await read("data/articles.json"));
const linkedArticles = JSON.parse(await read("data/linked-articles.json"));
const images = JSON.parse(await read("data/article-images.json"));
const context = { window: {} };
vm.runInNewContext(await read("assets/js/site-config.js"), context);
const siteUrl = context.window.SITE_CONFIG.siteUrl.replace(/\/$/, "");
const journal = await read("journal/index.html");
const header = journal.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0];
const footer = journal.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0];
if (!header || !footer) throw new Error("Journal header or footer not found.");
const nested = html => html.replaceAll('href="../', 'href="../../../')
  .replaceAll('href="index.html"', 'href="../../index.html"');
const dateLabel = date => new Intl.DateTimeFormat("en-US", {
  year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
}).format(new Date(`${date}T00:00:00Z`));
const articleLink = (article, prefix) => `${prefix}${article.slug}/index.html`;
const card = (article, prefix, featured = false) => {
  const link = article.linked ? escape(article.source) : articleLink(article, prefix);
  const externalAttributes = article.linked ? ' target="_blank" rel="noopener noreferrer"' : "";
  const linkText = article.linked ? `Read on ${escape(article.sourceLabel || "LinkedIn")} ↗` : "Read on this website →";
  const imagePrefix = featured ? "" : "../";
  const visual = article.cover
    ? `<div class="${featured ? "feature-visual" : "visual"} cover-visual${article.coverFit === "contain" ? " cover-contain" : ""}" aria-hidden="true"><img src="${imagePrefix}assets/images/covers/${escape(article.cover)}" alt="" width="1280" height="719" loading="lazy"></div>`
    : `<div class="${featured ? "feature-visual" : "visual"}" aria-hidden="true"></div>`;
  const date = article.date ? `<time datetime="${article.date}">${dateLabel(article.date)}</time>` : "Publication date unavailable";
  const credit = article.coverCredit ? `<p class="cover-credit">Image credit: ${escape(article.coverCredit)}</p>` : "";
  return `<article class="${featured ? "feature-card" : "article-card"}"${featured ? "" : ` data-category="${escape(article.filters.join(" "))}"`}>
${visual}
<div class="card-body"><div class="meta">${escape(article.category)} · ${date}</div>
<h${featured ? 3 : 2}><a href="${link}"${externalAttributes}>${escape(article.title)}</a></h${featured ? 3 : 2}>
<p>${escape(article.description)}</p>${credit}<a class="text-link" href="${link}"${externalAttributes}>${linkText}</a></div></article>`;
};
const pageOutputs = [];
for (const article of linkedArticles) {
  if (article.cover !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*\.jpg$/.test(article.cover)) throw new Error(`Invalid cover: ${article.title}`);
  if (article.coverFit !== undefined && article.coverFit !== "contain") throw new Error(`Invalid cover fit: ${article.title}`);
  if (article.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(article.date)) throw new Error(`Invalid date: ${article.title}`);
  const source = new URL(article.source);
  if (source.protocol !== "https:" || !["www.linkedin.com", "experienceleague.adobe.com", "www.merkle.com"].includes(source.hostname)) {
    throw new Error(`Invalid article source: ${article.title}`);
  }
  if (article.cover !== null) await readFile(new URL(`assets/images/covers/${article.cover}`, root));
}
for (const [index, article] of articles.entries()) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) throw new Error("Invalid article slug.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.jpg$/.test(article.cover)) throw new Error(`Invalid cover: ${article.slug}`);
  await readFile(new URL(`assets/images/covers/${article.cover}`, root));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(article.date)) throw new Error(`Missing date: ${article.slug}`);
  let body = await read(`data/articles/${article.slug}.html`);
  const articleImages = images.filter(image => (image.article || "understanding-merchandising-evars") === article.slug);
  for (const image of [...articleImages].reverse()) {
    const buffer = await readFile(new URL(`assets/images/articles/${image.name}.png`, root));
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    const anchor = `<p>${image.after}</p>`;
    if (body.split(anchor).length !== 2) throw new Error(`Expected one image anchor: ${image.name}`);
    body = body.replace(anchor, `${anchor}\n<figure><img src="../../../assets/images/articles/${image.name}.png" alt="${escape(image.caption)}" width="${width}" height="${height}" loading="lazy"><figcaption>${escape(image.caption)}</figcaption></figure>`);
  }
  const headings = [];
  body = body.replace(/<h2>(.*?)<\/h2>/g, (_, title) => {
    const id = `section-${headings.length + 1}`;
    headings.push({ title, id });
    return `<h2 id="${id}">${title}</h2>`;
  });
  const minutes = Math.max(1, Math.ceil(body.replace(/<[^>]*>/g, " ").trim().split(/\s+/).length / 220));
  const url = `${siteUrl}/journal/articles/${article.slug}/`;
  const structured = JSON.stringify({
    "@context": "https://schema.org", "@type": "Article",
    headline: article.title, description: article.description,
    author: { "@type": "Person", name: "Sainath Revankar" },
    datePublished: article.date, mainEntityOfPage: url, isBasedOn: article.source
  }).replaceAll("<", "\\u003c");
  const previous = articles[index - 1];
  const next = articles[index + 1];
  const navigationLink = (item, label) => item
    ? `<a href="${articleLink(item, "../")}"><span>${label}</span><strong>${escape(item.title)}</strong></a>`
    : '<a href="../../index.html"><span>All articles</span><strong>Journal index →</strong></a>';
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(article.title)} | The Sainath Revankar Journal</title>
<meta name="description" content="${escape(article.description)}"><meta name="theme-color" content="#f4f1e7">
<link rel="canonical" href="${url}"><meta property="og:url" content="${url}">
<meta property="og:type" content="article"><meta property="og:title" content="${escape(article.title)}">
<meta property="og:description" content="${escape(article.description)}"><meta property="article:published_time" content="${article.date}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(article.title)}"><meta name="twitter:description" content="${escape(article.description)}">
<link rel="stylesheet" href="../../../assets/css/style.css"><link rel="stylesheet" href="../../../assets/css/components.css">
<script type="application/ld+json" id="site-structured-data">${structured}</script>
</head><body>
<div class="reading-progress" aria-hidden="true"></div><a class="skip-link" href="#main">Skip to content</a>
${nested(header)}
<main id="main">
<section class="page-heading article-heading"><div class="container">
<a class="text-link" href="../../index.html">← Back to the journal</a><div class="eyebrow">${escape(article.category)}</div>
<h1>${escape(article.title)}</h1><p>${escape(article.description)}</p>
<div class="article-byline">By Sainath Revankar · <time datetime="${article.date}">${dateLabel(article.date)}</time> · <span data-reading-time>${minutes} min read</span></div>
<p class="editorial-note">Originally published on <a class="text-link" href="${article.source}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>. Read the article here, with illustrations hosted locally.</p>
</div></section>
<section class="section section-white"><div class="container article-layout"><div>
<article class="article-content">${body}</article>
<div class="article-sharing"><button class="button" type="button" data-share>Share article</button><button class="button button-outline" type="button" data-copy-url>Copy article URL</button><a class="text-link" data-social-share="linkedin" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}">Share on LinkedIn ↗</a><a class="text-link" data-social-share="x" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}">Share on X ↗</a><span class="share-status" role="status" aria-live="polite"></span></div>
<nav class="article-pagination" aria-label="Article navigation">${navigationLink(previous, "Previous article")}${navigationLink(next, "Next article")}</nav>
<section class="related-articles" aria-labelledby="related-heading"><h2 id="related-heading">Related articles</h2>${articles.filter(item => item.slug !== article.slug).map(item => `<p><a class="text-link" href="${articleLink(item, "../")}">${escape(item.title)} →</a></p>`).join("\n")}</section>
</div><aside class="article-aside"><strong>In this article</strong>${headings.map(heading => `<a href="#${heading.id}">${heading.title}</a>`).join("\n")}</aside></div></section>
</main>${nested(footer)}
<button class="back-to-top" type="button" aria-label="Back to top" hidden>↑</button>
<script src="../../../assets/js/site-config.js"></script><script src="../../../assets/js/main.js"></script>
</body></html>\n`;
  pageOutputs.push({ path: `journal/articles/${article.slug}/index.html`, html });
}
const replaceSection = (html, name, content) => {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  if (!html.includes(start) || !html.includes(end)) throw new Error(`Missing ${name} markers.`);
  const from = html.indexOf(start) + start.length;
  const to = html.indexOf(end, from);
  return `${html.slice(0, from)}\n${content}\n${html.slice(to)}`;
};
const journalArticles = [...articles, ...linkedArticles.map(article => ({ ...article, linked: true }))]
  .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
const countPattern = /<p class="collection-count" id="journal-total">[^<]*<\/p>/g;
if ([...journal.matchAll(countPattern)].length !== 1) throw new Error("Expected one journal total.");
const journalWithCount = journal.replace(countPattern, `<p class="collection-count" id="journal-total">${journalArticles.length} ${journalArticles.length === 1 ? "article" : "articles"} in total</p>`);
const journalOutput = replaceSection(journalWithCount, "published-articles",
  `<div class="journal-grid">\n${journalArticles.map(article => card(article, "articles/")).join("\n")}\n</div>`);
const homeOutput = replaceSection(await read("index.html"), "featured-articles",
  `<div class="feature-grid">\n${journalArticles.filter(article => article.date).slice(0, 2).map(article => card(article, "journal/articles/", true)).join("\n")}\n</div>`);
const searchIndex = [];
const addSearchEntry = entry => searchIndex.push({
  title: entry.title,
  url: entry.url,
  type: entry.type,
  content: entry.content,
  ...(entry.external ? { external: true } : {})
});
const sitePages = [
  { path: "index.html", title: "Home", type: "Home page", html: homeOutput },
  { path: "about.html", title: "About", type: "About page" },
  { path: "certifications.html", title: "Credentials", type: "Credentials page" },
  { path: "testimonials.html", title: "Testimonials", type: "Testimonials page" },
  { path: "projects.html", title: "Projects", type: "Projects page" },
  { path: "contact.html", title: "Contact", type: "Contact page" }
];
for (const page of sitePages) {
  const html = page.html || await read(page.path);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (!main) throw new Error(`Main content not found for search indexing: ${page.path}`);
  const pageContent = page.path === "projects.html"
    ? main.replace(/<article class="project"[\s\S]*?<\/article>/g, " ")
    : main;
  addSearchEntry({
    title: page.title,
    url: page.path,
    type: page.type,
    content: htmlToText(pageContent)
  });
}
const projectHtml = await read("projects.html");
for (const match of projectHtml.matchAll(/<article class="project"(?: id="([^"]+)")?[^>]*>([\s\S]*?)<\/article>/g)) {
  const title = htmlToText(match[2].match(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/i)?.[1] || "");
  if (!title) throw new Error("Project card is missing a title in the search index.");
  addSearchEntry({
    title,
    url: `projects.html${match[1] ? `#${match[1]}` : ""}`,
    type: "Project",
    content: htmlToText(match[2])
  });
}
for (const article of articles) {
  addSearchEntry({
    title: article.title,
    url: `journal/articles/${article.slug}/index.html`,
    type: `${article.category} article`,
    content: [article.description, article.category, article.date, htmlToText(await read(`data/articles/${article.slug}.html`))]
      .filter(Boolean).join(" ")
  });
}
for (const article of linkedArticles) {
  addSearchEntry({
    title: article.title,
    url: article.source,
    type: `${article.sourceLabel || "LinkedIn"} article`,
    content: [article.description, article.category, article.date].filter(Boolean).join(" "),
    external: true
  });
}
const corePaths = ["", "about.html", "journal/", "certifications.html", "testimonials.html", "projects.html", "contact.html"];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...corePaths, ...articles.map(article => `journal/articles/${article.slug}/`)].map(path => `  <url><loc>${escape(`${siteUrl}/${path}`)}</loc></url>`).join("\n")}
</urlset>\n`;
for (const output of pageOutputs) {
  await mkdir(new URL(output.path.replace(/index\.html$/, ""), root), { recursive: true });
  await writeFile(new URL(output.path, root), output.html);
}
await writeFile(new URL("journal/index.html", root), journalOutput);
await writeFile(new URL("index.html", root), homeOutput);
const searchIndexScript = `window.SITE_SEARCH_INDEX = ${JSON.stringify(searchIndex).replaceAll("<", "\\u003c")};\n`;
await writeFile(new URL("assets/js/search-index.js", root), searchIndexScript);
await writeFile(new URL("sitemap.xml", root), sitemap);
console.log(`Published ${articles.length} static articles and ${linkedArticles.length} linked articles, journal cards, home features, search index and sitemap.`);

# The Sainath Revankar Journal

A responsive personal portfolio and editorial journal built with static HTML, CSS and vanilla JavaScript. The published files run without a backend, runtime build, database or paid service and are compatible with GitHub Pages project sites.

## Preview locally

Open `index.html` directly, or serve this folder with any local static file server. No runtime package installation is required. Clipboard and native share controls may require a secure HTTPS origin in some browsers.

## Publish with GitHub Pages

1. Push the contents of this folder to the `main` branch of `revankars/sainath-revankar-journal`.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch `main` and folder `/ (root)`, then save.
5. Wait for the deployment and open the Pages URL.

All local links and assets are relative, including nested article pages, so the project works below the repository path. The current configured site URL is in `assets/js/site-config.js`. If the Pages URL or custom domain changes, update that setting and the absolute URLs in `sitemap.xml` and `robots.txt`. For a custom domain, follow GitHub Pages’ custom-domain instructions and configure the domain in the repository’s Pages settings.

## Personalize the site

- **Site URL and contact links:** Update `siteUrl`, `linkedinUrl`, `githubUrl`, `mediumUrl` and `email` in `assets/js/site-config.js`. Keep an empty string for links you do not want shown.
- **About and profile:** Edit `about.html` for the biography, education and personal highlights. The supplied profile photo is in `assets/images/sainath-revankar.jpg`; replace it only with an approved photo. Keep profile, education and career details accurate.
- **Projects:** Edit the project cards in `projects.html` and update its displayed total as a fallback for visitors without JavaScript. Matching article covers are stored in `assets/images/covers/`; include a repository, demo or image only when it is available and verified.
- **Certifications:** The cards combine the public LinkedIn profile with owner-supplied credential details. Keep names, issuers, issue/expiry dates, IDs and verification links aligned with current records. When no credential-specific link is available, link to the LinkedIn certifications list and label it accordingly. Mark expired credentials clearly and update an existing credential rather than duplicating it.
- **Articles:** Maintain onsite articles in `data/articles.json` and their trusted HTML bodies in `data/articles/`. Maintain LinkedIn-only entries in `data/linked-articles.json`. Run the optional maintenance command below to regenerate static pages, journal cards, the journal total, home features and sitemap. LinkedIn entries without a date or approved cover use `null` for that field and display an unavailable date or placeholder artwork.
- **Article details:** Keep the title, description, category, filters, original publication date, source URL and local cover filename in the catalog. Generated pages include static metadata and structured data; the shared script preserves publication dates when updating the configured canonical URL.
- **LinkedIn covers:** Set `coverFit` to `contain` when an image needs to be shown without cropping, and record applicable attribution in `coverCredit`. Only use covers approved for this website.
- **Images:** Add optimized images to `assets/images/`, use descriptive `alt` text, explicit width and height, and `loading="lazy"` for non-critical images.
- **Design:** `assets/css/style.css` contains the base design system; `assets/css/components.css` contains page components, accessibility and responsive overrides.

## Journal behavior

Onsite articles each have an independent static page; LinkedIn-only entries open their original publications. The journal index provides client-side topic filters, text search and pagination with six articles per page. The projects page provides text search and pagination with six projects per page. Onsite article pages include estimated reading time, a scroll progress indicator, sharing/copy-link controls, related navigation and a reading layout. No journal content is fetched from a database or API.

The home page features the two newest dated journal entries across both catalogs. Entries without a known publication date remain in the journal but are not featured on the home page.

## Updating published articles

The three onsite articles are readable here without LinkedIn sign-in. Their original diagrams and screenshots are stored locally. Additional journal cards link directly to their LinkedIn publications and are labeled accordingly; LinkedIn may require sign-in.

After editing either catalog or article body sources, run:

```sh
node scripts/publish-articles.mjs
```

Node is only needed by maintainers for this regeneration command. Deploy the generated HTML, sitemap and assets along with the source files; visitors and GitHub Pages need no Node runtime or custom build configuration. Do not edit generated article pages or the marked card sections directly because regeneration replaces them.

Image provenance, captions and insertion anchors live in `data/article-images.json`. Each anchor must match one paragraph in its article body. Merchandising figures omit the `article` field; other figures specify the article slug. If adding or refreshing the original images, run `node scripts/download-article-images.mjs` before publishing. The downloader validates PNG files and fails explicitly if a source is unavailable. Rendering the journal and onsite pages does not contact LinkedIn.

Run `node --test scripts/publish-articles.test.mjs` after regeneration to check content preservation, publication dates, repeatability, nested links and combined search/topic filtering.

Earlier starter draft directories are retained but are not listed in the journal, home features or sitemap.

## SEO and accessibility

Pages use semantic headings, descriptive metadata, Open Graph/Twitter cards, configured canonical URLs and JSON-LD. `sitemap.xml`, `robots.txt` and `404.html` support discovery and GitHub Pages error handling. Keyboard focus, reduced-motion preferences, mobile navigation, labels and live status messages are included.

## Responsive layout

The desktop layout uses a centered content width up to 1240px, multi-column cards and an article sidebar. At 1024px and below, navigation switches to a touch-friendly menu and articles use a single readable column. At 800px, hero and feature sections stack; at 600px, cards become single-column. Footer links wrap, images scale with their column and long code blocks scroll within the article rather than widening the page.

## Custom domain

Set the custom domain through GitHub Pages settings and follow GitHub’s DNS instructions. Change `siteUrl` in `assets/js/site-config.js`, then update `sitemap.xml` and the `Sitemap` URL in `robots.txt` to match the canonical domain. Internal navigation remains relative and does not need to change.

## Notes

- No backend, database, build tool or paid hosting is required.
- Google Fonts are optional; system font fallbacks remain available.
- Published article titles, dates and source links are recorded in the catalog.
- Credentials reflect public profile entries and owner-supplied records, not a verified complete signed-in LinkedIn list. Consult issuer verification links for current validity.

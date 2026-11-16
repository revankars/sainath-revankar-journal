(() => {
  const config = window.SITE_CONFIG || {};
  const menuToggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav-links");

  if (menuToggle && nav) {
    const closeMenu = () => {
      nav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    };
    menuToggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", event => {
      if (event.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeMenu();
    });
  }

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach(item => observer.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add("visible"));
  }

  const journalTotal = document.querySelector("#journal-total");
  const projectTotal = document.querySelector("#project-total");
  if (journalTotal) {
    const count = document.querySelectorAll(".journal-grid .article-card").length;
    journalTotal.textContent = `${count} ${count === 1 ? "article" : "articles"} in total`;
  }
  if (projectTotal) {
    const count = document.querySelectorAll(".project-grid .project").length;
    projectTotal.textContent = `${count} ${count === 1 ? "project" : "projects"} in total`;
  }
  const collectionPageSize = 6;
  const setupCollection = ({ grid, searchInput, filters = [], emptyState, pagination, status, itemName }) => {
    if (!grid) return;

    const cards = [...grid.children].filter(card => card.matches("article"));
    let activeFilter = "all";
    let currentPage = 1;

    const update = (resetPage = false) => {
      const query = searchInput?.value.trim().toLocaleLowerCase() || "";
      const matches = cards.filter(card => {
        const categories = card.dataset.category?.split(/\s+/) || [];
        const categoryMatch = activeFilter === "all" || categories.includes(activeFilter);
        const textMatch = !query || card.textContent.toLocaleLowerCase().includes(query);
        return categoryMatch && textMatch;
      });
      const pageCount = Math.ceil(matches.length / collectionPageSize);
      currentPage = resetPage ? 1 : Math.max(1, Math.min(currentPage, pageCount || 1));
      const startIndex = (currentPage - 1) * collectionPageSize;
      const visibleCards = new Set(matches.slice(startIndex, startIndex + collectionPageSize));

      cards.forEach(card => {
        card.hidden = !visibleCards.has(card);
      });
      if (emptyState) emptyState.hidden = matches.length > 0;
      if (status) {
        status.textContent = matches.length
          ? `Showing ${startIndex + 1}–${Math.min(startIndex + collectionPageSize, matches.length)} of ${matches.length} ${itemName}${matches.length === 1 ? "" : "s"}`
          : "";
      }

      if (!pagination) return;
      pagination.replaceChildren();
      pagination.hidden = pageCount <= 1;
      if (pageCount <= 1) return;

      const addPageButton = (label, page, { disabled = false, current = false, ariaLabel = label } = {}) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "page-button";
        button.textContent = label;
        button.disabled = disabled;
        button.setAttribute("aria-label", ariaLabel);
        if (current) button.setAttribute("aria-current", "page");
        button.addEventListener("click", () => {
          currentPage = page;
          update();
        });
        pagination.append(button);
      };

      addPageButton("Previous", currentPage - 1, {
        disabled: currentPage === 1,
        ariaLabel: "Previous page"
      });
      for (let page = 1; page <= pageCount; page += 1) {
        addPageButton(String(page), page, {
          current: page === currentPage,
          ariaLabel: `Page ${page}${page === currentPage ? ", current page" : ""}`
        });
      }
      addPageButton("Next", currentPage + 1, {
        disabled: currentPage === pageCount,
        ariaLabel: "Next page"
      });
    };

    filters.forEach(button => button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filters.forEach(filter => {
        const selected = filter === button;
        filter.classList.toggle("active", selected);
        filter.setAttribute("aria-pressed", String(selected));
      });
      update(true);
    }));
    searchInput?.addEventListener("input", () => update(true));
    update(true);
  };

  setupCollection({
    grid: document.querySelector(".journal-grid"),
    searchInput: document.querySelector("#article-search"),
    filters: [...document.querySelectorAll(".filter-chip[data-filter]")],
    emptyState: document.querySelector("#journal-empty"),
    pagination: document.querySelector("#journal-pagination"),
    status: document.querySelector("#journal-results"),
    itemName: "article"
  });
  setupCollection({
    grid: document.querySelector(".project-grid"),
    searchInput: document.querySelector("#project-search"),
    emptyState: document.querySelector("#project-empty"),
    pagination: document.querySelector("#project-pagination"),
    status: document.querySelector("#project-results"),
    itemName: "project"
  });

  const year = document.querySelector("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  const canonicalUrl = () => {
    if (!config.siteUrl) return window.location.href.split("#")[0];
    const site = new URL(config.siteUrl);
    const sitePath = site.pathname.replace(/\/$/, "");
    let pagePath = window.location.pathname;
    if (sitePath && pagePath.startsWith(sitePath)) pagePath = pagePath.slice(sitePath.length);
    pagePath = pagePath.replace(/\/index\.html$/, "/");
    return `${site.origin}${sitePath}${pagePath || "/"}`;
  };

  const url = canonicalUrl();
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = url;
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.content = url;
  const pageTitle = document.title;
  const pageDescription = document.querySelector('meta[name="description"]')?.content || "";
  [["twitter:title", pageTitle], ["twitter:description", pageDescription]].forEach(([name, content]) => {
    let tag = document.querySelector(`meta[name="${name}"]`);
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = name;
      document.head.append(tag);
    }
    tag.content = content;
  });

  document.querySelectorAll("[data-config-link]").forEach(link => {
    const value = config[link.dataset.configLink];
    if (value) {
      link.href = link.dataset.configLink === "email" ? `mailto:${value}` : value;
      if (value.startsWith("https://")) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
    }
    else link.remove();
  });

  document.querySelectorAll("[data-social-share]").forEach(link => {
    const shareUrl = new URL(link.dataset.socialShare === "linkedin"
      ? "https://www.linkedin.com/sharing/share-offsite/"
      : "https://twitter.com/intent/tweet");
    shareUrl.searchParams.set("url", canonicalUrl());
    if (link.dataset.socialShare === "x") shareUrl.searchParams.set("text", document.title);
    link.href = shareUrl.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });

  const footerLinks = document.querySelector(".footer-links");
  if (footerLinks && config.githubUrl) {
    const github = document.createElement("a");
    github.href = config.githubUrl;
    github.target = "_blank";
    github.rel = "noopener noreferrer";
    github.textContent = "GitHub ↗";
    footerLinks.append(github);
    if (config.linkedinUrl) {
      const linkedin = document.createElement("a");
      linkedin.href = config.linkedinUrl;
      linkedin.target = "_blank";
      linkedin.rel = "noopener noreferrer";
      linkedin.textContent = "LinkedIn ↗";
      footerLinks.append(linkedin);
    }
  }

  const articleBody = document.querySelector(".article-content");
  if (articleBody) {
    const words = articleBody.textContent.trim().split(/\s+/).filter(Boolean).length;
    const readingTime = Math.max(1, Math.ceil(words / 220));
    document.querySelectorAll("[data-reading-time]").forEach(node => {
      node.textContent = `${readingTime} min read`;
    });

    const progress = document.querySelector(".reading-progress");
    const updateProgress = () => {
      const available = document.documentElement.scrollHeight - window.innerHeight;
      const percent = available > 0 ? (window.scrollY / available) * 100 : 0;
      if (progress) progress.style.transform = `scaleX(${Math.min(100, Math.max(0, percent)) / 100})`;
    };
    window.addEventListener("scroll", updateProgress, { passive: true });
    updateProgress();
  }

  document.querySelectorAll("[data-share]").forEach(button => {
    button.addEventListener("click", async () => {
      const shareData = { title: document.title, url: canonicalUrl() };
      const status = button.parentElement.querySelector(".share-status");
      try {
        if (navigator.share) {
          await navigator.share(shareData);
          if (status) status.textContent = "Article shared.";
          return;
        }
        await navigator.clipboard.writeText(shareData.url);
        if (status) status.textContent = "Sharing isn’t available here; article link copied instead.";
      } catch (error) {
        if (error.name === "AbortError") return;
        if (status) status.textContent = "Unable to share. Copy the page URL from your browser.";
      }
    });
  });

  document.querySelectorAll("[data-copy-url]").forEach(button => {
    button.addEventListener("click", async () => {
      const status = button.parentElement.querySelector(".share-status");
      try {
        await navigator.clipboard.writeText(canonicalUrl());
        if (status) status.textContent = "Article URL copied.";
      } catch {
        if (status) status.textContent = "Unable to copy automatically. Copy the page URL from your browser.";
      }
    });
  });

  const backToTop = document.querySelector(".back-to-top");
  if (backToTop) {
    window.addEventListener("scroll", () => {
      backToTop.hidden = window.scrollY < 500;
    }, { passive: true });
    backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  const jsonLd = document.querySelector("#site-structured-data");
  if (jsonLd) {
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": articleBody ? "Article" : "Person",
      name: "Sainath Revankar",
      ...(articleBody ? {
        headline: document.querySelector("h1")?.textContent.trim(),
        author: { "@type": "Person", name: "Sainath Revankar" },
        mainEntityOfPage: url,
        description: document.querySelector('meta[name="description"]')?.content,
        ...(document.querySelector('meta[property="article:published_time"]') ? {
          datePublished: document.querySelector('meta[property="article:published_time"]').content
        } : {})
      } : {
        url: config.siteUrl || url,
        sameAs: [config.linkedinUrl, config.githubUrl].filter(Boolean)
      })
    });
  }
})();

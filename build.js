// DecodeMyCrash static site builder — no dependencies.
// Usage: node build.js   → outputs the site into ./dist
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "dist");
const cfg = { reviewPrice: "$10", reviewTime: "48 hours", ...JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8")) };

// ---------- load fixes ----------
const fixes = [];
for (const file of fs.readdirSync(path.join(ROOT, "fixes")).filter(f => f.endsWith(".json"))) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "fixes", file), "utf8"));
  for (const fix of Array.isArray(data) ? data : [data]) {
    for (const key of ["slug", "title", "summary", "steps"]) {
      if (!fix[key]) throw new Error(`${file}: fix "${fix.slug || "?"}" is missing "${key}"`);
    }
    if (fixes.some(f => f.slug === fix.slug)) throw new Error(`Duplicate slug: ${fix.slug}`);
    fixes.push({ games: [], errorCodes: [], patterns: [], related: [], side: "client", ...fix });
  }
}
fixes.sort((a, b) => a.title.localeCompare(b.title));
const bySlug = Object.fromEntries(fixes.map(f => [f.slug, f]));

// ---------- helpers ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sideBadge = side => side === "server"
  ? `<span class="badge badge-server">Server-side — not your PC</span>`
  : `<span class="badge badge-client">Fixable on your PC</span>`;

function layout({ title, description, canonical, body, jsonld = "", depth = 0 }) {
  const up = depth ? "../".repeat(depth) : "./";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.name)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(cfg.url)}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0d1117">
<link rel="icon" href="${up}favicon.ico" sizes="any">
<link rel="icon" href="${up}icon-192.png" type="image/png" sizes="192x192">
<link rel="icon" href="${up}icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${up}apple-touch-icon.png">
<link rel="stylesheet" href="${up}styles.css">
<link rel="stylesheet" href="${up}extra.css">
${jsonld}
</head>
<body>
<header class="site-header">
  <a class="logo" href="${up}"><img src="${up}logo.svg" alt="${esc(cfg.name)}" width="352" height="64"></a>
  <nav><a href="${up}fixes/">All fixes</a><a href="${up}#get-review" class="nav-cta">Get help</a></nav>
</header>
<main>${body}</main>
<footer class="site-footer">
  <div class="maker"><img src="${up}oldwolf-crest.png" alt="The Old Wolf crest" width="48" height="48" loading="lazy"><p>${esc(cfg.name)} — ${esc(cfg.authorBlurb)}</p></div>
  <p class="fine">Not affiliated with Microsoft, Rockstar Games, Take-Two, or Cfx.re. AI suggestions are automated and not tested; written fixes are. Some links are affiliate links; they cost you nothing extra.</p>
</footer>
</body>
</html>`;
}

function reviewCard(id = "", depth = 0) {
  const up = depth ? "../".repeat(depth) : "./";
  return `<section class="book-card"${id ? ` id="${id}"` : ""}>
  <div>
    <h2>Still stuck?</h2>
    <p>Paste your error in the box at the top and click <strong>Decode my crash</strong>. If no fix comes up, click <strong>AI suggestions</strong>. If that doesn't solve it either, a ${esc(cfg.reviewPrice)} personal review from OldWolfDev appears, answered by email within ${esc(cfg.reviewTime)}. No fix, full refund.</p>
  </div>
  <div class="book-actions">
    <a class="btn" href="${up}#decoder">Decode my crash</a>
    <a class="skip-link" href="${up}#get-review">Skip ahead: get a personal review now</a>
  </div>
</section>${depth === 0 ? `\n<div id="get-review"></div>` : ""}`;
}

const fixCard = (f, depth) => `<a class="fix-card" href="${"../".repeat(depth)}fix/${f.slug}/">
  <span class="fix-games">${esc(f.games.join(" · "))}</span>
  <h3>${esc(f.title)}</h3>
  <p>${esc(f.summary)}</p>
  ${sideBadge(f.side)}
</a>`;

function write(rel, content) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// ---------- build ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of ["styles.css", "extra.css", "app.js", "codes.json", "logo.svg", "icon.svg", "favicon.ico", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "og-image.png", "oldwolf-crest.png"]) {
  fs.copyFileSync(path.join(ROOT, "src", f), path.join(OUT, f));
}

// search index used by the paste-box matcher
write("fixes.json", JSON.stringify(fixes.map(f => ({
  slug: f.slug, title: f.title, games: f.games, errorCodes: f.errorCodes,
  patterns: f.patterns, summary: f.summary, side: f.side
}))));

// home
write("index.html", layout({
  title: `${cfg.name} — ${cfg.tagline}`,
  description: "Free fixes for Windows, app and game crashes. Paste a blue screen code, error message or crash log and get plain-English steps to fix it.",
  canonical: cfg.url + "/",
  body: `
<section class="hero">
  <h1>${esc(cfg.tagline)}</h1>
  <p class="lede">Free fixes for Windows, app and game crashes: blue screens, missing DLLs, update errors, and games like FiveM, RedM, RDR2 and GTA V. Nothing to download. Your log never leaves your browser unless you choose to send it.</p>
  <form id="decoder" class="decoder" autocomplete="off">
    <label for="log" class="sr-only">Crash log or error message</label>
    <textarea id="log" rows="7" placeholder="Paste your error message, blue screen code or crash log here…&#10;&#10;Examples: 0x0000007E · VCRUNTIME140.dll was not found · 0xc0000005 · ERR_GFX_D3D_DEFERRED_MEM"></textarea>
    <div class="decoder-actions">
      <button class="btn" type="submit">Decode my crash</button>
      <button class="btn btn-ghost" type="button" id="clear">Clear</button>
    </div>
  </form>
  <div id="results" aria-live="polite"></div>
</section>
<section class="section">
  <h2>Common fixes</h2>
  <div class="grid">${fixes.slice(0, 6).map(f => fixCard(f, 0)).join("")}</div>
  <p><a href="fixes/">Browse all ${fixes.length} fixes →</a></p>
</section>
${reviewCard("review")}
<script>window.FORM_KEY=${JSON.stringify(cfg.web3formsKey || "")};window.REVIEW_URL=${JSON.stringify(cfg.reviewUrl || "")};window.REVIEW_PRICE=${JSON.stringify(cfg.reviewPrice || "")};window.REVIEW_TIME=${JSON.stringify(cfg.reviewTime || "")};</script>
<script src="app.js"></script>`
}));

// all fixes
write("fixes/index.html", layout({
  title: `All crash fixes — ${cfg.name}`,
  description: `Every crash fix on ${cfg.name}, grouped by game.`,
  canonical: cfg.url + "/fixes/",
  depth: 1,
  body: `<section class="section"><h1>All crash fixes</h1>
  <div class="grid">${fixes.map(f => fixCard(f, 1)).join("")}</div></section>${reviewCard("", 1)}`
}));

// one page per fix
for (const f of fixes) {
  const related = f.related.map(s => bySlug[s]).filter(Boolean);
  const jsonld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "HowTo", name: f.title, description: f.summary,
    step: f.steps.map((t, i) => ({ "@type": "HowToStep", position: i + 1, text: t }))
  }).replace(/</g, "\\u003c")}</script>`;

  write(`fix/${f.slug}/index.html`, layout({
    title: `${f.title} — Fix | ${cfg.name}`,
    description: f.summary,
    canonical: `${cfg.url}/fix/${f.slug}/`,
    depth: 2,
    jsonld,
    body: `
<article class="fix">
  <p class="crumbs"><a href="../../fixes/">All fixes</a> / ${esc(f.games.join(", "))}</p>
  <h1>${esc(f.title)}</h1>
  ${sideBadge(f.side)}
  ${f.errorCodes.length ? `<p class="codes">${f.errorCodes.map(c => `<code>${esc(c)}</code>`).join(" ")}</p>` : ""}
  <p class="lede">${esc(f.summary)}</p>
  ${f.cause ? `<h2>Why it happens</h2><p>${esc(f.cause)}</p>` : ""}
  <h2>How to fix it</h2>
  <ol class="steps">${f.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
  ${f.ifStillBroken ? `<h2>Still broken?</h2><p>${esc(f.ifStillBroken)}</p>` : ""}
  ${f.affiliate ? `<aside class="affiliate"><p>${esc(f.affiliate.text)}</p><a href="${esc(f.affiliate.url)}" target="_blank" rel="sponsored noopener">See options →</a></aside>` : ""}
  ${related.length ? `<h2>Related fixes</h2><div class="grid">${related.map(r => fixCard(r, 2)).join("")}</div>` : ""}
</article>
${reviewCard("", 2)}`
  }));
}

// SEO files
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["/", "/fixes/", ...fixes.map(f => `/fix/${f.slug}/`)].map(u => `  <url><loc>${cfg.url}${u}</loc></url>`).join("\n")}
</urlset>`);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${cfg.url}/sitemap.xml\n`);

console.log(`Built ${fixes.length} fixes into ${path.relative(ROOT, OUT)}/`);

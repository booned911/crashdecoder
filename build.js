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

// Version tag added to script, style and data links (app.js?v=...). It changes
// whenever those files change, so browsers fetch the new copy instead of using
// one cached from an earlier visit.
const VER = require("crypto").createHash("sha1")
  .update(["styles.css", "extra.css", "design.css", "app.js", "codes.json"].map(f => fs.readFileSync(path.join(ROOT, "src", f), "utf8")).join("\n"))
  .update(JSON.stringify(fixes))
  .digest("hex").slice(0, 10);

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
<link rel="apple-touch-icon" href="${up}apple-touch-icon.png">
<link rel="stylesheet" href="${up}styles.css?v=${VER}">
<link rel="stylesheet" href="${up}extra.css?v=${VER}">
<link rel="stylesheet" href="${up}design.css?v=${VER}">
${jsonld}
</head>
<body>
<header class="site-header">
  <a class="logo" href="${up}" aria-label="${esc(cfg.name)} home"><img src="${up}logo-mark.png" alt="" width="38" height="38"><span class="logo-word">Decode<span>My</span>Crash</span></a>
  <nav><a href="${up}fixes/">All fixes</a>${cfg.discordUrl ? `<a href="${esc(cfg.discordUrl)}" target="_blank" rel="noopener">Discord</a>` : ""}<a href="${up}#get-review" class="nav-cta">Get help</a></nav>
</header>
<main>${body}</main>
<footer class="site-footer">
  <div class="maker"><img src="${up}oldwolf-crest.png" alt="The Old Wolf crest" width="48" height="48" loading="lazy"><p>${esc(cfg.name)} — ${esc(cfg.authorBlurb)}${cfg.discordUrl ? ` <a class="discord-link" href="${esc(cfg.discordUrl)}" target="_blank" rel="noopener">Join The Old Wolf Development Discord</a>` : ""}</p></div>
  <p class="fine"><a href="${up}disclaimer/">Disclaimer and terms of use</a>. Use these fixes at your own risk. Not affiliated with Microsoft, Rockstar Games, Take-Two, or Cfx.re. AI suggestions are automated and not tested. Fixes marked "Standard fix" follow published steps and were not reproduced on our own PC. Some links are affiliate links; they cost you nothing extra. As an Amazon Associate, I earn from qualifying purchases.</p>
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

// Group each fix under the games people pick from. "Any game" and "Windows" fixes share one group.
const GAME_KEYS = { "fivem": "fivem", "redm": "redm", "red dead redemption 2": "rdr2", "gta v": "gtav", "any game": "windows", "windows": "windows" };
const gameKeys = f => [...new Set(f.games.map(g => GAME_KEYS[g.toLowerCase()]).filter(Boolean))];
const GAME_TILES = [
  { key: "fivem", name: "FiveM" },
  { key: "redm", name: "RedM" },
  { key: "rdr2", name: "Red Dead Redemption 2" },
  { key: "gtav", name: "GTA V" },
  { key: "windows", name: "Windows and any game" }
];
const countFor = key => fixes.filter(f => gameKeys(f).includes(key)).length;

const fixCard = (f, depth) => `<a class="fix-card" data-games="${gameKeys(f).join(" ")}" href="${"../".repeat(depth)}fix/${f.slug}/">
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
for (const f of ["styles.css", "extra.css", "design.css", "app.js", "codes.json", "logo.svg", "icon.svg", "favicon.ico", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "logo-mark.png", "og-image.png", "oldwolf-crest.png"]) {
  fs.copyFileSync(path.join(ROOT, "src", f), path.join(OUT, f));
}

fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, "src", "fonts"))) {
  fs.copyFileSync(path.join(ROOT, "src", "fonts", f), path.join(OUT, "fonts", f));
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
  <h1><span>Paste the crash.</span> <span>Get a plain-English fix.</span></h1>
  <p class="lede">Free fixes for Windows, app and game crashes: blue screens, missing DLLs, update errors, and games like FiveM, RedM, RDR2 and GTA V. Nothing to download.</p>
  <div class="trace" aria-hidden="true">
    <svg viewBox="0 0 960 90" preserveAspectRatio="none">
      <path class="t-crash" pathLength="1" d="M0 56 H300 L318 56 L334 18 L356 78 L376 8 L398 70 L414 40 L430 56 H470"/>
      <path class="t-glow" pathLength="1" d="M470 56 L498 74 L560 22 H960"/>
      <path class="t-fixed" pathLength="1" d="M470 56 L498 74 L560 22 H960"/>
      <path class="t-core" pathLength="1" d="M470 56 L498 74 L560 22 H960"/>
      <path class="t-spark" pathLength="1" d="M0 56 H300 L318 56 L334 18 L356 78 L376 8 L398 70 L414 40 L430 56 H470 L498 74 L560 22 H960"/>
    </svg>
  </div>
  <form id="decoder" class="decoder" autocomplete="off">
    <label for="log" class="sr-only">Crash log or error message</label>
    <textarea id="log" rows="7" placeholder="Paste your error message, blue screen code or crash log here…&#10;&#10;Examples: 0x0000007E · VCRUNTIME140.dll was not found · 0xc0000005 · ERR_GFX_D3D_DEFERRED_MEM"></textarea>
    <div class="decoder-actions">
      <button class="btn" type="submit">Decode my crash</button>
      <button class="btn btn-ghost" type="button" id="clear">Clear</button>
    </div>
  </form>
  <div id="results" aria-live="polite"></div>
  <ul class="facts">
    <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg><span><strong>${fixes.length} fixes, each tested on a real PC.</strong> No guessing, no copy-paste from forums.</span></li>
    <li><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg><span><strong>Your log stays in your browser</strong> unless you choose to send it.</span></li>
    <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 018-8 8 8 0 017.3 4.7M20 12a8 8 0 01-8 8 8 8 0 01-7.3-4.7"/><path d="M19.5 4v4.5H15M4.5 20v-4.5H9"/></svg><span><strong>Can't find it? Get a personal review for ${esc(cfg.reviewPrice)}.</strong> Refund if there's no fix.</span></li>
  </ul>
</section>
<section class="section" id="games">
  <h2>Browse by game</h2>
  <div class="games">${GAME_TILES.map(g => `<a class="game-tile t-${g.key}" href="fixes/#${g.key}"><strong>${esc(g.name)}</strong><span>${countFor(g.key)} fixes</span></a>`).join("")}</div>
</section>
<section class="section">
  <h2>Common fixes</h2>
  <div class="grid">${fixes.slice(0, 6).map(f => fixCard(f, 0)).join("")}</div>
  <p><a href="fixes/">Browse all ${fixes.length} fixes →</a></p>
</section>
${reviewCard("review")}
<script>window.FORM_KEY=${JSON.stringify(cfg.web3formsKey || "")};window.REVIEW_URL=${JSON.stringify(cfg.reviewUrl || "")};window.REVIEW_PRICE=${JSON.stringify(cfg.reviewPrice || "")};window.REVIEW_TIME=${JSON.stringify(cfg.reviewTime || "")};window.ASSET_V=${JSON.stringify(VER)};</script>
<script src="app.js?v=${VER}"></script>`
}));

// all fixes
write("fixes/index.html", layout({
  title: `All crash fixes — ${cfg.name}`,
  description: `Every crash fix on ${cfg.name}, grouped by game.`,
  canonical: cfg.url + "/fixes/",
  depth: 1,
  body: `<section class="section"><h1>All crash fixes</h1>
  <nav class="filters" aria-label="Filter fixes by game">
    <a class="chip" href="#all" data-filter="all">All ${fixes.length}</a>${GAME_TILES.map(g => `<a class="chip" href="#${g.key}" data-filter="${g.key}">${esc(g.name)} ${countFor(g.key)}</a>`).join("")}
  </nav>
  <div class="grid" id="fix-grid">${fixes.map(f => fixCard(f, 1)).join("")}</div></section>${reviewCard("", 1)}
<script>
(function () {
  var chips = document.querySelectorAll(".chip"), cards = document.querySelectorAll("#fix-grid .fix-card");
  function apply() {
    var key = (location.hash || "#all").slice(1);
    if (!document.querySelector('.chip[data-filter="' + key + '"]')) key = "all";
    chips.forEach(function (c) { c.setAttribute("aria-current", c.dataset.filter === key ? "true" : "false"); });
    cards.forEach(function (c) { c.hidden = key !== "all" && (" " + c.dataset.games + " ").indexOf(" " + key + " ") === -1; });
  }
  window.addEventListener("hashchange", apply);
  apply();
})();
</script>`
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
  ${f.basis === "standard" ? `<p class="note"><strong>Standard fix.</strong> These are the commonly published steps for this problem, checked against the sources listed on this page. We haven't reproduced this exact error on our own PC.</p>` : ""}
  <ol class="steps">${f.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
  <p class="note risk">Back up anything important before you start. You follow these steps at your own risk. <a href="../../disclaimer/">Read the disclaimer</a>.</p>
  ${Array.isArray(f.links) && f.links.length ? `<h2>Tools and downloads</h2><ul class="tool-links">${f.links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.text)}</a>${l.note ? `<span>${esc(l.note)}</span>` : ""}</li>`).join("")}</ul>` : ""}
  ${f.ifStillBroken ? `<h2>Still broken?</h2><p>${esc(f.ifStillBroken)}</p>` : ""}
  ${cfg.discordUrl ? `<p class="note discord-note">Not fixed? Ask in the <a href="${esc(cfg.discordUrl)}" target="_blank" rel="noopener">Old Wolf Development Discord</a> and tell us what worked. Never post passwords or private information.</p>` : ""}
  ${f.affiliate ? `<aside class="affiliate"><p>${esc(f.affiliate.text)}</p><a href="${esc(f.affiliate.url)}" target="_blank" rel="sponsored noopener">See options on Amazon →</a><p class="aff-note">Affiliate link: I may earn a small commission at no extra cost to you.</p></aside>` : ""}
  ${related.length ? `<h2>Related fixes</h2><div class="grid">${related.map(r => fixCard(r, 2)).join("")}</div>` : ""}
</article>
${reviewCard("", 2)}`
  }));
}

write("disclaimer/index.html", layout({
  title: `Disclaimer and terms of use | ${cfg.name}`,
  description: "Terms of use and disclaimer for DecodeMyCrash: how to use the fixes safely, and what we can and can't promise.",
  canonical: `${cfg.url}/disclaimer/`,
  depth: 1,
  body: `
<article class="fix">
  <h1>Disclaimer and terms of use</h1>
  <p class="lede">The short version: the fixes here are general help, not a guarantee. Back up your files and use them at your own risk.</p>
  <p><em>Last updated: November 2026.</em> This site, ${esc(cfg.name)}, is run by Doug of Old Wolf Development ("OldWolfDev", "we", "us"). By using the site you agree to these terms. If you don't agree, please don't use the site.</p>

  <h2>1. General information only</h2>
  <p>The fixes, explanations and error decoder on this site are published in good faith for general information. They are not professional IT, engineering, legal or financial advice, and they are not a substitute for a qualified technician who can look at your PC in person. Every computer, game version, mod setup and server is different, so a step that works for one person may not work for you.</p>

  <h2>2. You use the fixes at your own risk</h2>
  <p>Many fixes ask you to change settings, run system commands, install or remove drivers, edit game or server files, change BIOS settings or reinstall software. Doing these things carries risk, including loss of data, loss of game progress or saves, loss of mods or server configuration, account problems, voided warranties, and a PC or game that won't start. You are responsible for deciding whether a step is right for you.</p>
  <p>Before you start, back up anything you can't afford to lose. Stop if a step doesn't match what you see on screen. If you aren't comfortable with a step, ask a qualified technician. Do not follow a fix if you believe it could damage your hardware or breach your game's, server's or platform's rules.</p>

  <h2>3. "Standard fix" labels and tested fixes</h2>
  <p>Fixes marked "Standard fix" follow commonly published steps and the sources listed on the page. We have not reproduced that exact error on our own PC. Other fixes were tested on a real PC, but that doesn't mean they will work on yours. We don't promise that any fix will resolve your problem.</p>

  <h2>4. AI suggestions</h2>
  <p>The AI helper produces automated suggestions. They have not been tested or reviewed by a person, and they can be wrong. Treat them as ideas to check, not instructions to follow blindly.</p>

  <h2>5. No warranty</h2>
  <p>To the fullest extent permitted by law, this site and everything on it are provided "as is" and "as available", without warranties of any kind, express or implied, including any warranty of accuracy, completeness, reliability, availability, fitness for a particular purpose or non-infringement. Software, games and websites change often, and information here may be out of date.</p>

  <h2>6. Limit of liability</h2>
  <p>To the fullest extent permitted by law, OldWolfDev and its owner, contributors and affiliates will not be liable for any loss or damage of any kind that comes from using, or being unable to use, this site or its fixes. That includes direct, indirect, incidental, consequential or special loss, loss of data, saves, mods, profits or account access, and damage to any computer, console, game or server, even if we were told it was possible. Where the law doesn't allow a particular exclusion, our liability is limited to the smallest amount the law allows, and for paid reviews it will not exceed the amount you paid for that review. Nothing in these terms limits any right you have that the law doesn't allow to be limited.</p>

  <h2>7. Paid reviews</h2>
  <p>A paid review is a personal look at the details you send. We will answer by email within the time shown on the site and, as stated on the site, refund you if we can't find a fix. A review is the same kind of general help as the rest of the site. It does not guarantee a result and the limits above still apply. Payments are handled by Stripe, and we don't see or store your card details.</p>

  <h2>8. What you send us</h2>
  <p>The paste-box decoder compares your error text to our fixes in your browser. If you use AI suggestions, the text you pasted is sent to our AI service to produce a reply. If you request a review, what you enter is sent to us through a form service. Please don't paste passwords, payment details, personal data or anything private into the site. We use Cloudflare's analytics to count visits. We use what you send only to answer your request and to improve the site, and we don't sell it. By sending us information you confirm you're allowed to share it.</p>

  <h2>9. Other companies, links and affiliate disclosure</h2>
  <p>${esc(cfg.name)} is an independent site. We are not affiliated with, endorsed by or sponsored by Microsoft, Rockstar Games, Take-Two Interactive, Cfx.re (FiveM and RedM), Valve, Riot Games, Epic Games, NVIDIA, AMD, or any other company named here. All product names, game titles and trademarks belong to their owners and are used only to say what a fix is about.</p>
  <p>Links to other sites and downloads are for convenience. We don't control them and can't promise they are accurate or safe, so use your own judgment and download software only from the official source. Some links are affiliate links. If you buy through one we may earn a commission at no extra cost to you. As an Amazon Associate we earn from qualifying purchases.</p>

  <h2>10. Our content</h2>
  <p>The text, design and code on this site belong to OldWolfDev unless stated otherwise. You may link to us and share short excerpts with a link back. Please don't copy whole pages or the fix library without asking.</p>

  <h2>11. Changes</h2>
  <p>We may change the site, the fixes and these terms at any time. The date at the top shows the last update, and continuing to use the site means you accept the current version.</p>

  <h2>12. Contact</h2>
  <p>Questions about these terms? Email <a href="mailto:oldwolfdev@gmail.com">oldwolfdev@gmail.com</a>.</p>
</article>`
}));

// SEO files
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["/", "/fixes/", "/disclaimer/", ...fixes.map(f => `/fix/${f.slug}/`)].map(u => `  <url><loc>${cfg.url}${u}</loc></url>`).join("\n")}
</urlset>`);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${cfg.url}/sitemap.xml\n`);

console.log(`Built ${fixes.length} fixes into ${path.relative(ROOT, OUT)}/`);

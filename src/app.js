// DecodeMyCrash paste box.
// 1) Matches pasted text against the written fix library.
// 2) Decodes known Windows error formats (stop codes, crash codes, update codes,
//    missing DLLs, faulting modules) using codes.json.
// 3) Offers opt-in AI suggestions (sent to /api/ai) and a "Send to OldWolfDev" form.
// Matching and decoding run entirely in the browser. Text only leaves the browser
// if the visitor clicks the AI button or sends the form, and personal details are
// stripped first.
(function () {
  const form = document.getElementById("decoder");
  const box = document.getElementById("log");
  const out = document.getElementById("results");
  let fixesIndex = null;
  let codes = null;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function load() {
    if (!fixesIndex || !codes) {
      const [f, c] = await Promise.all([
        fetch("fixes.json?v=" + (window.ASSET_V || "")).then(r => r.json()),
        fetch("codes.json?v=" + (window.ASSET_V || "")).then(r => r.json()).catch(() => ({}))
      ]);
      fixesIndex = f;
      codes = c || {};
    }
    return { fixes: fixesIndex, codes };
  }

  // ---------- 1. fix library ----------

  // Score = sum of matched pattern lengths, with error codes weighted higher.
  function score(fix, text) {
    let s = 0;
    const hits = [];
    for (const code of fix.errorCodes) {
      if (code && text.includes(code.toLowerCase())) { s += 50 + code.length; hits.push(code); }
    }
    for (const p of fix.patterns) {
      if (p && text.includes(p.toLowerCase()) && !hits.some(h => h.toLowerCase() === p.toLowerCase())) {
        s += p.length; hits.push(p);
      }
    }
    return { s, hits };
  }

  // ---------- 2. error code decoder ----------

  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasWord = (text, word) => new RegExp(`(^|[^a-z0-9_])${reEsc(word)}($|[^a-z0-9_])`).test(text);
  const hexVal = s => parseInt(String(s).replace(/^0x/i, ""), 16);

  function decode(raw) {
    const C = codes || {};
    const text = raw.toLowerCase();
    const found = [];
    const seen = new Set();
    const add = (kind, label, e, extra = {}) => {
      const key = `${kind}:${e.code || e.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({ kind, label, code: e.code || "", name: e.name, meaning: e.meaning, steps: e.steps || [], fix: e.fix || "", ...extra });
    };

    // every hex value in the text: 0x-prefixed, and bare 8-digit hex (Event Viewer style)
    const hexes = new Set();
    for (const m of text.matchAll(/\b0x([0-9a-f]{1,8})\b/g)) hexes.add(parseInt(m[1], 16));
    for (const m of text.matchAll(/\b([0-9a-f]{8})\b/g)) hexes.add(parseInt(m[1], 16));
    const padded = new Set([...text.matchAll(/\b0x(0{4,}[0-9a-f]{1,4})\b/g)].map(m => parseInt(m[1], 16)));
    const bsodContext = /bug ?check|stop code|blue ?screen|bsod|minidump|ran into a problem/.test(text);

    // blue screen stop codes: by name, by 0x0000XXXX form, or short form near BSOD words
    const stopHits = [];
    for (const e of C.stopCodes || []) {
      const n = e.name.toLowerCase();
      const v = hexVal(e.code);
      if (hasWord(text, n) || hasWord(text, n.replace(/_/g, " ")) || padded.has(v) || (bsodContext && hexes.has(v))) stopHits.push(e);
    }
    // drop a shorter name contained in a longer matched one (IRQL_NOT_LESS_OR_EQUAL vs DRIVER_IRQL_...)
    for (const e of stopHits) {
      if (stopHits.some(o => o !== e && o.name.includes(e.name) && hasWord(text, o.name.toLowerCase()))) continue;
      add("stop", "Blue screen stop code", e);
    }

    // app/game crash codes and Windows Update codes: by exact value (or DXGI-style names)
    for (const e of C.exceptionCodes || []) {
      if (hexes.has(hexVal(e.code)) || (e.name.includes("_") && hasWord(text, e.name.toLowerCase()))) add("exception", "Crash code", e);
    }
    for (const e of C.updateCodes || []) {
      if (hexes.has(hexVal(e.code))) add("update", "Windows error code", e);
    }

    // Device Manager "Code 43" style
    if (/device/.test(text)) {
      for (const m of text.matchAll(/\bcode\s*:?\s*(\d{1,2})\b/g)) {
        const e = (C.deviceCodes || []).find(d => d.code === m[1]);
        if (e) add("device", "Device Manager code", { ...e, code: `Code ${e.code}` });
      }
    }

    // missing DLLs (only when the text says something is missing or failed to load)
    const missingContext = /not found|was not found|missing|cannot (be )?found|could not (be )?(found|loaded|load)|can't find|cannot find|unable to (load|find|locate)|failed to load|code execution cannot proceed|cannot proceed/.test(text);
    if (missingContext) {
      for (const e of C.dlls || []) {
        const file = e.files.find(f => hasWord(text, f));
        if (file) add("dll", "Missing file", { ...e, code: file });
      }
    }

    // faulting modules: the one named after "Faulting module name" first, then others mentioned
    const fm = text.match(/faulting module name:\s*([^\s,]+)/);
    const primary = fm ? fm[1] : "";
    const mods = [];
    for (const e of C.modules || []) {
      const file = e.files.find(f => hasWord(text, f));
      if (file) mods.push({ e, file, primary: primary && e.files.includes(primary) });
    }
    mods.sort((a, b) => b.primary - a.primary);
    for (const m of mods.slice(0, 3)) {
      add("module", m.primary ? "Crashed in" : "Mentioned in your log", { ...m.e, code: m.file });
    }

    // known messages
    for (const e of C.phrases || []) {
      if (e.match.some(p => text.includes(p))) add("phrase", "Message", e);
    }

    const app = (raw.match(/faulting application name:\s*([^\s,]+)/i) || [])[1] || "";
    return { found: found.slice(0, 6), app };
  }

  // ---------- privacy: strip personal details before anything is sent ----------

  function redact(s) {
    return String(s)
      .replace(/([a-z]:[\\/]+users[\\/]+)[^\\/\r\n"']+/gi, "$1<user>")
      .replace(/(\/(?:users|home)\/)[^/\r\n"']+/gi, "$1<user>")
      .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "<email>")
      .replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, (m, a, b, c, d) =>
        [a, b, c, d].every(n => Number(n) <= 255) ? "<ip>" : m)
      .replace(/\b(computer|user|user name|username|machine name)(\s*[:=]\s*)\S+/gi, "$1$2<removed>")
      .replace(/\bdesktop-[a-z0-9]{5,}\b/gi, "<pc-name>")
      .replace(/\blaptop-[a-z0-9]{5,}\b/gi, "<pc-name>");
  }

  // ---------- no-match helpers ----------

  function gameHint(text) {
    if (/redm|rdr3|citizenfx.*rdr/i.test(text)) return "RedM";
    if (/fivem|citizenfx|cfx\.re|gta5_b\d+/i.test(text)) return "FiveM";
    if (/red dead|rdr2/i.test(text)) return "RDR2";
    if (/gta ?v|gta5|grand theft auto/i.test(text)) return "GTA V";
    return "";
  }

  function keyLine(raw) {
    const errCode = raw.match(/\bERR_[A-Z0-9_]{3,}\b/i);
    if (errCode) return errCode[0];
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const priorities = [
      /\b0x[0-9a-f]{5,}\b/i,
      /\b[a-z0-9_]+\.dll\b/i,
      /caused .{1,40} to stop working/i,
      /\b(error|exception|failed|couldn't|could not|crash(ed)?)\b/i
    ];
    for (const p of priorities) {
      const line = lines.find(l => p.test(l));
      if (line) return redact(line).slice(0, 140);
    }
    return redact(lines[0] || "").slice(0, 140);
  }

  function searchLinks(raw) {
    const line = keyLine(raw);
    const game = gameHint(raw);
    const q = encodeURIComponent(line);
    const qGame = encodeURIComponent(game && !line.toLowerCase().includes(game.toLowerCase()) ? `${game} ${line}` : line);
    const links = [
      { label: "Search Google", href: `https://www.google.com/search?q=${qGame}` },
      { label: "Search Reddit", href: `https://www.reddit.com/search/?q=${qGame}` }
    ];
    if (game === "FiveM" || game === "RedM") links.unshift({ label: "Search the Cfx.re forum", href: `https://forum.cfx.re/search?q=${q}` });
    else links.push({ label: "Search Microsoft Q&A", href: `https://learn.microsoft.com/en-us/search/?terms=${q}&category=QnA` });
    return { line, links };
  }

  // ---------- rendering ----------

  function fixCards(matches) {
    return `<h2 class="results-title">Most likely fix${matches.length > 1 ? "es" : ""}</h2>` +
      matches.map((m, i) => `<a class="fix-card result${i === 0 ? " top" : ""}" href="fix/${m.fix.slug}/">
        <span class="fix-games">${esc(m.fix.games.join(" · "))}${i === 0 ? " · best match" : ""}</span>
        <h3>${esc(m.fix.title)}</h3>
        <p>${esc(m.fix.summary)}</p>
        <span class="matched">Matched: ${m.hits.map(h => `<code>${esc(h)}</code>`).join(" ")}</span>
      </a>`).join("");
  }

  function decodedCards(dec, slugs) {
    if (!dec.found.length) return "";
    return `<h2 class="results-title">What your error means</h2>
      ${dec.app ? `<p class="decoded-app">Program that crashed: <code>${esc(dec.app)}</code></p>` : ""}
      ${dec.found.map(f => `<div class="decoded-card">
        <span class="fix-games">${esc(f.label)}</span>
        <h3>${f.code ? `<code>${esc(f.code)}</code> ` : ""}${esc(f.name)}</h3>
        <p>${esc(f.meaning)}</p>
        ${f.steps.length ? `<ol class="decoded-steps">${f.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
        ${f.fix && slugs.has(f.fix) ? `<a class="decoded-more" href="fix/${esc(f.fix)}/">Full step-by-step fix →</a>` : ""}
      </div>`).join("")}`;
  }

  function aiBox(compact) {
    return `<div class="ai-box${compact ? " ai-compact" : ""}" id="ai-box">
      <h4>${compact ? "Not quite it? Ask AI for more ideas" : "Get AI suggestions"}</h4>
      <p class="ai-note">Sends the text in the box to Cloudflare's AI service to suggest likely causes and steps. Your Windows username, PC name, email and IP addresses are removed first, and DecodeMyCrash doesn't save it. AI answers aren't tested by OldWolfDev, so double-check before changing system settings.</p>
      <button class="btn${compact ? " btn-ghost" : ""}" type="button" id="ai-btn">Get AI suggestions</button>
      <div id="ai-out" aria-live="polite"></div>
    </div>
    <div id="review-slot"></div>`;
  }

  function reviewForm(raw, direct = false) {
    if (!window.FORM_KEY || !window.REVIEW_URL) return "";
    const price = window.REVIEW_PRICE || "$10";
    const time = window.REVIEW_TIME || "48 hours";
    return `<div class="nomatch-send${direct ? " direct-review" : ""}" id="review-panel">
      <h4>${direct ? "Get a personal review" : "Didn't solve it? Get a personal review"}</h4>
      <p>For ${esc(price)}, OldWolfDev will research your error and email you a fix within ${esc(time)}. If I can't find one, you get a full refund.</p>
      <p class="send-privacy">Only what's in the box below and your email are sent. Personal details we could spot are already removed; check for anything else you'd rather not share.</p>
      <form id="send-error" class="decoder nomatch-form" autocomplete="off">
        <label for="send-text" class="sr-only">Error to send</label>
        <textarea id="send-text" rows="6" maxlength="5000"${direct ? ' placeholder="Paste your error message, blue screen code or crash log here. Add a line about what you were doing when it happened."' : ""}>${esc(redact(raw).slice(0, 5000))}</textarea>
        <label for="send-email" class="sr-only">Your email</label>
        <input id="send-email" type="email" placeholder="Your email (where I'll send the fix)" maxlength="200" required autocomplete="email">
        <input type="checkbox" id="send-botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="decoder-actions">
          <button class="btn" type="submit" id="send-btn">Get a personal review · ${esc(price)}</button>
        </div>
        <p class="send-status" id="send-status" role="status"></p>
        <div id="pay-step"></div>
      </form>
    </div>`;
  }

  // The review offer only appears after the AI has had a go.
  function revealReview(raw, dec) {
    const slot = document.getElementById("review-slot");
    if (!slot || slot.dataset.shown) return;
    const html = reviewForm(raw);
    if (!html) return;
    closeDirect(); // only one review form on the page at a time
    slot.dataset.shown = "1";
    slot.innerHTML = html;
    const sf = document.getElementById("send-error");
    if (sf) sf.addEventListener("submit", e => sendError(e, raw, dec));
  }

  function extras(raw) {
    const { line, links } = searchLinks(raw);
    return `<div class="nomatch-search">
        <p class="nomatch-label">Search the web for <code>${esc(line)}</code></p>
        <div class="nomatch-links">${links.map(l =>
          `<a class="btn btn-ghost" href="${esc(l.href)}" target="_blank" rel="noopener nofollow">${esc(l.label)}</a>`).join("")}
        </div>
      </div>`;
  }

  function render(matches, dec, raw, slugs) {
    let html = "";
    if (matches.length) {
      html = fixCards(matches) + decodedCards(dec, slugs) + aiBox(true);
    } else if (dec.found.length) {
      html = decodedCards(dec, slugs) + `<div class="result-empty">
        <h3>No full fix page for this one yet</h3>
        <p>The steps above are a good start. If they don't solve it:</p>
        ${aiBox(false)}
        ${extras(raw)}
      </div>`;
    } else {
      html = `<div class="result-empty">
        <h3>No fix found yet</h3>
        <p>This one isn't in the library yet. Here's how to get unstuck:</p>
        ${aiBox(false)}
        ${extras(raw)}
      </div>`;
    }
    out.innerHTML = html;

    const ab = document.getElementById("ai-btn");
    if (ab) ab.addEventListener("click", () => askAI(raw, dec));
  }

  // ---------- AI suggestions ----------

  function formatAI(text) {
    const heads = {
      "what it means": "What it means",
      "likely causes": "Likely causes",
      "try these steps": "Try these steps",
      "get help if": "Get more help if",
      "before you start": "Before you start"
    };
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    let html = "", list = "";
    const close = () => { if (list) { html += `</${list}>`; list = ""; } };
    for (const rawLine of String(text).split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) { close(); continue; }
      const h = line.replace(/^#+\s*/, "").replace(/\*\*/g, "").replace(/:$/, "").toLowerCase();
      if (heads[h]) { close(); html += `<h5>${heads[h]}</h5>`; continue; }
      let m;
      if ((m = line.match(/^[-*•]\s+(.*)/))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = line.match(/^\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; continue; }
      close();
      html += `<p>${inline(line)}</p>`;
    }
    close();
    return html;
  }

  async function askAI(raw, dec) {
    const btn = document.getElementById("ai-btn");
    const aiOut = document.getElementById("ai-out");
    btn.disabled = true;
    aiOut.innerHTML = `<p class="ai-status">Thinking… this can take up to 30 seconds.</p>`;
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          log: redact(raw).slice(0, 6000),
          known: dec.found.map(f => `${f.code ? f.code + " " : ""}${f.name}`)
        })
      });
      let data = {};
      try { data = await res.json(); } catch (_) { /* blocked by rate limit returns a page, not JSON */ }
      if (res.ok && data.answer) {
        aiOut.innerHTML = `<div class="ai-answer">
          <p class="ai-label">AI suggestion · not tested by OldWolfDev</p>
          ${formatAI(data.answer)}
          <p class="ai-foot">${window.REVIEW_URL ? "Didn't solve it? You can get a personal review below." : ""}</p>
        </div>`;
        btn.style.display = "none";
        revealReview(raw, dec);
        return;
      }
      const msg = {
        busy: "AI help has reached its limit for today. Try again tomorrow, or get a personal review below.",
        not_configured: "AI help isn't available right now. You can get a personal review below.",
        too_short: "Paste a bit more of the error or log so the AI has something to work with.",
        not_allowed: "AI help only works on decodemycrash.com."
      }[data.error] || (res.status === 429 || !data.error
        ? "Too many requests. Wait a few seconds and try again."
        : "AI help couldn't answer right now. Try again in a minute.");
      aiOut.innerHTML = `<p class="ai-status">${esc(msg)}</p>`;
      btn.disabled = false;
      if (data.error === "busy" || data.error === "not_configured" || data.error === "ai_failed") revealReview(raw, dec);
    } catch (err) {
      aiOut.innerHTML = `<p class="ai-status">AI help couldn't be reached. Check your connection and try again.</p>`;
      btn.disabled = false;
      revealReview(raw, dec);
    }
  }

  // ---------- send to OldWolfDev ----------

  // "Get help" / "Skip ahead" links open the review form straight away,
  // under the Still stuck? card, with an empty box for the visitor's error.
  const directSlot = document.getElementById("get-review");
  function closeDirect() { if (directSlot) directSlot.innerHTML = ""; }
  function openDirect() {
    if (!directSlot) return;
    if (!document.querySelector("#get-review #review-panel")) {
      const html = reviewForm("", true);
      if (!html) { location.hash = "decoder"; return; } // review not set up: fall back to the paste box
      const old = document.getElementById("review-slot"); // drop an AI-revealed form to avoid duplicates
      if (old) { old.innerHTML = ""; delete old.dataset.shown; }
      directSlot.innerHTML = html;
      const sf = document.getElementById("send-error");
      sf.addEventListener("submit", e => sendError(e, "", { found: [] }, true));
      const t = document.getElementById("send-text");
      if (box.value.trim()) t.value = redact(box.value.trim()).slice(0, 5000);
    }
    directSlot.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("send-text").focus({ preventScroll: true });
  }

  const newRef = () => "DMC-" + Array.from(crypto.getRandomValues(new Uint8Array(4)), n => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32]).join("");

  async function sendError(e, raw, dec, direct = false) {
    e.preventDefault();
    const status = document.getElementById("send-status");
    const text = document.getElementById("send-text").value.trim();
    if (direct) { await load().catch(() => {}); raw = text; dec = decode(text); }
    const emailEl = document.getElementById("send-email");
    const email = emailEl.value.trim();
    if (document.getElementById("send-botcheck").checked) return;
    if (!text) { status.textContent = "There's nothing to send. Paste the error in the box first."; return; }
    if (!email) { status.textContent = "Please add your email so I can send you the review."; emailEl.focus(); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.textContent = "That email doesn't look right. Please check it."; emailEl.focus(); return; }

    const buttons = document.getElementById("send-error").querySelectorAll("button");
    buttons.forEach(b => (b.disabled = true));
    status.textContent = "Sending…";
    const game = gameHint(raw);
    const ref = newRef();
    const payload = {
      access_key: window.FORM_KEY,
      subject: `REVIEW ${ref}: awaiting ${window.REVIEW_PRICE || "$10"} payment — DecodeMyCrash`,
      from_name: "DecodeMyCrash",
      type: `Paid review request (only review once the Stripe payment from ${email} arrives)`,
      route: direct ? "Skipped ahead (did not try the AI first)" : "Tried the AI first",
      reference: ref,
      error: text,
      game: game || "none detected",
      decoded: dec.found.map(f => `${f.code ? f.code + " " : ""}${f.name}`).join("; ") || "nothing decoded",
      search_line: keyLine(raw),
      page: location.href,
      botcheck: false
    };
    payload.email = email; payload.replyto = email;

    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!(res.ok && data.success !== false)) throw new Error(data.message || "send failed");

      document.getElementById("send-error").querySelectorAll("textarea, input").forEach(el => (el.disabled = true));
      {
        const url = `${window.REVIEW_URL}${window.REVIEW_URL.includes("?") ? "&" : "?"}prefilled_email=${encodeURIComponent(email)}&client_reference_id=${ref}`;
        status.textContent = "";
        document.getElementById("pay-step").innerHTML = `<div class="pay-step">
          <p><strong>Almost done.</strong> Your error is saved as <code>${ref}</code>. Complete the ${esc(window.REVIEW_PRICE || "$10")} payment to send it for review. I'll reply to <strong>${esc(email)}</strong> within ${esc(window.REVIEW_TIME || "48 hours")}.</p>
          <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Pay ${esc(window.REVIEW_PRICE || "$10")} securely with Stripe</a>
          <p class="pay-note">Unpaid requests aren't reviewed. If I can't find a fix, you'll get a full refund.</p>
        </div>`;
      }
    } catch (err) {
      buttons.forEach(b => (b.disabled = false));
      status.textContent = "Couldn't send right now. Please try again in a minute.";
    }
  }

  // ---------- wire up ----------

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const raw = box.value.trim();
    const text = raw.toLowerCase();
    if (!text) { box.focus(); return; }
    const { fixes } = await load();
    const matches = fixes.map(fix => ({ fix, ...score(fix, text) }))
      .filter(m => m.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
    const dec = decode(raw);
    render(matches, dec, raw, new Set(fixes.map(f => f.slug)));
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.getElementById("clear").addEventListener("click", () => {
    box.value = ""; out.innerHTML = ""; box.focus();
  });

  // "Decode my crash" links (Still stuck? card, fix pages) point at #decoder.
  // On a tall screen the box is already visible, so a plain jump looks like
  // nothing happened. Scroll smoothly, put the cursor in the box and flash it.
  function goToBox() {
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    box.focus({ preventScroll: true });
    box.classList.remove("flash");
    void box.offsetWidth; // restart the animation if clicked twice
    box.classList.add("flash");
  }
  document.querySelectorAll('a[href$="#decoder"]').forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      if (location.hash !== "#decoder") history.pushState(null, "", "#decoder");
      goToBox();
    });
  });
  if (location.hash === "#decoder") setTimeout(goToBox, 50);

  document.querySelectorAll('a[href$="#get-review"]').forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      if (location.hash !== "#get-review") history.pushState(null, "", "#get-review");
      openDirect();
    });
  });
  if (location.hash === "#get-review") setTimeout(openDirect, 50);

  // exposed for testing only
  window.__dmc = { decode, redact, keyLine, formatAI, load };
})();

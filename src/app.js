// Paste-box matcher. Matching runs entirely in the browser — logs are never uploaded.
// The only thing that ever leaves the browser is an error the visitor chooses to send
// with the "Send to OldWolfDev" form, which appears when no fix matches.
(function () {
  const form = document.getElementById("decoder");
  const box = document.getElementById("log");
  const out = document.getElementById("results");
  let index = null;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function load() {
    if (!index) index = await (await fetch("fixes.json")).json();
    return index;
  }

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

  // ---------- no-match helpers ----------

  // Which game the log seems to be from, used to sharpen web searches.
  function gameHint(text) {
    if (/redm|rdr3|citizenfx.*rdr/i.test(text)) return "RedM";
    if (/fivem|citizenfx|cfx\.re|gta5_b\d+/i.test(text)) return "FiveM";
    if (/red dead|rdr2/i.test(text)) return "RDR2";
    if (/gta ?v|gta5|grand theft auto/i.test(text)) return "GTA V";
    return "";
  }

  // Pull the most useful line out of a long log to search for.
  function keyLine(raw) {
    const errCode = raw.match(/\bERR_[A-Z0-9_]{3,}\b/i);
    if (errCode) return errCode[0];
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const priorities = [
      /\b0x[0-9a-f]{5,}\b/i,
      /caused .{1,40} to stop working/i,
      /\b(error|exception|failed|couldn't|could not|crash(ed)?)\b/i
    ];
    for (const p of priorities) {
      const line = lines.find(l => p.test(l));
      if (line) return line.slice(0, 140);
    }
    return (lines[0] || "").slice(0, 140);
  }

  function searchLinks(raw) {
    const line = keyLine(raw);
    const game = gameHint(raw);
    const q = encodeURIComponent(line);
    const qGame = encodeURIComponent(game && !line.toLowerCase().includes(game.toLowerCase()) ? `${game} ${line}` : line);
    return {
      line,
      links: [
        { label: "Search the Cfx.re forum", href: `https://forum.cfx.re/search?q=${q}` },
        { label: "Search Google", href: `https://www.google.com/search?q=${qGame}` },
        { label: "Search Reddit", href: `https://www.reddit.com/search/?q=${qGame}` }
      ]
    };
  }

  function renderNoMatch(raw) {
    const { line, links } = searchLinks(raw);
    const formKey = window.FORM_KEY || "";
    const sendForm = formKey ? `
      <div class="nomatch-send">
        <h4>Send it to OldWolfDev</h4>
        <p>I'll review it, and if you leave your email I'll reply with what I find. Only what's in the box below and your email are sent. Remove anything personal first, like your Windows username or server IPs.</p>
        <form id="send-error" class="decoder nomatch-form" autocomplete="off">
          <label for="send-text" class="sr-only">Error to send</label>
          <textarea id="send-text" rows="6" maxlength="5000">${esc(raw.slice(0, 5000))}</textarea>
          <label for="send-email" class="sr-only">Your email (optional)</label>
          <input id="send-email" type="email" placeholder="Your email (optional, for a reply)" maxlength="200">
          <input type="checkbox" id="send-botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="decoder-actions">
            <button class="btn" type="submit" id="send-btn">Send to OldWolfDev</button>
          </div>
          <p class="send-status" id="send-status" role="status"></p>
        </form>
      </div>` : "";

    out.innerHTML = `<div class="result-empty">
      <h3>No fix found yet</h3>
      <p>This one isn't in the library yet. Here's how to get unstuck:</p>
      <div class="nomatch-search">
        <p class="nomatch-label">Search the web for <code>${esc(line)}</code></p>
        <div class="nomatch-links">${links.map(l =>
          `<a class="btn btn-ghost" href="${esc(l.href)}" target="_blank" rel="noopener nofollow">${esc(l.label)}</a>`).join("")}
        </div>
      </div>
      ${sendForm}
      <div class="nomatch-book">
        <p>Want it fixed now? Book a session and we'll solve it together. Then it gets added to the site so the next person doesn't get stuck.</p>
        <a class="btn" href="${esc(window.BOOKING_URL)}" target="_blank" rel="noopener">Book a fix session</a>
      </div>
    </div>`;

    const sf = document.getElementById("send-error");
    if (sf) sf.addEventListener("submit", e => sendError(e, raw));
  }

  async function sendError(e, raw) {
    e.preventDefault();
    const status = document.getElementById("send-status");
    const btn = document.getElementById("send-btn");
    const text = document.getElementById("send-text").value.trim();
    const email = document.getElementById("send-email").value.trim();
    if (document.getElementById("send-botcheck").checked) return; // bot filled the hidden box
    if (!text) { status.textContent = "There's nothing to send. Paste the error in the box first."; return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.textContent = "That email doesn't look right. Fix it or leave it blank."; return; }

    btn.disabled = true;
    status.textContent = "Sending…";
    const payload = {
      access_key: window.FORM_KEY,
      subject: `Unmatched error${gameHint(raw) ? ` (${gameHint(raw)})` : ""} — DecodeMyCrash`,
      from_name: "DecodeMyCrash",
      error: text,
      game: gameHint(raw) || "unknown",
      search_line: keyLine(raw),
      page: location.href,
      botcheck: false
    };
    if (email) { payload.email = email; payload.replyto = email; }

    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        status.textContent = email
          ? "Sent. Thanks! I'll take a look and reply to your email."
          : "Sent. Thanks! I'll take a look and may add a fix for it.";
        document.getElementById("send-error").querySelectorAll("textarea, input, button").forEach(el => (el.disabled = true));
      } else {
        throw new Error(data.message || "send failed");
      }
    } catch (err) {
      btn.disabled = false;
      status.textContent = "Couldn't send right now. Please try again in a minute, or book a session instead.";
    }
  }

  // ---------- results ----------

  function render(matches, raw) {
    if (!matches.length) { renderNoMatch(raw); return; }
    out.innerHTML = `<h2 class="results-title">Most likely cause${matches.length > 1 ? "s" : ""}</h2>` +
      matches.map((m, i) => `<a class="fix-card result${i === 0 ? " top" : ""}" href="fix/${m.fix.slug}/">
        <span class="fix-games">${esc(m.fix.games.join(" · "))}${i === 0 ? " · best match" : ""}</span>
        <h3>${esc(m.fix.title)}</h3>
        <p>${esc(m.fix.summary)}</p>
        <span class="matched">Matched: ${m.hits.map(h => `<code>${esc(h)}</code>`).join(" ")}</span>
      </a>`).join("");
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const raw = box.value.trim();
    const text = raw.toLowerCase();
    if (!text) { box.focus(); return; }
    const fixes = await load();
    const matches = fixes.map(fix => ({ fix, ...score(fix, text) }))
      .filter(m => m.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
    render(matches, raw);
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.getElementById("clear").addEventListener("click", () => {
    box.value = ""; out.innerHTML = ""; box.focus();
  });
})();

// Paste-box matcher. Runs entirely in the browser — logs are never uploaded.
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

  function render(matches) {
    if (!matches.length) {
      out.innerHTML = `<div class="result-empty">
        <h3>No match yet</h3>
        <p>We haven't written a fix for this one. Book a session and we'll solve it with you — and add it to the site so the next person doesn't get stuck.</p>
        <a class="btn" href="${esc(window.BOOKING_URL)}" target="_blank" rel="noopener">Book a fix session</a>
      </div>`;
      return;
    }
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
    const text = box.value.trim().toLowerCase();
    if (!text) { box.focus(); return; }
    const fixes = await load();
    const matches = fixes.map(fix => ({ fix, ...score(fix, text) }))
      .filter(m => m.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
    render(matches);
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.getElementById("clear").addEventListener("click", () => {
    box.value = ""; out.innerHTML = ""; box.focus();
  });
})();

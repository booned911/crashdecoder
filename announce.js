// Optional: post newly added fixes to Discord. Runs after build.js.
// Needs DISCORD_WEBHOOK_URL set in Cloudflare Pages (Settings > Variables). Skips quietly if missing or on any error.
const fs = require("fs");
const hook = process.env.DISCORD_WEBHOOK_URL;
const cfg = JSON.parse(fs.readFileSync("site.config.json", "utf8"));
(async () => {
  try {
    if (!hook) return console.log("announce: no webhook set, skipping");
    if (process.env.ANNOUNCE_TEST) {
      await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Test post: DecodeMyCrash announcements are connected. New fixes will appear here automatically." }) });
      return console.log("announce: test message sent");
    }
    const next = JSON.parse(fs.readFileSync("dist/fixes.json", "utf8"));
    const res = await fetch(cfg.url + "/fixes.json", { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return console.log("announce: live site not readable, skipping");
    const live = new Set((await res.json()).map(f => f.slug));
    const added = next.filter(f => !live.has(f.slug)).slice(0, 10);
    for (const f of added) {
      await fetch(hook, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "New fix: **" + f.title + "**\n" + cfg.url + "/fix/" + f.slug + "/" })
      });
    }
    console.log("announce: posted " + added.length);
  } catch (e) { console.log("announce: skipped (" + e.message + ")"); }
})();

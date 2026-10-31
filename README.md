# CrashDecoder

Plain-English crash fixes for RDR2, RedM, FiveM and GTA V. A static site: no server, no database, free to host.

## How it works

- `fixes/*.json` — your fix library. One file per game group, each holding a list of fixes.
- `build.js` — turns the fixes into a full website in `dist/` (home page, one page per fix, sitemap for Google).
- `src/app.js` — the paste box. It matches pasted logs against each fix's `errorCodes` and `patterns` right in the visitor's browser. Nothing is uploaded.
- `site.config.json` — site name, URL, booking link and price. Change these first.

## Run it on your PC

1. Install Node.js (LTS) from nodejs.org.
2. Open a terminal in this folder.
3. Run `npm run preview` and open the address it prints (usually http://localhost:3000).

## Add a new fix

Copy any fix block in a `fixes/*.json` file and change:

| Field | What it's for |
|---|---|
| `slug` | The page URL, lowercase-with-dashes. Must be unique. |
| `title` | Write it the way people google it. Include the exact error text. |
| `games` | Which games it applies to. |
| `errorCodes` | Exact codes. These score highest in the matcher. |
| `patterns` | Lowercase text snippets that appear in logs for this crash. |
| `side` | `client` (fixable on their PC) or `server` (the server's problem). |
| `summary`, `cause`, `steps`, `ifStillBroken` | The fix itself. |
| `related` | Slugs of other fixes to link at the bottom. |
| `affiliate` | `null`, or `{ "text": "...", "url": "..." }` for a product link. |

Run `npm run build`. It will stop and tell you if a fix is missing a required field.

**Before publishing, test every step yourself.** Accuracy is the whole product.

## Put it online free (Cloudflare Pages)

1. Create a free GitHub account and upload this folder as a new repository.
2. Create a free Cloudflare account → Workers & Pages → Create → Pages → Connect to Git.
3. Pick the repository. Build command: `node build.js`. Output directory: `dist`.
4. Deploy. You get a free `*.pages.dev` address right away.
5. Once you buy a domain, add it under the project's Custom domains, and update `url` in `site.config.json`.

After that, every change you push to GitHub rebuilds the site automatically.

## Before launch checklist

- [ ] Final name chosen and domain bought
- [ ] `site.config.json` updated (url, bookingUrl, bookingPrice)
- [ ] Booking page created (Cal.com or Calendly free tier)
- [ ] Amazon Associates account; replace `YOUR-AFFILIATE-TAG` in fixes
- [ ] 30+ fixes written and personally tested
- [ ] Site submitted to Google Search Console with `sitemap.xml`

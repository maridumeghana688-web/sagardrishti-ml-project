# SAGARDRISHTI Landing — Asset Sources & Licenses

All landing-page imagery is stored locally under
`frontend/public/assets/maritime/` (never hotlinked). No image is presented
as live data, and no location is claimed that its source does not state.

## License summary

- **Unsplash License** (all `Used` rows below): free to use for commercial
  and non-commercial purposes, no permission or attribution required.
  Photographers are credited voluntarily in the table and in the site
  footer note. Source: https://unsplash.com/license and per-photo
  “Free to use under the Unsplash License” statements on unsplash.com.
- Real company liveries visible incidentally in documentary photography
  (e.g. MAERSK, EVERGREEN, Hamburg Süd) are editorial content; SAGARDRISHTI
  claims no affiliation. No logos were created or altered.

## Used assets (5)

| Asset | Source | URL | Creator | License | Usage |
|---|---|---|---|---|---|
| `ocean/ocean-calm.jpg` | Unsplash | https://unsplash.com/photos/LavEygj4EXk | Mariola Grobelska (@mariolagr) | Unsplash License | Acts 1–3 environment (open sea) |
| `vessels/vessel-cutout.webp` | Unsplash | https://unsplash.com/photos/WqZwkrBuZIE | Mika Baumeister | Unsplash License | THE protagonist layer (all acts). Isolated locally (rembg isnet-general-use + cleanup, mirrored for rightward travel); source frame preserved at `asset-sources/harbor-entry-source.jpg` (not shipped) |
| `ports/terminal-day.jpg` | Unsplash | https://unsplash.com/photos/mk8iOzSn2eI | Unsplash contributor | Unsplash License | Acts 4–7 environment (one consistent terminal; congestion shown additively) |
| `ports/yard-aerial.jpg` | Unsplash | https://unsplash.com/photos/37mW7MvAOvU | Daniel Miksha (Port of Vancouver) | Unsplash License | Act 7 intelligence context (dimmed radial reveal) |
| `ocean/horizon.jpg` | Unsplash | https://unsplash.com/photos/Pll28JZFaT8 | Unsplash contributor | Unsplash License | Acts 8–9 calm sea + finale (return to ocean language) |

## Researched but rejected

| Candidate | Reason rejected |
|---|---|
| `vessels/vessel-sea.jpg` (Blake Wisz, Unsplash) | Downloaded, then rejected: vessel tiny in hazy white-out frame; fails the 35–65% protagonist rule. Deleted. |
| `ports/terminal-tokyo.jpg` — Shinagawa Terminal (Unsplash) | Good image, unused; terminal-day + port-busy cover the port story. Deleted to keep bundle lean. |
| `ocean/waves-aerial.jpg` (Unsplash) | Good texture but 1.9 MB and no chapter needed it. Deleted. |
| Getty Images / iStock (various aerial port + video) | Paid license required — excluded. |
| Dreamstime dusk port aerial | Paid license required — excluded. |
| Adobe Stock JNPT aerial video | Paid license required — excluded; no freely-licensed JNPT aerial located. No photo is captioned as an Indian port unless its source states it. |
| Cruise-ship bow photo (Unsplash) | Wrong vessel type (passenger, not container). |
| Night oil-tanker photo (Unsplash) | Wrong vessel type + night mood breaks the daylight arc. |
| wallscloud.net wallpaper | Unclear license/attribution chain — excluded. |
| `vessels/harbor-sunset.jpg` (Ensenada, MX) | Rejected after download: leisure sailboat dominates the foreground — wrong vessel story. Deleted. |
| `vessels/finale-sea.jpg` (Hennie Stander, Cape Town) | Rejected after download: heavy funnel-smoke plume reads as distress — wrong emotional note. Deleted. |
| `vessels/vessel-aerial.jpg`, `vessels/vessel-sunset.jpg`, `ports/cranes-loading.jpg`, `ports/port-busy.jpg` | Retired in emergency rebuild: one continuous environment replaces the photo slideshow (docs/LANDING_PAGE_PLAN.md). Deleted from public/. |

## Adding future assets

1. Prefer Unsplash / Pexels / Pixabay / Wikimedia Commons with clear terms.
2. Download the file into the matching `assets/maritime/` subfolder.
3. Add a row to the table above (asset, source, URL, creator, license, usage).
4. Reference it from `frontend/src/landing/data/maritimeContent.js`.
5. Never hotlink remote images in production markup.

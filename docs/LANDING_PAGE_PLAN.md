# SAGARDRISHTI Landing — Design Plan (Emergency Rebuild)

Status: the photo-slideshow implementation is a FAILED VISUAL PROTOTYPE and
is deleted by this plan. Routing (`/`, `/login`, `/dashboard`, `/status`),
backend wiring, Lenis/GSAP stack and the canvas viz engine are preserved;
the landing visual concept is replaced.

## 1. Storyboard — ONE CONTINUOUS VOYAGE

A single fixed camera stage plays the whole film. Scroll position is the
playhead (one master GSAP timeline, 0–100%). Nothing ever "slides":

| Scroll | Camera / vessel | Environment | Data / type |
|---|---|---|---|
| 0% | Wide ocean; vessel distant center | Open sea plate | INDIAN MARITIME INTELLIGENCE / SAGARDRISHTI (present, breathing) |
| 10–20% | Camera pushes toward vessel; vessel grows 0.35→0.8 | Ocean | EVERY MOVEMENT CREATES DATA (grows 0.72→1.3) |
| 25–32% | Vessel dominant, slight drift right | Ocean | AIS annotations attach (position/speed/heading/type); POSITION. SPEED. HEADING. TIME. → EVERY MOVEMENT LEAVES A SIGNAL. |
| 35–42% | Camera keeps travelling forward | MASKED WIPE: harbor horizon rises ahead (same travel direction) | Thin route trace extends from bow |
| 42–52% | Vessel sails right toward the port mass | Port plate wipes in behind vessel; vessel never replaced | THEN THE VESSEL MEETS THE PORT. |
| 55–65% | Vessel slows near berth; extra AIS blips drift in | Same terminal, warm grade creeps in (tint, not a new photo) | Density/heat overlay grows; metric instrument bar fades in |
| 65–72% | Hold on congested water | Heat blooms peak (amber/red zones only) | WE DON'T JUST SEE THE WAIT. → WE ANALYZE WHAT IS BEHIND IT. |
| 74–82% | Vessel settles; scene dims to working blue | RADIAL MASK: yard-aerial context fades in behind data | 6 streams converge → SAGARDRISHTI node → pipeline; clusters/risk-zone/curve visualize ML |
| 82–88% | Same berth, route overlay draws | Terminal plate returns | PORT A HIGH 8.4h vs ALTERNATIVE WINDOW; operator-decides chain |
| 88–94% | Vessel resumes, frame calms | Calm-sea plate wipes in; vessel centered | BEFORE/AFTER (illustrative) → BETTER VISIBILITY / EARLIER INSIGHT / MORE INFORMED DECISIONS |
| 94–100% | Vessel rests small-center; type takes over | Ocean language returns | THE OCEAN GENERATES THE DATA. / WE TURN IT INTO INTELLIGENCE. / ENTER + EXPLORE |

Continuity devices: vessel never unmounts; environments change only by
masked wipe travelling WITH the direction of motion; a persistent voyage
trail connects all beats; the rail (01 OCEAN…08 OUTCOME) tracks playhead.

## 2. Section-by-section visual composition (layers)

Every moment composites three layers, all inside one fixed stage:

- **BACKGROUND** — one environment plate at a time (ocean → terminal →
  yard → calm sea), full-bleed, slow push (scale 1→1.12) + lateral drift.
- **MIDGROUND** — the ONE vessel cutout (isolated Evergreen bow
  three-quarter), drop-shadowed onto water; scale/translate keyframed
  0.35 (distant) → 1.35 (dominant) → 0.9 (berth) → 0.7 (finale rest).
- **FOREGROUND** — typography (one idea at a time), AIS tags with leader
  lines pinned to vessel coordinates, canvas data overlays, heat, routes.

No chapter owns a photo. No rectangles float over rectangles: the vessel
is a true alpha cutout; environments meet edge-to-edge via wipes.

## 3. Asset list (final, minimal)

| Asset | Role | Source / license |
|---|---|---|
| `vessel-cutout.webp` (1400px alpha WebP, 374 KB, bow faces travel direction) | THE protagonist, all acts | Unsplash Mika Baumeister, Unsplash License; isolated locally with rembg isnet-general-use + artifact cleanup (mirrored for rightward travel; livery micro-text mirrored as accepted trade-off) |
| `ocean-calm.jpg` | Acts 1–3 environment | Unsplash Mariola Grobelska, Unsplash License |
| `terminal-day.jpg` | Acts 4–7 environment (graded warm for congestion) | Unsplash contributor, Unsplash License |
| `yard-aerial.jpg` | Act 7 intelligence context (dimmed) | Unsplash Daniel Miksha, Unsplash License |
| `horizon.jpg` | Acts 8–9 calm sea + finale | Unsplash contributor, Unsplash License |
| harbor-entry.jpg source | Cutout provenance only (NOT shipped in public/) | same as cutout |

Retired from public/: vessel-aerial, vessel-sunset, port-busy,
cranes-loading (kept in docs table as rejected-for-continuity).

## 4. Vessel strategy

ONE cutout persists for the whole film (same pixels = same identity).
Motion is transform-only (scale/translate/rotate ±2°) — no teleporting:
keyframes ease across the full timeline. Drop shadow + waterline foam
streak anchor it. AIS tags track vessel-relative anchor points. Mobile:
same layer, smaller keyframes, fewer overlays.

## 5. Port strategy

ONE terminal photograph = one geographical place. Congestion is shown by
ADDITIVE layers (AIS density, heat blooms, warm grade tint, metric
instrument bar) — never by swapping to a different port photo. The yard
aerial appears once, dimmed, as the "analysis room" behind the data.

## 6. Scroll choreography (master timeline)

One `gsap.timeline({ scrollTrigger: { trigger: '#voyage', start: 'top
top', end: 'bottom bottom', scrub: 1 } })` over a ~1400vh scroll track.
All layer tweens (vessel, plates, wipes, overlays, type, rail) live on
this timeline at absolute positions. Lenis drives ScrollTrigger via the
standard ticker integration. Reduced motion: timeline discarded; a static
semantic article (hero + chapters text + one image) renders instead.

## 7. Typography choreography

Every headline is a timeline tween, never a fade-in: scale 0.72 → 1.0 →
1.30–1.50 with y/letter-spacing/opacity/clip movement, overlapping so the
outgoing line hands off to the incoming line. One dominant idea per
moment; metadata stays 9–11px uppercase. No card walls: only three slim
instruments survive (congestion bar, option pair, comparison pair).

## 8. Data-visualization strategy

Reuse the canvas engine (trails, weather cells, currents, ports, heat,
clusters, routes) composited over the continuous scene, density keyed to
playhead. ML = clusters converging + risk zone + prediction curve drawn
over the yard context + pipeline strip. All values illustrative-labeled.
No neon, no HUD chrome: navy/cyan ink, amber/red reserved for risk zones.

## 9. Mobile fallback

Same film, gentler: vessel keyframes scaled to viewport, canvas density
halved (width check), type clamp()’d, chapter copy identical, rail
hidden, nav condensed. No horizontal overflow (overflow-x clip + probe).

## 10. Performance strategy

5 images total (~2.5 MB, lazy below fold, hero eager+preloaded); one
canvas overlay at a time (canvas per act toggled by visibility);
transform-only animation; DPR capped 1.5 (1 on mobile); GSAP context
cleanup on unmount; no WebGL, no video, single 337 kB-ish JS bundle.

## 11. Acceptance mapping

Single vessel (§3-4) · scroll-driven vessel+camera (§6) · port emerges by
wipe (§5) · density/heat build (§8 congestion) · AIS+WX+ocean+port layers
(§8) · visual ML (§8) · decision-support wording (§storyboard 82–88%) ·
no autonomy claims · growing type (§7) · minimal cards (§7) · labeled rail
· mobile/reduced-motion fallbacks (§9) · licensed local assets (§3) ·
no console errors (smoke).

# LIFECOUNT

**See your time. Use it well.**

A personal life-time visualization dashboard. LIFECOUNT is not a death
predictor — it visualizes a *life horizon* you choose (a planning
assumption, not a forecast) and shows, continuously and precisely, how
much of it has passed and how much remains.

## Stack

Pure **HTML5 + CSS3 + vanilla JavaScript**. No frameworks, no build
step, no backend, no network calls, no analytics. Open `index.html` in
any modern browser and it works.

```
LIFECOUNT/
├── index.html   — markup for onboarding, app shell, all 7 views, modals
├── style.css    — dark-by-default monochrome design system, responsive
├── script.js    — date engine, storage, rendering, timers
└── README.md
```

## Getting started

Just open `index.html`. No install, no server required (though any
static file server works too, e.g. `python3 -m http.server`).

On first run you'll see onboarding: date of birth, a life horizon
(60/70/80/90/custom years), and an optional display name. After that,
your profile lives in this browser's `localStorage` and you're taken
straight to the dashboard on future visits.

## Views

- **Dashboard** — current age, a life-progress ring, the live
  countdown to your horizon, four at-a-glance stat cards, and a large
  progress bar.
- **Life Clock** — a dedicated, centered live countdown with
  seconds-lived / seconds-remaining / total horizon / progress.
- **Timeline** — a horizontal map of standard life ages (18, 21, 25,
  30, 40, 50, 60...) plotted against your actual birth date, with
  "Now" positioned chronologically among them.
- **Perspective** — your chosen horizon, time lived, and time
  remaining, each broken into years/months/weeks/days/hours/minutes/
  seconds — plus "Life as a year," a compressed-calendar visualization
  of where you currently sit.
- **Goals** — lightweight goal cards with a title, progress percentage,
  and optional target date. Stored in `localStorage`.
- **Milestones** — personal dated milestones with a description,
  automatically labeled `COMPLETED` or `N DAYS REMAINING`.
- **Settings** — edit your profile, or reset LIFECOUNT entirely
  (deletes profile, goals, and milestones from this browser).

## The date engine

Two kinds of math are used deliberately, and never mixed up:

- **Exact math** (live countdowns, seconds/hours lived or remaining):
  real millisecond timestamps — `horizon.getTime() - Date.now()`, then
  converted to days/hours/minutes/seconds. Never assumes a fixed
  day length beyond real elapsed milliseconds.
- **Calendar-aware math** (current age, "N years M months D days",
  calendar months between two dates): computed from actual
  year/month/day components, borrowing from the real length of the
  preceding month when needed — never "1 month = 30 days."

Adding years to a date (e.g. birth date + horizon) is leap-year safe:
a February 29 birthday lands on February 29 in a future leap year, and
clamps to February 28 in a future non-leap year, rather than silently
overflowing into March via native `Date` rollover.

If the current time has passed the chosen horizon, remaining time
displays as `0` (never negative) and progress caps at `100%`.

## Data & privacy

Everything is stored client-side in `localStorage`, under these keys:

- `lifecountProfile` — `{ name, dob, horizonMode, horizonYears }`
- `lifecountGoals` — array of goal objects
- `lifecountMilestones` — array of milestone objects
- `lifecountTheme` — `"dark"` or `"light"`

Nothing is sent anywhere. Resetting from Settings clears all four.

## Future direction (not implemented in V1)

The codebase is organized so later versions can extend it without a
rewrite: a richer visual layer (V2), deeper analytics (V3), expanded
goal/planning tools (V4), an installable PWA wrapper (V5), and
optional account/cloud sync (V6+). V1 intentionally ships with none of
that — no backend, no auth, no external APIs, no dependencies.

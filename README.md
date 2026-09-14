# Fortune Meadows Welfare Association — PWA

React + Vite + vite-plugin-pwa (installable, works offline). Same Supabase
project and Vercel account as the other HHAppSolutions sites; every table and
the storage bucket are prefixed `fmwa_` / `fmwa`.

    npm run dev        # http://localhost:5173
    npm run build      # -> dist/
    npm run preview    # test the service worker (it only runs on a build)

## Two designs

| Route | Direction |
|---|---|
| `/`  | **Design A** — cropped cinematic gate, cream + canopy green, Instrument Serif, staggered festival cards |
| `/b` | **Design B** — the whole banner framed and uncropped, condensed poster type, full-width colour-blocked festival panels |

Each header has a button to the other one. When you pick a winner: delete the
losing folder under `src/designs/`, drop its two routes from `src/main.jsx`,
and point `/` at the survivor.

## Content

`src/data/events.js` holds the three festivals and ships in the bundle, so the
site renders instantly and offline. `useEvents()` then overlays whatever is in
Supabase; if an event there has no photo rows yet, the bundled photos stay.
Nothing else in the app reads event storage.

Photos live in `public/assets/` for now (`id-*`, `krishnashtami-*`, `ganesh-*`).

## Supabase

Run `supabase-setup.sql` in Studio → SQL Editor, then follow the three steps at
the top of that file. It creates:

- `fmwa_events`, `fmwa_photos` — public read, writes limited to the `fmwa_admin`
  Postgres role
- storage bucket `fmwa` — public read, admin write, for gallery uploads

Then run `supabase-timetable.sql` and follow its three steps. It adds:

- `fmwa_event_days`, `fmwa_programs` — the day-by-day programme for an event.
  Public read only when the parent event has `timetable_published = true`.
- `fmwa_event_editors` — which committee user may edit which event.
- the `fmwa_committee` Postgres role, which can write timetables for its
  assigned events and flip `fmwa_events.timetable_published`, and nothing else.
  The restriction to that one column is a Postgres column-level grant, not a
  UI convention.

## Admin (next)

Not built yet. The seams are in place: sign in as `admin@fortunemeadows.local`,
switch PostgREST into `fmwa_admin` via the JWT, write `fmwa_events` /
`fmwa_photos`, and upload images to the `fmwa` bucket. The public site picks the
changes up on next load with no rebuild.

## Deploy

`vercel.json` rewrites everything to `index.html` so the client-side routes
(`/event/:slug`, `/b/event/:slug`) survive a refresh.

# Case study: Seattle Neighborhood Pulse

A civic dashboard that turns 2.5 million City of Seattle service requests into something a resident can explore by place, type and time, without the numbers ever saying more than the data supports.

Built as an exercise in agentic development with Claude Code. The workflow was: reconnaissance against the live APIs first, then small pull requests, each verified by tests, CI and a scripted headless browser before review.

## The problem

Seattle publishes every Find It, Fix It and Customer Service request as open data, but a 2.5-million-row table answers none of the questions residents actually ask:

- What gets reported, and where?
- Is my neighborhood unusual?
- Is it getting better or worse?
- How quickly does the City respond?

The goal was a dashboard that answers those questions, and is explicit about what each number covers.

## Investigating the data before designing anything

Every design decision traces back to something measured against the live API:

| Finding | Consequence |
| --- | --- |
| 2,530,877 rows since 2013, refreshed once a day | Never download raw rows. Aggregate server-side and cache for 15 minutes. |
| `createddate` has no timezone (Seattle local time) | Treat dates as calendar days; never pass them through the browser's timezone. |
| No resolution timestamp, only current status | The main dataset can't support time-to-close. Response times come only from a separate tracking dataset. |
| Tracking dataset (`43nw-pkdq`) covers just 5 request types, with day-precision dates | Response times are limited to those 5 types, in whole days, and labelled as such. |
| Type names differ between the datasets ("Graffiti Report" vs "Graffiti") | The mapping was verified by joining 1,000 shared request numbers (997 matched, 1:1 per type) rather than assumed. |
| 53 Community Reporting Areas; the City's boundary layer has 2020 Census population | Names matched 53 of 53; the population sums to 737,015, Seattle's official 2020 count. |
| Some areas have very few residents (Georgetown: 1,457) | Per-capita rankings exclude areas under 5,000 residents and say why. |
| ~1.2% of recent requests lack coordinates | They're counted but never placed on the map; no location is ever guessed. |
| The current day is always incomplete (published once daily) | Date presets end yesterday, so the trend line doesn't show a false cliff. |

## Key decisions

**1. Every number has a stated scope.** Counts, trends, breakdowns, the density layer and the neighborhood shading are server-side aggregates over *all* matching requests. Map markers and the recent list are a labelled sample of the newest 2,000. The UI never compares a sample with a total without saying so.

**2. Aggregate, don't download.** Each filter change runs ten SoQL queries in parallel:
- facet counts per dimension, each ignoring its own filter so the chart can show the alternatives;
- daily counts, rolled up into days, weeks or months;
- a `snap_to_grid` density grid;
- the newest 2,000 rows;
- previous-period facets for the change indicators.

The browser receives about 76 KB gzipped. Tests check that the facets and the time series sum to the same total.

**3. Comparisons that don't mislead.**
- Per-capita rates use 2020 Census population, and low-population areas are listed separately.
- Period-over-period change compares equal-length windows with identical filters, and switches from percentages to absolute numbers when the base is under 20.
- Changes use neutral arrows rather than red/green, because more reports isn't necessarily worse.

**4. Response times measured on a fair cohort.** "Median days to close" computed naively over recent requests is biased: the slow ones haven't closed yet. The panel instead uses a single cohort of requests that have all had 30 days to close. If the selected range is too recent, it shifts back to the latest period of the same length that qualifies, and says so. Never-closed requests stay in the denominator. "Closed" is described as the City's status, not proof of a fix.

**5. Boring, maintainable infrastructure.** One Next.js app, two route handlers, an in-process cache, static reference data with the script that regenerates it, and no database.

## Bugs caught by verification

Each of these passed type checking and unit tests. They were found by checking real responses and driving the app in headless Chrome:

1. **Blank map.** MapLibre's unlayered stylesheet forces `position: relative` on the map container, which beat Tailwind's layered `absolute inset-0`. The container collapsed to 0px high.
2. **The map never loaded under the bundler.** MapLibre 6 loads its web worker relative to its own module URL, which the bundler relocates. Fixed by copying the worker into `public/` at build time and calling `setWorkerUrl()`.
3. **Every upstream error reported as "internal".** Errors thrown inside Next's `'use cache'` are serialized and lose their class, so timeouts and rate limits couldn't be told apart. Replaced with a small TTL cache that also de-duplicates concurrent requests and never caches failures.
4. **Timeouts reported as network failures in tests.** In jsdom, `DOMException` isn't an `Error` subclass, so the check now looks at the error's name.
5. **A false cliff in the trend.** The default range ended today, which only had 9 records so far.
6. **Partial weeks read as drops.** A 12-month range ends mid-week, so clipped buckets are now drawn dashed and labelled.
7. **The selected request was invisible** when it sat inside a cluster. It now has its own unclustered layer.
8. **783 KB API responses.** `next start` doesn't compress route handler responses; gzipping in the route brought them to 76 KB.
9. **Response-time columns contradicted each other.** The first version used separate cohorts for the 7- and 30-day columns, and graffiti showed 69% closed within 7 days but only 65% within 30. A single cohort makes the two columns consistent by construction.
10. **114 px of horizontal scroll on phones** from two toggle groups in a non-shrinking header.
11. **A properly escaped filter value still rejected.** Socrata's firewall blocks some SQL-like strings even when escaped; the API now reports this as a clear "rejected" error.
12. **A table keyboard users couldn't scroll.** Re-running axe-core after adding the response-times table found its horizontal scroller couldn't be reached by keyboard at phone width. It's now a focusable, labelled region.

Numbers were also cross-checked against independent Socrata queries:
- the previous-period total (30,952) and Ballard's count (1,311);
- the August 2026 response-time cohort for all five types, computed by hand.

## Results

- **Analytics:** a map with neighborhood shading by count or per-capita rate, density, and clustered requests; trends; type, status and area breakdowns that double as filters; period-over-period change; response times for five types.
- **Reproducible setup:** `npm ci && npm run dev`, with no keys required.
- **Tests:** more than 100 automated tests, including real API responses captured as fixtures.
- **Quality gates:** CI runs typecheck, lint, tests and a production build on every PR; branch protection blocks merging unless it passes.
- **Accessibility:** axe-core WCAG 2.1 AA, 0 violations, at desktop and mobile widths.

## What I'd do next

- Normalize by something closer to exposure than residents, such as daytime population or road length, for commercial districts.
- Show which statuses close each tracked type (duplicate vs completed), to separate "the City responded" from "the problem was fixed".
- Use a shared cache such as Vercel KV if traffic grows, since the in-process cache is per instance.

# Family Planner

Family Planner is a responsive HTML5 web app (desktop, tablet and mobile) for organizing a family's appointments and events throughout the year, from January to December.

After signing in, the user sees a three-column layout based on SAP Fiori's Flexible Column Layout:

1. **Left column:** full-year calendar.
2. **Middle column:** hourly view of the selected day.
3. **Right column:** activity details: name, description, date, start and end time, attendees and companion.

The layout adapts to the screen size and shows fewer columns on smaller devices.

**Live app:** https://acsxe.github.io/family-planner/ (GitHub Pages).

Sign-in and data are handled by [Supabase](https://supabase.com): users sign in with Supabase Auth and activities are stored in a Postgres table. The agenda is shared by the family: every user sees every activity, but only the person who created an activity can edit or delete it (enforced by the database, see `supabase/schema.sql`). Activities created by someone else open read-only, with a "Creada por …" notice.

## Structure

```
login.html                 Login page. On success it navigates to index.html
index.html                 App shell: top bar, user menu, side navigation and the area where screens load
views/
  planner.html             Calendario screen (Flexible Column Layout)
  reports.html             Informes screen: one card per report
  report-activity.html     Informe de actividad: List Report (filter bar + results table)
css/
  base.css                 Design tokens, typography, buttons, form fields and errors, colour dot, multi-select, panel header
  login.css                Login page only
  shell.css                Top bar, user menu, side navigation, toasts
  views/planner.css        Calendario screen only
  views/reports.css        Informes screen only
  views/report-activity.css  Informe de actividad only
js/
  config.js                Supabase project, family members, screens and the list of reports
  core/dom.js              Small DOM helpers
  core/supabase.js         Supabase client shared by the whole app (FP.db)
  core/session.js          Sign in, session check, user names and sign out (Supabase Auth)
  core/storage.js          Activities in Supabase: list, create, update, remove
  core/family.js           Family members and companion options shared by the screens
  core/time.js             Time and date helpers shared by the screens
  core/multiselect.js      Multi-select dropdown with checkboxes (styles in base.css)
  core/router.js           Loads each screen's HTML, CSS and JS when it is opened
  login.js                 Login page logic
  shell.js                 Side navigation, user menu and toasts
  views/planner.js         Calendario screen logic
  views/reports.js         Informes screen logic (builds the report cards)
  views/report-activity.js Informe de actividad: filters, results and "Mostrar más"
  vendor/                  Third-party libraries (supabase-js 2.118.0, MIT) — see js/vendor/README.md
supabase/
  schema.sql               Database tables and access rules; run it in the Supabase SQL Editor
tools/
  build_artifact.py        Builds the copy published as a Claude artifact (see below)
```

Screens are loaded inside `index.html` by `js/core/router.js` when they are picked in the side navigation (`#planner`, `#reports`) or opened from a report card (`#report-activity`). A screen is loaded once and then hidden and shown, so it keeps its state when you come back to it.

### Adding a screen

1. Create `views/<id>.html`. Mark the screen's root element with the `data-view-root` attribute.
2. Create `css/views/<id>.css` and `js/views/<id>.js`. The script registers `FP.views.<id> = { mount(root), show(), hide() }`.
3. Add `{ id: '<id>', label: '…', icon: '<icon id>' }` to `views` in `js/config.js`. The icon is a `<symbol>` in the icon block of `index.html`.

### Shared code

Logic or styles used by more than one screen go to `js/core/` and `css/base.css`, not into a screen's own files. For example, the companion options (`FP.family.companionOptions`) feed both the Calendario form and the Informe de actividad filter.

### Colours and form fields

- Buttons use `--action` (currently the app blue, `--primary`): filled buttons on that background, outline and icon buttons in that colour. Destructive actions (Eliminar) stay red. Changing `--action` in `css/base.css` recolours every button.
- Field labels, field values, dropdowns and table column headers share one size, `--field-font-size` (13px), in the text colour; placeholders stay grey.

### Adding a report

1. Create the report screen as above (`views/report-<name>.html`, its CSS and JS).
2. Add `{ id: 'report-<name>', parent: 'reports' }` to `views` in `js/config.js`: it gets no side navigation entry, and "Informes" stays highlighted while it is open.
3. Add `{ view: 'report-<name>', title: '…', description: '…', icon: '<icon id>' }` to `reports` in `js/config.js`: its card appears on the Informes screen, in that order.

## Supabase setup

1. Create a Supabase project and put its URL and **publishable** key in `supabase` in `js/config.js`. The publishable key is meant to be public; never put the `service_role` key in this repository.
2. In **Authentication → Users**, create the family's users (email and password, "Auto Confirm User" ticked).
3. In **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**, so nobody else can create an account.
4. Run `supabase/schema.sql` in the **SQL Editor**. It creates the `activities` and `profiles` tables and their access rules; its last statement stores each user's display name (edit the emails and names there for other users). It can be run again safely.

## Run

Screens are loaded with `fetch`, so the app must be served over HTTP (opening the files directly with a double click does not work):

```bash
python3 -m http.server
```

Then open `http://localhost:8000/login.html`.

## Deploy

GitHub Pages serves the `main` branch as is (no build step): every push to `main` updates https://acsxe.github.io/family-planner/. `.nojekyll` tells GitHub Pages to publish the files without processing them.

## Informe de actividad

A List Report: a collapsible filter bar above a results table.

- Filters combine with AND; an empty filter does not restrict.
- **Nombre actividad**: the name contains the text, ignoring case and accents (`med` finds "Médico").
- **Hora inicio / Hora fin** form one time-range filter: activities that take place, even partly, inside the range.
- **Asistente** and **Acompañante** are multi-selects with checkboxes; values ticked in the same filter combine with OR (Acompañante "Alberto" also finds activities accompanied by "Alberto y Laura"). Ticked values show as tokens in the field, with "+N" when they do not fit.
- Results show 20 rows at a time; "Mostrar más" adds the next 20.
- Long values are cut at the last space before 20 characters (Nombre actividad) or 40 (Descripción actividad) and end with "..."; the full text shows on hover.

## Publishing as a Claude artifact

The Claude artifact viewer blocks connections to other servers, so the artifact cannot reach Supabase: the artifact published before the Supabase integration stays as a browser-only demo, and the real app is the GitHub Pages one. The tool below is kept for that demo.

The artifact viewer wraps the entry page in its own document, so `index.html` is published without its `<!doctype>`, `<head>` and `<body>` tags. Generate that copy with:

```bash
python3 tools/build_artifact.py <output-folder>
```

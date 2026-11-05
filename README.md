# Family Planner

Family Planner is a responsive HTML5 web app (desktop, tablet and mobile) for organizing a family's appointments and events throughout the year, from January to December.

After signing in, the user sees a three-column layout based on SAP Fiori's Flexible Column Layout:

1. **Left column:** full-year calendar.
2. **Middle column:** hourly view of the selected day.
3. **Right column:** activity details: name, description, date, start and end time, attendees and companion.

The layout adapts to the screen size and shows fewer columns on smaller devices.

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
  config.js                Users, family members, screens and the list of reports
  core/dom.js              Small DOM helpers
  core/session.js          Sign in, session check and sign out
  core/storage.js          Activities stored in localStorage
  core/family.js           Family members and companion options shared by the screens
  core/time.js             Time and date helpers shared by the screens
  core/multiselect.js      Multi-select dropdown with checkboxes (styles in base.css)
  core/router.js           Loads each screen's HTML, CSS and JS when it is opened
  login.js                 Login page logic
  shell.js                 Side navigation, user menu and toasts
  views/planner.js         Calendario screen logic
  views/reports.js         Informes screen logic (builds the report cards)
  views/report-activity.js Informe de actividad: filters, results and "Mostrar más"
tools/
  build_artifact.py        Builds the copy published as a Claude artifact
```

Screens are loaded inside `index.html` by `js/core/router.js` when they are picked in the side navigation (`#planner`, `#reports`) or opened from a report card (`#report-activity`). A screen is loaded once and then hidden and shown, so it keeps its state when you come back to it.

### Adding a screen

1. Create `views/<id>.html`. Mark the screen's root element with the `data-view-root` attribute.
2. Create `css/views/<id>.css` and `js/views/<id>.js`. The script registers `FP.views.<id> = { mount(root), show(), hide() }`.
3. Add `{ id: '<id>', label: '…', icon: '<icon id>' }` to `views` in `js/config.js`. The icon is a `<symbol>` in the icon block of `index.html`.

### Shared code

Logic or styles used by more than one screen go to `js/core/` and `css/base.css`, not into a screen's own files. For example, the companion options (`FP.family.companionOptions`) feed both the Calendario form and the Informe de actividad filter.

### Adding a report

1. Create the report screen as above (`views/report-<name>.html`, its CSS and JS).
2. Add `{ id: 'report-<name>', parent: 'reports' }` to `views` in `js/config.js`: it gets no side navigation entry, and "Informes" stays highlighted while it is open.
3. Add `{ view: 'report-<name>', title: '…', description: '…', icon: '<icon id>' }` to `reports` in `js/config.js`: its card appears on the Informes screen, in that order.

## Run

Screens are loaded with `fetch`, so the app must be served over HTTP (opening the files directly with a double click does not work):

```bash
python3 -m http.server
```

Then open `http://localhost:8000/login.html`.

Users are defined in `js/config.js`.

## Informe de actividad

A List Report: a collapsible filter bar above a results table.

- Filters combine with AND; an empty filter does not restrict.
- **Nombre actividad**: the name contains the text, ignoring case and accents (`med` finds "Médico").
- **Hora inicio / Hora fin** form one time-range filter: activities that take place, even partly, inside the range.
- **Asistente** and **Acompañante** are multi-selects with checkboxes; values ticked in the same filter combine with OR (Acompañante "Alberto" also finds activities accompanied by "Alberto y Laura"). Ticked values show as tokens in the field, with "+N" when they do not fit.
- Results show 20 rows at a time; "Mostrar más" adds the next 20.
- Long values are cut at the last space before 20 characters (Nombre actividad) or 40 (Descripción actividad) and end with "..."; the full text shows on hover.

> This is a proof of concept. The login is client-side only and activities are stored in the browser's `localStorage`: it is not secure and data is not shared between devices.

## Publishing as a Claude artifact

The artifact viewer wraps the entry page in its own document, so `index.html` is published without its `<!doctype>`, `<head>` and `<body>` tags. Generate that copy with:

```bash
python3 tools/build_artifact.py <output-folder>
```

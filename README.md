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
  report-activity.html     Informe de actividad (blank for now)
css/
  base.css                 Design tokens, typography, buttons, form fields, panel header
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
  core/router.js           Loads each screen's HTML, CSS and JS when it is opened
  login.js                 Login page logic
  shell.js                 Side navigation, user menu and toasts
  views/planner.js         Calendario screen logic
  views/reports.js         Informes screen logic (builds the report cards)
  views/report-activity.js Informe de actividad logic
tools/
  build_artifact.py        Builds the copy published as a Claude artifact
```

Screens are loaded inside `index.html` by `js/core/router.js` when they are picked in the side navigation (`#planner`, `#reports`) or opened from a report card (`#report-activity`). A screen is loaded once and then hidden and shown, so it keeps its state when you come back to it.

### Adding a screen

1. Create `views/<id>.html`. Mark the screen's root element with the `data-view-root` attribute.
2. Create `css/views/<id>.css` and `js/views/<id>.js`. The script registers `FP.views.<id> = { mount(root), show(), hide() }`.
3. Add `{ id: '<id>', label: '…', icon: '<icon id>' }` to `views` in `js/config.js`. The icon is a `<symbol>` in the icon block of `index.html`.

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

> This is a proof of concept. The login is client-side only and activities are stored in the browser's `localStorage`: it is not secure and data is not shared between devices.

## Publishing as a Claude artifact

The artifact viewer wraps the entry page in its own document, so `index.html` is published without its `<!doctype>`, `<head>` and `<body>` tags. Generate that copy with:

```bash
python3 tools/build_artifact.py <output-folder>
```

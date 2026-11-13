# Family Planner

Family Planner is a responsive HTML5 web app (desktop, tablet and mobile) for organizing a family's appointments and events throughout the year, from January to December.

After signing in, the user sees a three-column layout based on SAP Fiori's Flexible Column Layout:

1. **Left column:** full-year calendar.
2. **Middle column:** hourly view of the selected day.
3. **Right column:** activity details: name, description, date, start and end time, attendees and companion.

The layout adapts to the screen size and shows fewer columns on smaller devices.

**Live app:** https://acsxe.github.io/family-planner/ (GitHub Pages).

Sign-in and data are handled by [Supabase](https://supabase.com): users sign in with Supabase Auth and activities are stored in a Postgres table. The agenda is shared by the family: every user sees every activity, but only the person who created an activity can edit or delete it (enforced by the database, see `supabase/migrations/`). Activities created by someone else open read-only, with a "Creada por …" notice.

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
  features/leisure.css     "Ocio y Tiempo Libre" window
  views/planner.css        Calendario screen only
  views/reports.css        Informes screen only
  views/report-activity.css  Informe de actividad only
js/
  config.js                Supabase project, screens and the list of reports
  core/dom.js              Small DOM helpers
  core/guard.js            Loaded first in both pages: page paths (FP.pages) and an instant check of the stored session, so index.html goes to the login (and the login to the app) before anything is painted
  core/supabase.js         Supabase client shared by the whole app (FP.db)
  core/session.js          Sign in, session check, user names and sign out (Supabase Auth)
  core/storage.js          Activities in Supabase: list, create/update (save_activity), remove
  core/family.js           Family members (table family_members) and companion options shared by the screens
  core/time.js             Time and date helpers shared by the screens
  core/multiselect.js      Multi-select dropdown with checkboxes (styles in base.css)
  core/router.js           Loads each screen's HTML, CSS and JS when it is opened
  core/idle.js             Signs the user out after a period of inactivity (warning dialog first)
  login.js                 Login page logic
  shell.js                 Side navigation, user menu and toasts
  features/leisure.js      "Ocio y Tiempo Libre" window: plans for a day from the Madrid agenda
  views/planner.js         Calendario screen logic
  views/reports.js         Informes screen logic (builds the report cards)
  views/report-activity.js Informe de actividad: filters, results and "Mostrar más"
  vendor/                  Third-party libraries (supabase-js 2.118.0, MIT) — see js/vendor/README.md
tests/                     Automated tests (database, edge function and app): bash tests/run.sh — see tests/README.md
supabase/
  migrations/              Database changes, run in order in the Supabase SQL Editor
    001_initial_schema.sql   First version: activities and profiles (profiles is replaced by users in 002)
    002_family_members.sql   Family members with numeric member_id (keeps existing activities)
    003_weekly_digest.sql    Weekly e-mail: send log and the data for each e-mail
    004_user_formats.sql     Date, number and time formats per user (replaces locale)
    005_members_only_read.sql Only app users (rows in users) can read members and activities
    006_advisor_fixes.sql    Security Advisor fixes: rls_auto_enable() not callable, pg_net out of public
  functions/weekly-digest/ Edge function that sends the weekly e-mail through Resend
  functions/leisure-events/ Edge function that returns the Madrid agenda events of a day
  cron/weekly_digest_cron.sql  Calls the edge function every hour (pg_cron)
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
4. Run the files in `supabase/migrations/` in the **SQL Editor**, in order and once each. The family members and names are in those files. The user e-mails are not stored in this public repository: before running 001 and 002, replace `CORREO_DE_ALBERTO` and `CORREO_DE_LAURA` with each account's e-mail.

### Data model

`member_id` (a number) identifies a family member in every table:

| Table | Key | Contents |
|---|---|---|
| `family_members` | `member_id` | Everyone in the family: name, full name, colour, `can_accompany`, `needs_companion` |
| `users` | `member_id` | Family members who are users of the app (not the children): `user_id`, the only link to Supabase Auth |
| `user_settings` | `user_id` | Each user's own settings: weekly e-mail on/off, `language` (ISO 639-1, `es`), `date_format` (`DD/MM/YYYY`), `number_format` (`1.234,56`), `time_format` (`24h`), time zone. Created automatically for every user |
| `activities` | `activity_id` | Name, description, date, times and `created_by` (`member_id`) |
| `activity_attendees` | `activity_id` + `member_id` | One row per attendee |
| `activity_companions` | `activity_id` + `member_id` | One row per companion |

Access rules: signed-in users read the family members and all activities, and only their own row of `users`. Activities are created and changed only through the `save_activity()` function, which checks the rules (at least one attendee, a companion when Sergio or Pablo attend, only people with `can_accompany` as companions, only the creator can change it) and saves the activity, its attendees and companions in one go. Only the creator can delete an activity. Each user reads and changes only their own `user_settings` (by `user_id`). Deleting a user in Supabase removes their `users` row and settings, but keeps the family member and their activities.

## Run

Screens are loaded with `fetch`, so the app must be served over HTTP (opening the files directly with a double click does not work):

```bash
python3 -m http.server
```

Then open `http://localhost:8000/login.html`.

## Deploy

GitHub Pages serves the `main` branch as is (no build step): every push to `main` updates https://acsxe.github.io/family-planner/. `.nojekyll` tells GitHub Pages to publish the files without processing them.

## Weekly e-mail

Every Sunday from 9:00 (in each user's `user_settings.timezone`), users with `weekly_digest` on receive an e-mail with the activities of the coming week (Monday to Sunday), so they have time to organise themselves, in two lists: the ones they attend and the ones they accompany. Weeks without activities send nothing. It is sent with [Resend](https://resend.com) from `family_planner@notifications.acsex.es` (domain verified in Resend, DNS in DonDominio).

- `due_weekly_digests()` (migration 003) returns the e-mails that are due and their activities; `digest_log` records each one (sent, skipped or error) so none is sent twice, and a failed one is retried the next hour.
- The edge function `weekly-digest` builds the e-mail (HTML and plain text) and sends it. It only runs with the `x-cron-secret` header. For tests, its body accepts `{"member_id": 1, "week_of": "2026-11-16"}` (send that person's e-mail for the week of that date now, not logged) and `{"dry_run": true}` (return the e-mail instead of sending it).
- `supabase/cron/weekly_digest_cron.sql` calls the function every hour on Saturdays and Sundays (UTC).

Setup, once:
1. Run `supabase/migrations/003_weekly_digest.sql` in the SQL Editor.
2. **Edge Functions → Deploy a new function → Via editor**, name `weekly-digest`, paste `supabase/functions/weekly-digest/index.ts` and deploy. In its settings, turn off **Verify JWT** (the function checks `x-cron-secret` instead).
3. **Edge Functions → Secrets**: add `RESEND_API_KEY` (Resend key with sending access) and `CRON_SECRET` (a long random password).
4. Test it from the function's **Test** panel: header `x-cron-secret`, body `{"member_id": 1, "week_of": "2026-11-16"}`.
5. Store the same password in the Vault (`select vault.create_secret('…', 'weekly_digest_cron_secret');`) and run `supabase/cron/weekly_digest_cron.sql`.

## Ocio y Tiempo Libre

When creating an activity, the sparkle button next to the close (X) of the right column opens a window with leisure plans for the date in the form, taken from the open-data cultural agenda of the City of Madrid ([dataset 206974](https://datos.madrid.es/dataset/206974-0-agenda-eventos-culturales-100), about three months of events). It starts filtered to plans for children or families ("Para familias"), with "Todos" for the rest. "Usar este plan" copies the title, place, address, price, link and start time (one hour proposed) into the activity, which is then saved as usual.

- The browser never calls Madrid directly: the edge function `leisure-events` downloads the agenda (kept in memory for 3 hours, and the previous copy is used if Madrid does not answer), keeps the events held that day (weekdays and excluded days of long-running events included) and returns only what the window shows. It only answers signed-in users (the public anon key is not enough). Links are kept only if they point to madrid.es.
- Setup, once: **Edge Functions → Deploy a new function → Via editor**, name `leisure-events`, paste `supabase/functions/leisure-events/index.ts` and deploy, leaving **Verify JWT** on. No secrets needed.
- To remove the feature: delete `js/features/leisure.js`, `css/features/leisure.css`, their two lines in `index.html`, the button and window in `views/planner.html`, its block in `js/views/planner.js`, and the edge function.

## Loading screen

While `<html>` has the class `is-loading`, a loading screen (logo with a spinning ring and "Cargando…", styles in `css/base.css`) covers the page. `index.html` starts with it and `js/shell.js` removes it when the first screen has its data (`FP.router.start()` waits for the screen's `show()`). `login.html` shows it only when a session is already stored, while it moves on to the app.

## Tests

`bash tests/run.sh` creates a temporary PostgreSQL with all the migrations, serves the app locally and runs the database, edge function and browser tests (no connection to Supabase, no e-mails sent). Run it before uploading changes. Requirements and details in `tests/README.md`.

## Security

- Access rules live in the database (row level security): without a session nothing can be read; only app users read members and activities; only the creator can change or delete an activity, always through `save_activity()`; each user only sees their own settings.
- Both pages carry a Content Security Policy (`<meta http-equiv="Content-Security-Policy">`): scripts and styles only from the site itself, connections only to the site and the Supabase project. If the Supabase project changes, update its address there as well as in `js/config.js`.
- User text and agenda data are always inserted as text, never as HTML. No secrets in the repository: the Resend key and the cron password are Supabase secrets.

## Session timeout

After `idle.minutes` without using the app (clicks, taps, keys, mouse, scrolling), the session is closed and the login page shows "Tu sesión se ha cerrado por inactividad". Before that, a "¿Sigues ahí?" dialog counts down the last `idle.warningSeconds` (at most half of the time) with "Seguir conectado" and "Cerrar sesión". Time is measured against the clock, so a sleeping tab or a locked phone is signed out as soon as it comes back. Both values are in `js/config.js`.

## Activity detail (Calendario, right column)

| State | Fields | Header | Bottom right |
|---|---|---|---|
| Creating a new activity | editable | close (X) | Guardar |
| Viewing your own activity | locked | trash, close | Editar |
| Editing your own activity | editable | trash, close | Guardar |
| Viewing someone else's activity | locked, "Creada por …" notice | close | — |

- Guardar returns to the viewing state; the close button (X, or "‹ Día" on phones) closes the detail in any state.
- The trash turns red on the first click and deletes on the second; clicking elsewhere or Escape resets it.
- Leaving while creating or editing with unsaved changes (close, another activity, slot or day, Hoy, Escape) replaces the Guardar bar with "Tienes cambios sin guardar" and two equal-size buttons: **Descartar** drops the changes and continues; **Guardar** saves and continues (on a validation or connection error it stays in editing and shows the error). Clicking any field or Escape keeps editing.

## Informe de actividad

A List Report: a collapsible filter bar above a results table.

- Filters combine with AND; an empty filter does not restrict.
- **Nombre actividad**: the name contains the text, ignoring case and accents (`med` finds "Médico").
- **Hora inicio / Hora fin** form one time-range filter: activities that take place, even partly, inside the range.
- **Asistente** and **Acompañante** are multi-selects with checkboxes; values ticked in the same filter combine with OR (Acompañante "Alberto" also finds activities accompanied by "Alberto y Laura"). Ticked values show as tokens in the field, with "+N" when they do not fit.
- Results show 20 rows at a time; "Mostrar más" adds the next 20.
- Long values are cut at the last space before 20 characters (Nombre actividad) or 40 (Descripción actividad) and end with "..."; the full text shows on hover.

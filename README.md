# Family Planner

Family Planner is a responsive HTML5 web app (desktop, tablet and mobile) for organizing a family's appointments and events throughout the year, from January to December.

After signing in with a username and password, the user sees a three-column layout based on SAP Fiori's Flexible Column Layout:

1. **Left column:** full-year calendar.
2. **Middle column:** hourly view of the selected day.
3. **Right column:** activity details: name, description, date, start and end time, and attending family members.

The layout adapts to the screen size and shows fewer columns on smaller devices.

## Run

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server
```

Demo credentials (edit them in `js/config.js`): `familia` / `planner2026`.

> The login is client-side only and activities are stored in the browser's `localStorage`. It is not secure and data is not shared between devices.

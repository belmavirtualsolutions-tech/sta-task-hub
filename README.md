# STA Task Hub

This is a first internal-task MVP prototype for STA. It runs as a static browser app and stores sample data plus newly created tasks in `localStorage`.

Open `index.html` in a browser to try it, or run `npm run dev` and visit `http://127.0.0.1:4173`.

## Deploying

This project is ready for Vercel as a static site.

1. Push this folder to GitHub.
2. Import the GitHub repository in Vercel.
3. Use the default project settings. No build command is required.

## Included in this version

- Dashboard with open, due, blocked, and completed task counts
- Kanban board with status movement
- Project progress cards
- Task creation form
- Task updates feed
- Search across task name, project, owner, priority, and status
- Local persistence in the browser

## Good next build steps

- Add real sign-in and team roles
- Replace local browser storage with a PostgreSQL database
- Add attachments and activity history
- Add project templates
- Add email or WhatsApp notifications
- Add manager approval flows

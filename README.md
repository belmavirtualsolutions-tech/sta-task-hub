# STA Task Hub

This is a first internal-task MVP prototype for STA. It runs as a static browser app and stores shared tasks and updates in Supabase, with a local browser fallback if the database is temporarily unreachable.

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
- Shared Supabase persistence for tasks and updates
- STA red, black, and white visual palette

## Good next build steps

- Add real sign-in and team roles
- Add attachments and activity history
- Add project templates
- Add email or WhatsApp notifications
- Add manager approval flows
- Tighten Supabase policies after authentication is added

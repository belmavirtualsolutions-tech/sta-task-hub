# STA Task Hub

This is a first internal-task MVP prototype for STA. It runs as a static browser app and stores shared tasks and updates in Supabase, with a local browser fallback if the database is temporarily unreachable.

Open `index.html` in a browser to try it, or run `npm run dev` and visit `http://127.0.0.1:4173`.

## Deploying

This project is ready for Vercel as a static site.

1. Push this folder to GitHub.
2. Import the GitHub repository in Vercel.
3. Use the default project settings. No build command is required.

## Included in this version

- Email/password login and account creation through Supabase Auth
- Team member profiles with roles, departments, and invited/active status
- Admin invite form for adding STA teammates
- Project records with owners, departments, due dates, and health status
- Dashboard with open, due, blocked, and completed task counts
- Kanban board with status movement
- Project progress cards
- Rich task creation with blocker, approval, recurrence, estimate, tags, and dependency notes
- Task updates feed
- Search across task name, project, owner, priority, and status
- Shared Supabase persistence for tasks and updates
- Reports for approvals and blocked work
- Task template guidance
- STA red, black, and white visual palette

## Good next build steps

- Add attachments and activity history
- Convert template guidance into one-click generated tasks
- Add email or WhatsApp notifications
- Add manager approval actions
- Tighten Supabase policies so actions are restricted by role

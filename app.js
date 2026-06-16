const STORAGE_KEY = "sta-task-hub-state-v2";
const SESSION_KEY = "sta-task-hub-session";
const SUPABASE_URL = "https://awzskjknfelgdvyvkpui.supabase.co";
const SUPABASE_KEY = "sb_publishable_0hsnBkyRXUWQSiAyDRKYWA_q-0Y0740";

const defaultStatuses = ["To Do", "In Progress", "Review", "Done"];
const templates = [
  {
    name: "Weekly Department Update",
    detail: "Create a recurring weekly task for each department to post progress, risks, and next steps.",
  },
  {
    name: "Client Delivery Checklist",
    detail: "Use for onboarding tasks, account access, kickoff notes, approvals, and delivery blockers.",
  },
  {
    name: "Management Approval",
    detail: "Use when a task needs review before it can move into Done.",
  },
];

let state = loadLocalState();
let session = loadSession();

const views = {
  dashboard: document.querySelector("#dashboardView"),
  board: document.querySelector("#boardView"),
  projects: document.querySelector("#projectsView"),
  updates: document.querySelector("#updatesView"),
  team: document.querySelector("#teamView"),
  reports: document.querySelector("#reportsView"),
  admin: document.querySelector("#adminView"),
};

const viewTitle = document.querySelector("#viewTitle");
const searchInput = document.querySelector("#searchInput");
const taskModal = document.querySelector("#taskModal");
const authModal = document.querySelector("#authModal");
const projectModal = document.querySelector("#projectModal");
const inviteModal = document.querySelector("#inviteModal");

wireEvents();
render();
refreshWorkspace();

function defaultState() {
  return {
    projectFilter: "all",
    dataMode: "Loading shared workspace",
    tasks: [],
    projects: [],
    profiles: [],
    statuses: defaultStatuses,
  };
}

function loadLocalState() {
  try {
    return { ...defaultState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaultState();
  }
}

function saveLocalState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      projectFilter: state.projectFilter,
      dataMode: state.dataMode,
      tasks: state.tasks,
      projects: state.projects,
      profiles: state.profiles,
      statuses: state.statuses,
    })
  );
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(nextSession) {
  session = nextSession;
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
  renderSession();
}

function wireEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  searchInput.addEventListener("input", render);
  document.querySelector("#openTaskModal").addEventListener("click", openTaskModal);
  document.querySelector("#openAuthModal").addEventListener("click", () => authModal.showModal());
  document.querySelector("#openProjectModal").addEventListener("click", () => projectModal.showModal());
  document.querySelector("#openInviteModal").addEventListener("click", () => inviteModal.showModal());

  document.querySelector("#closeTaskModal").addEventListener("click", () => taskModal.close());
  document.querySelector("#cancelTask").addEventListener("click", () => taskModal.close());
  document.querySelector("#closeAuthModal").addEventListener("click", () => authModal.close());
  document.querySelector("#closeProjectModal").addEventListener("click", () => projectModal.close());
  document.querySelector("#cancelProject").addEventListener("click", () => projectModal.close());
  document.querySelector("#closeInviteModal").addEventListener("click", () => inviteModal.close());
  document.querySelector("#cancelInvite").addEventListener("click", () => inviteModal.close());

  document.querySelector("#taskForm").addEventListener("submit", submitTask);
  document.querySelector("#updateForm").addEventListener("submit", submitUpdate);
  document.querySelector("#projectForm").addEventListener("submit", submitProject);
  document.querySelector("#inviteForm").addEventListener("submit", submitInvite);
  document.querySelector("#authForm").addEventListener("submit", submitLogin);
  document.querySelector("#authSignup").addEventListener("click", submitSignup);
  document.querySelector("#statusForm").addEventListener("submit", submitStatus);
}

async function refreshWorkspace() {
  try {
    const [tasks, updates, projects, profiles, taskStatuses] = await Promise.all([
      dbRequest("/rest/v1/tasks?select=*&order=inserted_at.desc"),
      dbRequest("/rest/v1/task_updates?select=*&order=inserted_at.desc"),
      dbRequest("/rest/v1/projects?select=*&order=inserted_at.asc"),
      dbRequest("/rest/v1/profiles?select=*&order=inserted_at.asc"),
      dbRequest("/rest/v1/task_statuses?select=*&order=position.asc"),
    ]);

    const updatesByTask = updates.reduce((grouped, update) => {
      grouped[update.task_id] = grouped[update.task_id] || [];
      grouped[update.task_id].push({
        id: update.id,
        author: update.author,
        text: update.body,
        createdAt: formatTimestamp(update.inserted_at),
      });
      return grouped;
    }, {});

    state.projects = projects.map(mapProject);
    state.profiles = profiles.map(mapProfile);
    state.statuses = taskStatuses.map((status) => status.name);
    state.tasks = tasks.map((task) => mapTask(task, updatesByTask[task.id] || []));
    state.dataMode = "Shared Supabase workspace";
    saveLocalState();
    render();
  } catch (error) {
    state.dataMode = "Local backup mode";
    render();
  }
}

function mapTask(task, updates) {
  return {
    id: task.id,
    title: task.title,
    project: task.project,
    projectId: task.project_id,
    owner: task.owner,
    assigneeEmail: task.assignee_email || "",
    priority: task.priority,
    status: task.status,
    dueDate: task.due_date,
    department: task.department || "Operations",
    description: task.description || "",
    blocked: Boolean(task.blocked),
    approvalStatus: task.approval_status || "Not Required",
    recurrence: task.recurrence || "None",
    estimatedHours: Number(task.estimated_hours || 0),
    tags: task.tags || [],
    dependencyNote: task.dependency_note || "",
    updates,
  };
}

function mapProject(project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description || "",
    owner: project.owner,
    department: project.department,
    status: project.status,
    startDate: project.start_date,
    dueDate: project.due_date,
  };
}

function mapProfile(profile) {
  return {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    role: profile.role,
    department: profile.department,
    status: profile.status,
  };
}

function currentUserName() {
  if (!session?.user?.email) return "You";
  const profile = state.profiles.find((item) => item.email === session.user.email);
  return profile?.name || session.user.email;
}

async function submitLogin(event) {
  event.preventDefault();
  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;
  setAuthMessage("Logging in...");

  try {
    const auth = await authRequest("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    saveSession({ accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user });
    setAuthMessage("Logged in.");
    authModal.close();
    await refreshWorkspace();
  } catch (error) {
    setAuthMessage("Login failed. Check the email and password.");
  }
}

async function submitSignup() {
  const name = document.querySelector("#authName").value.trim() || "STA Member";
  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;
  if (!email || password.length < 6) {
    setAuthMessage("Enter an email and a password with at least 6 characters.");
    return;
  }

  setAuthMessage("Creating account...");
  try {
    const auth = await authRequest("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, data: { full_name: name } }),
    });
    if (auth.access_token) {
      saveSession({ accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user });
    }
    await upsertProfile({ name, email, role: "Member", department: "Operations", status: "Active" });
    setAuthMessage("Account created. If email confirmation is enabled, check your inbox before logging in.");
    await refreshWorkspace();
  } catch (error) {
    setAuthMessage("Could not create account. The email may already exist.");
  }
}

function setAuthMessage(message) {
  document.querySelector("#authMessage").textContent = message;
}

async function submitTask(event) {
  event.preventDefault();
  const projectName = document.querySelector("#taskProject").value;
  const profileName = document.querySelector("#taskOwner").value;
  const profile = state.profiles.find((item) => item.name === profileName);
  const project = state.projects.find((item) => item.name === projectName);
  const firstUpdate = document.querySelector("#taskDescription").value.trim();
  const tags = document.querySelector("#taskTags").value.split(",").map((tag) => tag.trim()).filter(Boolean);

  const task = {
    title: document.querySelector("#taskTitle").value.trim(),
    project: projectName,
    project_id: project?.id || null,
    owner: profileName,
    assignee_email: profile?.email || null,
    priority: document.querySelector("#taskPriority").value,
    status: "To Do",
    due_date: document.querySelector("#taskDueDate").value,
    department: document.querySelector("#taskDepartment").value,
    approval_status: document.querySelector("#taskApproval").value,
    recurrence: document.querySelector("#taskRecurrence").value,
    estimated_hours: Number(document.querySelector("#taskEstimate").value || 0),
    blocked: document.querySelector("#taskBlocked").checked,
    description: firstUpdate,
    tags,
    dependency_note: document.querySelector("#taskDependency").value.trim(),
  };

  document.querySelector("#taskForm").reset();
  taskModal.close();

  try {
    const [created] = await dbRequest("/rest/v1/tasks", {
      method: "POST",
      body: JSON.stringify(task),
    });
    if (firstUpdate) await createUpdate(created.id, firstUpdate, currentUserName());
    await refreshWorkspace();
  } catch (error) {
    state.dataMode = "Local backup mode";
    state.tasks.unshift({
      id: crypto.randomUUID(),
      title: task.title,
      project: task.project,
      owner: task.owner,
      priority: task.priority,
      status: task.status,
      dueDate: task.due_date,
      department: task.department,
      blocked: task.blocked,
      approvalStatus: task.approval_status,
      recurrence: task.recurrence,
      estimatedHours: task.estimated_hours,
      tags,
      dependencyNote: task.dependency_note,
      updates: firstUpdate ? [{ author: currentUserName(), text: firstUpdate, createdAt: formatNow() }] : [],
    });
    saveLocalState();
    render();
  }
}

async function submitUpdate(event) {
  event.preventDefault();
  const taskId = document.querySelector("#updateTaskSelect").value;
  const text = document.querySelector("#updateText").value.trim();
  if (!text) return;
  document.querySelector("#updateText").value = "";

  try {
    await createUpdate(taskId, text, currentUserName());
    await refreshWorkspace();
  } catch {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.updates.unshift({ author: currentUserName(), text, createdAt: formatNow() });
    state.dataMode = "Local backup mode";
    saveLocalState();
    render();
  }
}

async function submitProject(event) {
  event.preventDefault();
  const project = {
    name: document.querySelector("#projectName").value.trim(),
    owner: document.querySelector("#projectOwner").value.trim(),
    department: document.querySelector("#projectDepartment").value,
    status: document.querySelector("#projectStatus").value,
    due_date: document.querySelector("#projectDueDate").value || null,
    start_date: new Date().toISOString().slice(0, 10),
    description: document.querySelector("#projectDescription").value.trim(),
  };
  document.querySelector("#projectForm").reset();
  projectModal.close();

  try {
    await dbRequest("/rest/v1/projects", { method: "POST", body: JSON.stringify(project) });
    await refreshWorkspace();
  } catch {
    state.projects.push({
      id: crypto.randomUUID(),
      name: project.name,
      owner: project.owner,
      department: project.department,
      status: project.status,
      dueDate: project.due_date,
      description: project.description,
    });
    state.dataMode = "Local backup mode";
    saveLocalState();
    render();
  }
}

async function submitStatus(event) {
  event.preventDefault();
  const input = document.querySelector("#statusName");
  const name = input.value.trim();
  if (!name || state.statuses.includes(name)) {
    input.value = "";
    return;
  }
  input.value = "";

  try {
    await dbRequest("/rest/v1/task_statuses", {
      method: "POST",
      body: JSON.stringify({
        name,
        position: (state.statuses.length + 1) * 10,
        color: "#111111",
      }),
    });
    await refreshWorkspace();
  } catch {
    state.statuses.push(name);
    state.dataMode = "Local backup mode";
    saveLocalState();
    render();
  }
}

async function submitInvite(event) {
  event.preventDefault();
  const profile = {
    name: document.querySelector("#inviteName").value.trim(),
    email: document.querySelector("#inviteEmail").value.trim(),
    role: document.querySelector("#inviteRole").value,
    department: document.querySelector("#inviteDepartment").value,
    status: "Invited",
  };
  document.querySelector("#inviteForm").reset();
  inviteModal.close();

  try {
    await upsertProfile(profile);
    await refreshWorkspace();
  } catch {
    state.profiles.push({ ...profile, id: crypto.randomUUID() });
    state.dataMode = "Local backup mode";
    saveLocalState();
    render();
  }
}

async function upsertProfile(profile) {
  const existing = state.profiles.find((item) => item.email === profile.email);
  const body = {
    full_name: profile.name,
    email: profile.email,
    role: profile.role,
    department: profile.department,
    status: profile.status,
  };
  if (existing) {
    await dbRequest(`/rest/v1/profiles?email=eq.${encodeURIComponent(profile.email)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  } else {
    await dbRequest("/rest/v1/profiles", { method: "POST", body: JSON.stringify(body) });
  }
}

async function updateTaskStatus(taskId, status) {
  await dbRequest(`/rest/v1/tasks?id=eq.${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      approval_status: status === "Review" ? "Pending Approval" : undefined,
    }),
  });
}

async function deleteTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const confirmed = window.confirm(`Delete task "${task.title}"?`);
  if (!confirmed) return;

  state.tasks = state.tasks.filter((item) => item.id !== taskId);
  saveLocalState();
  render();

  try {
    await dbRequest(`/rest/v1/tasks?id=eq.${taskId}`, { method: "DELETE" });
    await refreshWorkspace();
  } catch {
    state.dataMode = "Local backup mode";
    render();
  }
}

async function deleteProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  const confirmed = window.confirm(`Delete project "${project.name}"? Tasks will remain but lose the project link.`);
  if (!confirmed) return;

  state.projects = state.projects.filter((item) => item.id !== projectId);
  saveLocalState();
  render();

  try {
    await dbRequest(`/rest/v1/projects?id=eq.${projectId}`, { method: "DELETE" });
    await refreshWorkspace();
  } catch {
    state.dataMode = "Local backup mode";
    render();
  }
}

async function createUpdate(taskId, text, author = "STA Team") {
  await dbRequest("/rest/v1/task_updates", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, author, body: text }),
  });
}

async function dbRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.accessToken || SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return [];
  return response.json();
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function openTaskModal() {
  document.querySelector("#taskDueDate").value = addDays(3);
  hydrateTaskFormOptions();
  taskModal.showModal();
}

function hydrateTaskFormOptions() {
  document.querySelector("#taskProject").innerHTML = state.projects
    .map((project) => `<option>${escapeHtml(project.name)}</option>`)
    .join("");
  document.querySelector("#taskOwner").innerHTML = state.profiles
    .filter((profile) => profile.status !== "Paused")
    .map((profile) => `<option>${escapeHtml(profile.name)}</option>`)
    .join("");
}

function setView(viewName) {
  Object.entries(views).forEach(([name, element]) => {
    element.classList.toggle("active", name === viewName);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  viewTitle.textContent = viewName[0].toUpperCase() + viewName.slice(1);
  render();
}

function getFilteredTasks() {
  const query = searchInput.value.trim().toLowerCase();
  return state.tasks.filter((task) => {
    const matchesSearch = [
      task.title,
      task.project,
      task.owner,
      task.priority,
      task.status,
      task.department,
      task.approvalStatus,
      task.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
    const matchesProject = state.projectFilter === "all" || task.project === state.projectFilter;
    return matchesSearch && matchesProject;
  });
}

function render() {
  renderSession();
  renderMetrics();
  renderProjectFilters();
  renderPriorityTasks();
  renderOwnerLoad();
  renderBoard();
  renderProjects();
  renderUpdates();
  renderTeam();
  renderReports();
  renderTemplates();
  bindTaskCardControls();
}

function renderSession() {
  const chip = document.querySelector("#sessionChip");
  const authButton = document.querySelector("#openAuthModal");
  if (session?.user?.email) {
    chip.textContent = currentUserName();
    authButton.textContent = "Logout";
    authButton.onclick = () => saveSession(null);
  } else {
    chip.textContent = "Guest workspace";
    authButton.textContent = "Login";
    authButton.onclick = () => authModal.showModal();
  }
}

function renderMetrics() {
  const openTasks = state.tasks.filter((task) => task.status !== "Done");
  const dueSoon = openTasks.filter((task) => daysUntil(task.dueDate) >= 0 && daysUntil(task.dueDate) <= 7);
  const blocked = state.tasks.filter((task) => task.blocked || task.updates.some((update) => update.text.toLowerCase().includes("waiting")));
  const done = state.tasks.filter((task) => task.status === "Done");
  const approvals = state.tasks.filter((task) => task.approvalStatus === "Pending Approval");
  const score = Math.max(35, Math.round(100 - blocked.length * 8 - overdueCount() * 12 - approvals.length * 5));

  document.querySelector("#openTasksMetric").textContent = openTasks.length;
  document.querySelector("#dueMetric").textContent = dueSoon.length;
  document.querySelector("#blockedMetric").textContent = blocked.length;
  document.querySelector("#doneMetric").textContent = done.length;
  document.querySelector("#approvalMetric").textContent = approvals.length;
  document.querySelector("#healthScore").textContent = `${score}%`;
  document.querySelector("#dataMode").textContent = state.dataMode;
}

function renderProjectFilters() {
  const filter = document.querySelector(".segmented-control");
  filter.innerHTML = [
    `<button class="segment ${state.projectFilter === "all" ? "active" : ""}" data-project-filter="all" type="button">All</button>`,
    ...state.projects.map(
      (project) =>
        `<button class="segment ${state.projectFilter === project.name ? "active" : ""}" data-project-filter="${escapeHtml(project.name)}" type="button">${escapeHtml(project.name)}</button>`
    ),
  ].join("");
  filter.querySelectorAll("[data-project-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.projectFilter = button.dataset.projectFilter;
      saveLocalState();
      render();
    });
  });
}

function renderPriorityTasks() {
  const tasks = getFilteredTasks()
    .filter((task) => task.status !== "Done")
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))
    .slice(0, 6);
  document.querySelector("#priorityCount").textContent = `${tasks.length} tasks`;
  document.querySelector("#priorityTasks").innerHTML = tasks.length
    ? tasks.map(taskCard).join("")
    : emptyState("No priority work matches this view.");
}

function renderOwnerLoad() {
  const owners = state.tasks
    .filter((task) => task.status !== "Done")
    .reduce((load, task) => {
      load[task.owner] = (load[task.owner] || 0) + 1;
      return load;
    }, {});
  const max = Math.max(1, ...Object.values(owners));
  document.querySelector("#ownerLoad").innerHTML = Object.entries(owners)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([owner, count]) => `
        <div class="owner-row">
          <strong>${escapeHtml(owner)}</strong>
          <div class="bar-track"><div class="bar-fill" style="width: ${(count / max) * 100}%"></div></div>
          <span>${count}</span>
        </div>
      `
    )
    .join("");
}

function renderBoard() {
  const tasks = getFilteredTasks();
  document.querySelector("#kanbanBoard").innerHTML = state.statuses
    .map((status) => {
      const columnTasks = tasks.filter((task) => task.status === status);
      return `
        <section class="kanban-column" data-status="${escapeHtml(status)}">
          <div class="column-title">${escapeHtml(status)}<span>${columnTasks.length}</span></div>
          <div class="task-list">${columnTasks.length ? columnTasks.map((task) => taskCard(task, true)).join("") : emptyState("Nothing here yet.")}</div>
        </section>
      `;
    })
    .join("");

  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = state.tasks.find((item) => item.id === button.dataset.taskId);
      if (!task) return;
      const nextStatus = button.dataset.move;
      task.status = nextStatus;
      task.updates.unshift({ author: "System", text: `Status moved to ${nextStatus}.`, createdAt: formatNow() });
      saveLocalState();
      render();
      try {
        await updateTaskStatus(task.id, nextStatus);
        await createUpdate(task.id, `Status moved to ${nextStatus}.`, "System");
        await refreshWorkspace();
      } catch {
        state.dataMode = "Local backup mode";
        render();
      }
    });
  });

  document.querySelectorAll(".kanban-column").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("drag-over");
    });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      column.classList.remove("drag-over");
      await moveTaskToStatus(event.dataTransfer.getData("text/plain"), column.dataset.status);
    });
  });

}

async function moveTaskToStatus(taskId, nextStatus) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || task.status === nextStatus) return;
  task.status = nextStatus;
  task.updates.unshift({ author: "System", text: `Status moved to ${nextStatus}.`, createdAt: formatNow() });
  saveLocalState();
  render();

  try {
    await updateTaskStatus(task.id, nextStatus);
    await createUpdate(task.id, `Status moved to ${nextStatus}.`, "System");
    await refreshWorkspace();
  } catch {
    state.dataMode = "Local backup mode";
    render();
  }
}

function renderProjects() {
  document.querySelector("#projectsGrid").innerHTML = state.projects
    .map((project) => {
      const tasks = state.tasks.filter((task) => task.project === project.name);
      const done = tasks.filter((task) => task.status === "Done").length;
      const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
      return `
        <article class="project-card">
          <div>
            <h2>${escapeHtml(project.name)}</h2>
            <p>${escapeHtml(project.description || "No description yet.")}</p>
          </div>
          <div class="progress-row">
            <div class="progress-meta"><span>${escapeHtml(project.owner)} · ${escapeHtml(project.department)}</span><strong>${progress}%</strong></div>
            <div class="bar-track"><div class="bar-fill" style="width: ${progress}%"></div></div>
          </div>
          <div class="task-meta">
            <span class="pill">${escapeHtml(project.status)}</span>
            <span class="pill">${tasks.length} tasks</span>
            <span class="pill">Due ${project.dueDate ? formatDate(project.dueDate) : "TBD"}</span>
          </div>
          <div class="card-actions">
            <button class="small-button danger" data-delete-project="${project.id}" type="button">Delete Project</button>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => deleteProject(button.dataset.deleteProject));
  });
}

function renderUpdates() {
  const updates = state.tasks.flatMap((task) =>
    task.updates.map((update) => ({ ...update, task: task.title, project: task.project }))
  );
  document.querySelector("#updatesList").innerHTML = updates.length
    ? updates
        .map(
          (update) => `
          <article class="update-item">
            <strong>${escapeHtml(update.task)}</strong>
            <p>${escapeHtml(update.text)}</p>
            <span class="pill">${escapeHtml(update.project)}</span>
            <span class="pill">${escapeHtml(update.author)} · ${escapeHtml(update.createdAt)}</span>
          </article>
        `
        )
        .join("")
    : emptyState("No updates have been posted yet.");
  document.querySelector("#updateTaskSelect").innerHTML = state.tasks
    .filter((task) => task.status !== "Done")
    .map((task) => `<option value="${task.id}">${escapeHtml(task.title)}</option>`)
    .join("");
}

function renderTeam() {
  document.querySelector("#teamGrid").innerHTML = state.profiles
    .map(
      (profile) => `
      <article class="team-card">
        <h2>${escapeHtml(profile.name)}</h2>
        <p>${escapeHtml(profile.email)}</p>
        <div class="task-meta">
          <span class="pill">${escapeHtml(profile.role)}</span>
          <span class="pill">${escapeHtml(profile.department)}</span>
          <span class="pill">${escapeHtml(profile.status)}</span>
        </div>
      </article>
    `
    )
    .join("");
}

function renderReports() {
  const approvals = state.tasks.filter((task) => task.approvalStatus === "Pending Approval");
  const blocked = state.tasks.filter((task) => task.blocked || task.dependencyNote);
  document.querySelector("#approvalTasks").innerHTML = approvals.length
    ? approvals.map(taskCard).join("")
    : emptyState("No approvals are waiting.");
  document.querySelector("#blockedTasks").innerHTML = blocked.length
    ? blocked.map(taskCard).join("")
    : emptyState("No blocked work right now.");
}

function renderTemplates() {
  document.querySelector("#templateList").innerHTML = templates
    .map(
      (template) => `
        <article class="template-card">
          <strong>${escapeHtml(template.name)}</strong>
          <p>${escapeHtml(template.detail)}</p>
        </article>
      `
    )
    .join("");
}

function taskCard(task, showActions = false) {
  const actions = state.statuses
    .filter((status) => status !== task.status)
    .map((status) => `<button class="small-button" data-task-id="${task.id}" data-move="${status}" type="button">${status}</button>`)
    .join("");
  const tags = task.tags?.length ? task.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("") : "";

  return `
    <article class="task-card" data-task-card="${task.id}" ${showActions ? 'draggable="true"' : ""}>
      <div>
        <h3>${escapeHtml(task.title)}</h3>
        <div class="task-meta">
          <span class="pill">${escapeHtml(task.project)}</span>
          <span class="pill">${escapeHtml(task.owner)}</span>
          <span class="pill ${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span>
          ${task.blocked ? '<span class="pill high">Blocked</span>' : ""}
        </div>
      </div>
      <div class="task-footer">
        <span class="pill">${escapeHtml(task.status)}</span>
        <span class="pill">Due ${formatDate(task.dueDate)}</span>
        <span class="pill">${escapeHtml(task.approvalStatus)}</span>
        <span class="pill">${escapeHtml(task.recurrence)}</span>
        <span class="pill">${task.estimatedHours}h</span>
        <span class="pill">${task.updates.length} updates</span>
        ${tags}
      </div>
      ${task.dependencyNote ? `<p class="task-note">${escapeHtml(task.dependencyNote)}</p>` : ""}
      <div class="card-actions">
        ${showActions ? actions : ""}
        <button class="small-button danger" data-delete-task="${task.id}" type="button">Delete Task</button>
      </div>
    </article>
  `;
}

function bindTaskCardControls() {
  document.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", () => deleteTask(button.dataset.deleteTask));
  });

  document.querySelectorAll("[data-task-card][draggable='true']").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", card.dataset.taskCard);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysUntil(dateText) {
  if (!dateText) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateText}T00:00:00`);
  return Math.ceil((date - today) / 86400000);
}

function overdueCount() {
  return state.tasks.filter((task) => task.status !== "Done" && daysUntil(task.dueDate) < 0).length;
}

function priorityWeight(priority) {
  return { Low: 1, Medium: 2, High: 3 }[priority] || 0;
}

function formatDate(dateText) {
  if (!dateText) return "TBD";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${dateText}T00:00:00`));
}

function formatTimestamp(dateText) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateText));
}

function formatNow() {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

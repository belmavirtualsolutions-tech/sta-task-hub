const STORAGE_KEY = "sta-task-hub-state-v2";
const SESSION_KEY = "sta-task-hub-session";
const SUPABASE_URL = "https://awzskjknfelgdvyvkpui.supabase.co";
const SUPABASE_KEY = "sb_publishable_0hsnBkyRXUWQSiAyDRKYWA_q-0Y0740";

const defaultStatuses = ["To Do", "In Progress", "Review", "Done"];
const templates = [
  {
    name: "Weekly Department Update",
    detail: "Create a recurring weekly task for each department to post progress, risks, and next steps.",
    recurrence: "Weekly",
    approval: "Not Required",
  },
  {
    name: "Client Delivery Checklist",
    detail: "Use for onboarding tasks, account access, kickoff notes, approvals, and delivery blockers.",
    recurrence: "None",
    approval: "Not Required",
  },
  {
    name: "Management Approval",
    detail: "Use when a task needs review before it can move into Done.",
    recurrence: "None",
    approval: "Pending Approval",
  },
];

let state = loadLocalState();
let session = loadSession();
let editingTaskId = null;
let editingProjectId = null;
let editingMemberId = null;
let detailTaskId = null;

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
const projectModal = document.querySelector("#projectModal");
const inviteModal = document.querySelector("#inviteModal");
const taskDetailModal = document.querySelector("#taskDetailModal");
const editMemberModal = document.querySelector("#editMemberModal");
const authPage = document.querySelector("#authPage");
const appShell = document.querySelector("#appShell");

wireEvents();
render();
refreshWorkspace();

// ── State ──────────────────────────────────────────────────────────────────

function defaultState() {
  return {
    projectFilter: "all",
    dataMode: "Loading shared workspace",
    statuses: defaultStatuses,
    statusColors: {},
    tasks: [],
    projects: [
      { id: "seed-p1", name: "Product Launch", description: "Q3 product rollout and go-to-market.", owner: "Team Lead", department: "Growth", status: "Active", dueDate: null },
      { id: "seed-p2", name: "Client Delivery", description: "Ongoing client onboarding and account management.", owner: "Team Lead", department: "Operations", status: "Active", dueDate: null },
      { id: "seed-p3", name: "Finance Ops", description: "Monthly reconciliation and financial reporting.", owner: "Finance Lead", department: "Finance", status: "Active", dueDate: null },
      { id: "seed-p4", name: "People & Admin", description: "HR, hiring, and admin operations.", owner: "Admin Lead", department: "Admin", status: "Active", dueDate: null },
    ],
    profiles: [
      { id: "seed-u1", name: "Amaka", email: "", role: "Manager", department: "Growth", status: "Active" },
      { id: "seed-u2", name: "Tunde", email: "", role: "Member", department: "Operations", status: "Active" },
      { id: "seed-u3", name: "Fatima", email: "", role: "Member", department: "Finance", status: "Active" },
      { id: "seed-u4", name: "David", email: "", role: "Member", department: "Admin", status: "Active" },
      { id: "seed-u5", name: "Grace", email: "", role: "Member", department: "Admin", status: "Active" },
    ],
  };
}

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const base = defaultState();
    return {
      ...base,
      ...saved,
      statusColors: saved.statusColors || {},
      projects: saved.projects?.length ? saved.projects : base.projects,
      profiles: saved.profiles?.length ? saved.profiles : base.profiles,
    };
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
      statusColors: state.statusColors,
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

// ── Wire events ────────────────────────────────────────────────────────────

function wireEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  searchInput.addEventListener("input", render);

  document.querySelector("#openTaskModal").addEventListener("click", openTaskModal);
  document.querySelector("#openProjectModal").addEventListener("click", () => {
    editingProjectId = null;
    resetProjectModalLabels();
    projectModal.showModal();
  });
  document.querySelector("#openInviteModal").addEventListener("click", () => inviteModal.showModal());

  document.querySelector("#closeTaskModal").addEventListener("click", () => {
    editingTaskId = null;
    resetTaskModalLabels();
    taskModal.close();
  });
  document.querySelector("#cancelTask").addEventListener("click", () => {
    editingTaskId = null;
    resetTaskModalLabels();
    taskModal.close();
  });
  document.querySelector("#closeProjectModal").addEventListener("click", () => {
    editingProjectId = null;
    resetProjectModalLabels();
    projectModal.close();
  });
  document.querySelector("#cancelProject").addEventListener("click", () => {
    editingProjectId = null;
    resetProjectModalLabels();
    projectModal.close();
  });
  document.querySelector("#closeInviteModal").addEventListener("click", () => inviteModal.close());
  document.querySelector("#cancelInvite").addEventListener("click", () => inviteModal.close());

  document.querySelector("#taskForm").addEventListener("submit", submitTask);
  document.querySelector("#updateForm").addEventListener("submit", submitUpdate);
  document.querySelector("#projectForm").addEventListener("submit", submitProject);
  document.querySelector("#inviteForm").addEventListener("submit", submitInvite);
  document.querySelector("#authForm").addEventListener("submit", submitLogin);
  document.querySelector("#authSignup").addEventListener("click", submitSignup);
  document.querySelector("#statusForm").addEventListener("submit", submitStatus);
  document.querySelector("#forgotPassword").addEventListener("click", submitForgotPassword);
  document.querySelector("#exportReportsCSV").addEventListener("click", exportReportsCSV);

  // Task detail modal
  document.querySelector("#closeTaskDetail").addEventListener("click", () => taskDetailModal.close());
  document.querySelector("#editTaskFromDetail").addEventListener("click", () => {
    const taskId = document.querySelector("#editTaskFromDetail").dataset.editTask;
    if (taskId) openEditTaskModal(taskId);
  });
  document.querySelector("#detailUpdateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = document.querySelector("#detailUpdateText").value.trim();
    if (!text || !detailTaskId) return;
    document.querySelector("#detailUpdateText").value = "";

    const task = state.tasks.find((t) => t.id === detailTaskId);
    if (task) {
      task.updates.unshift({ author: currentUserName(), text, createdAt: formatNow() });
      saveLocalState();
    }

    try {
      await createUpdate(detailTaskId, text, currentUserName());
      await refreshWorkspace();
    } catch {
      state.dataMode = "Local backup mode";
      render();
    }

    if (detailTaskId) openTaskDetail(detailTaskId);
  });

  // Edit member modal
  document.querySelector("#editMemberForm").addEventListener("submit", submitEditMember);
  document.querySelector("#closeEditMemberModal").addEventListener("click", () => {
    editingMemberId = null;
    editMemberModal.close();
  });
  document.querySelector("#cancelEditMember").addEventListener("click", () => {
    editingMemberId = null;
    editMemberModal.close();
  });
  document.querySelector("#removeMemberBtn").addEventListener("click", () => {
    if (editingMemberId) removeMember(editingMemberId);
  });
}

// ── Workspace refresh ──────────────────────────────────────────────────────

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
    state.statuses = taskStatuses.map((s) => s.name);
    state.tasks = tasks.map((task) => mapTask(task, updatesByTask[task.id] || []));
    state.dataMode = "Shared Supabase workspace";
    saveLocalState();
    render();
  } catch {
    state.dataMode = "Local backup mode";
    render();
  }
}

// ── Data mappers ───────────────────────────────────────────────────────────

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

// ── Auth ───────────────────────────────────────────────────────────────────

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
    await refreshWorkspace();
  } catch {
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
  } catch {
    setAuthMessage("Could not create account. The email may already exist.");
  }
}

async function submitForgotPassword() {
  const email = document.querySelector("#authEmail").value.trim();
  if (!email) {
    setAuthMessage("Enter your email address above, then click Forgot password.");
    return;
  }
  setAuthMessage("Sending reset email...");
  try {
    await authRequest("/auth/v1/recover", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setAuthMessage("Password reset email sent. Check your inbox.");
  } catch {
    setAuthMessage("Could not send reset email. Check the address and try again.");
  }
}

function setAuthMessage(message) {
  document.querySelector("#authMessage").textContent = message;
}

// ── Task CRUD ──────────────────────────────────────────────────────────────

function openTaskModal() {
  editingTaskId = null;
  resetTaskModalLabels();
  document.querySelector("#taskDueDate").value = addDays(3);
  document.querySelector("#taskForm").reset();
  document.querySelector("#taskDueDate").value = addDays(3);
  hydrateTaskFormOptions();
  taskModal.showModal();
}

function openEditTaskModal(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  editingTaskId = taskId;

  hydrateTaskFormOptions();

  document.querySelector("#taskTitle").value = task.title;
  document.querySelector("#taskProject").value = task.project;
  document.querySelector("#taskOwner").value = task.owner;
  document.querySelector("#taskPriority").value = task.priority;
  document.querySelector("#taskDueDate").value = task.dueDate || "";
  document.querySelector("#taskDepartment").value = task.department || "Operations";
  document.querySelector("#taskApproval").value = task.approvalStatus;
  document.querySelector("#taskRecurrence").value = task.recurrence;
  document.querySelector("#taskEstimate").value = task.estimatedHours;
  document.querySelector("#taskTags").value = task.tags?.join(", ") || "";
  document.querySelector("#taskBlocked").checked = task.blocked;
  document.querySelector("#taskDescription").value = "";
  document.querySelector("#taskDependency").value = task.dependencyNote || "";

  document.querySelector("#taskModal .eyebrow").textContent = "Edit work item";
  document.querySelector("#taskModal h2").textContent = "Edit Task";
  document.querySelector("#taskForm button[type='submit']").textContent = "Save Changes";

  taskDetailModal.close();
  taskModal.showModal();
}

function resetTaskModalLabels() {
  document.querySelector("#taskModal .eyebrow").textContent = "Create work item";
  document.querySelector("#taskModal h2").textContent = "New Task";
  document.querySelector("#taskForm button[type='submit']").textContent = "Create Task";
}

async function submitTask(event) {
  event.preventDefault();
  const projectName = document.querySelector("#taskProject").value;
  const profileName = document.querySelector("#taskOwner").value;
  const profile = state.profiles.find((item) => item.name === profileName);
  const project = state.projects.find((item) => item.name === projectName);
  const firstUpdate = document.querySelector("#taskDescription").value.trim();
  const tags = document.querySelector("#taskTags").value.split(",").map((tag) => tag.trim()).filter(Boolean);

  const taskPayload = {
    title: document.querySelector("#taskTitle").value.trim(),
    project: projectName,
    project_id: project?.id || null,
    owner: profileName,
    assignee_email: profile?.email || null,
    priority: document.querySelector("#taskPriority").value,
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

  if (editingTaskId) {
    const taskId = editingTaskId;
    editingTaskId = null;
    resetTaskModalLabels();
    taskModal.close();

    const existing = state.tasks.find((t) => t.id === taskId);
    if (existing) {
      Object.assign(existing, {
        title: taskPayload.title,
        project: taskPayload.project,
        owner: taskPayload.owner,
        priority: taskPayload.priority,
        dueDate: taskPayload.due_date,
        department: taskPayload.department,
        blocked: taskPayload.blocked,
        approvalStatus: taskPayload.approval_status,
        recurrence: taskPayload.recurrence,
        estimatedHours: taskPayload.estimated_hours,
        tags,
        dependencyNote: taskPayload.dependency_note,
      });
      if (firstUpdate) {
        existing.updates.unshift({ author: currentUserName(), text: firstUpdate, createdAt: formatNow() });
      }
    }
    saveLocalState();
    render();

    try {
      await dbRequest(`/rest/v1/tasks?id=eq.${taskId}`, { method: "PATCH", body: JSON.stringify(taskPayload) });
      if (firstUpdate) await createUpdate(taskId, firstUpdate, currentUserName());
      await refreshWorkspace();
    } catch {
      state.dataMode = "Local backup mode";
      render();
    }
    return;
  }

  // Create mode
  document.querySelector("#taskForm").reset();
  taskModal.close();

  try {
    const [created] = await dbRequest("/rest/v1/tasks", {
      method: "POST",
      body: JSON.stringify({ ...taskPayload, status: "To Do" }),
    });
    if (firstUpdate) await createUpdate(created.id, firstUpdate, currentUserName());
    await refreshWorkspace();
  } catch {
    state.dataMode = "Local backup mode";
    state.tasks.unshift({
      id: crypto.randomUUID(),
      title: taskPayload.title,
      project: taskPayload.project,
      owner: taskPayload.owner,
      priority: taskPayload.priority,
      status: "To Do",
      dueDate: taskPayload.due_date,
      department: taskPayload.department,
      blocked: taskPayload.blocked,
      approvalStatus: taskPayload.approval_status,
      recurrence: taskPayload.recurrence,
      estimatedHours: taskPayload.estimated_hours,
      tags,
      dependencyNote: taskPayload.dependency_note,
      description: taskPayload.description,
      updates: firstUpdate ? [{ author: currentUserName(), text: firstUpdate, createdAt: formatNow() }] : [],
    });
    saveLocalState();
    render();
  }
}

async function deleteTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (!window.confirm(`Delete task "${task.title}"?`)) return;

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

async function approveTask(taskId) {
  await changeApprovalStatus(taskId, "Approved", "Task approved.");
}

async function rejectTask(taskId) {
  await changeApprovalStatus(taskId, "Changes Requested", "Changes requested.");
}

async function changeApprovalStatus(taskId, newStatus, updateText) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.approvalStatus = newStatus;
  task.updates.unshift({ author: currentUserName(), text: updateText, createdAt: formatNow() });
  saveLocalState();
  taskDetailModal.close();
  render();

  try {
    await dbRequest(`/rest/v1/tasks?id=eq.${taskId}`, { method: "PATCH", body: JSON.stringify({ approval_status: newStatus }) });
    await createUpdate(taskId, updateText, currentUserName());
    await refreshWorkspace();
  } catch {
    state.dataMode = "Local backup mode";
    render();
  }
}

async function unblockTask(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.blocked = false;
  task.updates.unshift({ author: currentUserName(), text: "Task unblocked.", createdAt: formatNow() });
  saveLocalState();
  taskDetailModal.close();
  render();

  try {
    await dbRequest(`/rest/v1/tasks?id=eq.${taskId}`, { method: "PATCH", body: JSON.stringify({ blocked: false }) });
    await createUpdate(taskId, "Task unblocked.", currentUserName());
    await refreshWorkspace();
  } catch {
    state.dataMode = "Local backup mode";
    render();
  }
}

// ── Task detail panel ──────────────────────────────────────────────────────

function openTaskDetail(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  detailTaskId = taskId;

  document.querySelector("#detailProject").textContent = task.project;
  document.querySelector("#detailTitle").textContent = task.title;
  document.querySelector("#editTaskFromDetail").dataset.editTask = taskId;

  const overdueFlag = isOverdue(task) ? "⚠ Overdue · " : "";
  const fields = [
    ["Owner", task.owner],
    ["Priority", task.priority],
    ["Status", task.status],
    ["Due Date", overdueFlag + (task.dueDate ? formatDate(task.dueDate) : "TBD")],
    ["Department", task.department],
    ["Approval", task.approvalStatus],
    ["Recurrence", task.recurrence],
    ["Estimate", `${task.estimatedHours}h`],
    ["Blocked", task.blocked ? "Yes" : "No"],
    ["Tags", task.tags?.join(", ") || "—"],
  ];
  document.querySelector("#detailFields").innerHTML = fields
    .map(([label, value]) => `
      <div>
        <span class="detail-field-label">${escapeHtml(label)}</span>
        <span class="detail-field-value">${escapeHtml(String(value))}</span>
      </div>
    `)
    .join("");

  const noteEl = document.querySelector("#detailNote");
  if (task.dependencyNote) {
    document.querySelector("#detailNoteText").textContent = task.dependencyNote;
    noteEl.style.display = "block";
  } else {
    noteEl.style.display = "none";
  }

  const statusMoves = state.statuses
    .filter((s) => s !== task.status)
    .map((s) => `<button class="small-button detail-move-btn" data-move-task="${task.id}" data-move-to="${escapeHtml(s)}" type="button">→ ${escapeHtml(s)}</button>`)
    .join("");

  const approvalBtns =
    task.approvalStatus === "Pending Approval"
      ? `<button class="small-button success" data-approve-task="${task.id}" type="button">Approve</button>
         <button class="small-button danger" data-reject-task="${task.id}" type="button">Request Changes</button>`
      : "";

  const unblockBtn = task.blocked
    ? `<button class="small-button" data-unblock-task="${task.id}" type="button">Mark Unblocked</button>`
    : "";

  document.querySelector("#detailActions").innerHTML = statusMoves + approvalBtns + unblockBtn;

  document.querySelector("#detailUpdateCount").textContent =
    `${task.updates.length} update${task.updates.length !== 1 ? "s" : ""}`;
  document.querySelector("#detailUpdatesList").innerHTML = task.updates.length
    ? task.updates
        .map(
          (u) => `
          <div class="detail-update-item ${u.author === "System" ? "system-update" : ""}">
            <div class="detail-update-meta"><strong>${escapeHtml(u.author)}</strong> · ${escapeHtml(u.createdAt)}</div>
            <p style="margin:4px 0 0;color:var(--muted);font-size:0.9rem">${escapeHtml(u.text)}</p>
          </div>
        `
        )
        .join("")
    : '<p style="color:var(--muted);font-size:0.9rem;padding:8px 0">No updates yet.</p>';

  document.querySelector("#detailUpdateText").value = "";

  document.querySelectorAll(".detail-move-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await moveTaskToStatus(btn.dataset.moveTask, btn.dataset.moveTo);
      taskDetailModal.close();
    });
  });
  document.querySelectorAll("[data-approve-task]").forEach((btn) => {
    btn.addEventListener("click", () => approveTask(btn.dataset.approveTask));
  });
  document.querySelectorAll("[data-reject-task]").forEach((btn) => {
    btn.addEventListener("click", () => rejectTask(btn.dataset.rejectTask));
  });
  document.querySelectorAll("[data-unblock-task]").forEach((btn) => {
    btn.addEventListener("click", () => unblockTask(btn.dataset.unblockTask));
  });

  taskDetailModal.showModal();
}

// ── Project CRUD ───────────────────────────────────────────────────────────

function openEditProjectModal(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;
  editingProjectId = projectId;

  document.querySelector("#projectName").value = project.name;
  document.querySelector("#projectOwner").value = project.owner;
  document.querySelector("#projectDepartment").value = project.department;
  document.querySelector("#projectStatus").value = project.status;
  document.querySelector("#projectDueDate").value = project.dueDate || "";
  document.querySelector("#projectDescription").value = project.description || "";

  document.querySelector("#projectModal .eyebrow").textContent = "Edit project";
  document.querySelector("#projectModal h2").textContent = "Edit Project";
  document.querySelector("#projectForm button[type='submit']").textContent = "Save Changes";

  projectModal.showModal();
}

function resetProjectModalLabels() {
  document.querySelector("#projectModal .eyebrow").textContent = "Create project";
  document.querySelector("#projectModal h2").textContent = "New Project";
  document.querySelector("#projectForm button[type='submit']").textContent = "Create Project";
}

async function submitProject(event) {
  event.preventDefault();
  const projectPayload = {
    name: document.querySelector("#projectName").value.trim(),
    owner: document.querySelector("#projectOwner").value.trim(),
    department: document.querySelector("#projectDepartment").value,
    status: document.querySelector("#projectStatus").value,
    due_date: document.querySelector("#projectDueDate").value || null,
    description: document.querySelector("#projectDescription").value.trim(),
  };

  if (editingProjectId) {
    const projectId = editingProjectId;
    editingProjectId = null;
    resetProjectModalLabels();
    document.querySelector("#projectForm").reset();
    projectModal.close();

    const existing = state.projects.find((p) => p.id === projectId);
    if (existing) {
      Object.assign(existing, {
        name: projectPayload.name,
        owner: projectPayload.owner,
        department: projectPayload.department,
        status: projectPayload.status,
        dueDate: projectPayload.due_date,
        description: projectPayload.description,
      });
    }
    saveLocalState();
    render();

    try {
      await dbRequest(`/rest/v1/projects?id=eq.${projectId}`, { method: "PATCH", body: JSON.stringify(projectPayload) });
      await refreshWorkspace();
    } catch {
      state.dataMode = "Local backup mode";
      render();
    }
    return;
  }

  document.querySelector("#projectForm").reset();
  projectModal.close();

  try {
    await dbRequest("/rest/v1/projects", {
      method: "POST",
      body: JSON.stringify({ ...projectPayload, start_date: new Date().toISOString().slice(0, 10) }),
    });
    await refreshWorkspace();
  } catch {
    state.projects.push({
      id: crypto.randomUUID(),
      name: projectPayload.name,
      owner: projectPayload.owner,
      department: projectPayload.department,
      status: projectPayload.status,
      dueDate: projectPayload.due_date,
      description: projectPayload.description,
    });
    state.dataMode = "Local backup mode";
    saveLocalState();
    render();
  }
}

async function deleteProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  if (!window.confirm(`Delete project "${project.name}"? Tasks will remain but lose the project link.`)) return;

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

// ── Team / member CRUD ─────────────────────────────────────────────────────

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

function openEditMemberModal(profileId) {
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  editingMemberId = profileId;

  document.querySelector("#editMemberName").textContent = profile.name;
  document.querySelector("#editMemberRole").value = profile.role;
  document.querySelector("#editMemberDepartment").value = profile.department;
  document.querySelector("#editMemberStatus").value = profile.status;

  editMemberModal.showModal();
}

async function submitEditMember(event) {
  event.preventDefault();
  if (!editingMemberId) return;

  const profileId = editingMemberId;
  editingMemberId = null;
  editMemberModal.close();

  const updates = {
    role: document.querySelector("#editMemberRole").value,
    department: document.querySelector("#editMemberDepartment").value,
    status: document.querySelector("#editMemberStatus").value,
  };

  const existing = state.profiles.find((p) => p.id === profileId);
  if (existing) Object.assign(existing, updates);
  saveLocalState();
  render();

  try {
    await dbRequest(`/rest/v1/profiles?id=eq.${profileId}`, {
      method: "PATCH",
      body: JSON.stringify({ role: updates.role, department: updates.department, status: updates.status }),
    });
    await refreshWorkspace();
  } catch {
    state.dataMode = "Local backup mode";
    render();
  }
}

async function removeMember(profileId) {
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  if (!window.confirm(`Remove ${profile.name} from the team?`)) return;

  editingMemberId = null;
  editMemberModal.close();

  state.profiles = state.profiles.filter((p) => p.id !== profileId);
  saveLocalState();
  render();

  try {
    await dbRequest(`/rest/v1/profiles?id=eq.${profileId}`, { method: "DELETE" });
    await refreshWorkspace();
  } catch {
    state.dataMode = "Local backup mode";
    render();
  }
}

function avatarInitials(name = "") {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

// ── Status management ──────────────────────────────────────────────────────

async function submitStatus(event) {
  event.preventDefault();
  const input = document.querySelector("#statusName");
  const name = input.value.trim();
  const color = document.querySelector("#statusColor").value;
  if (!name || state.statuses.includes(name)) {
    input.value = "";
    return;
  }
  input.value = "";

  state.statusColors = state.statusColors || {};
  state.statusColors[name] = color;

  try {
    await dbRequest("/rest/v1/task_statuses", {
      method: "POST",
      body: JSON.stringify({ name, position: (state.statuses.length + 1) * 10, color }),
    });
    await refreshWorkspace();
  } catch {
    state.statuses.push(name);
    state.dataMode = "Local backup mode";
    saveLocalState();
    render();
  }
}

// ── Updates ────────────────────────────────────────────────────────────────

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

async function createUpdate(taskId, text, author = "STA Team") {
  await dbRequest("/rest/v1/task_updates", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, author, body: text }),
  });
}

// ── Export ─────────────────────────────────────────────────────────────────

function exportReportsCSV() {
  const approvals = state.tasks.filter((t) => t.approvalStatus === "Pending Approval");
  const blocked = state.tasks.filter((t) => t.blocked || t.dependencyNote);
  const seen = new Set();
  const all = [...approvals, ...blocked].filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  const header = ["Title", "Project", "Owner", "Priority", "Status", "Due Date", "Approval", "Blocked", "Dependency Note"];
  const rows = all.map((t) => [
    t.title, t.project, t.owner, t.priority, t.status,
    t.dueDate || "", t.approvalStatus, t.blocked ? "Yes" : "No", t.dependencyNote || "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `sta-reports-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

// ── API helpers ────────────────────────────────────────────────────────────

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

async function updateTaskStatus(taskId, status) {
  await dbRequest(`/rest/v1/tasks?id=eq.${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      approval_status: status === "Review" ? "Pending Approval" : undefined,
    }),
  });
}

async function moveTaskToStatus(taskId, nextStatus) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || task.status === nextStatus) return;
  task.status = nextStatus;
  if (nextStatus === "Review" && task.approvalStatus === "Not Required") {
    task.approvalStatus = "Pending Approval";
  }
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

// ── Form helpers ───────────────────────────────────────────────────────────

function hydrateTaskFormOptions() {
  const projectList = state.projects.length
    ? state.projects
    : [{ name: "General" }, { name: "Client Delivery" }, { name: "Finance Ops" }, { name: "People & Admin" }];

  document.querySelector("#taskProject").innerHTML = projectList
    .map((p) => `<option>${escapeHtml(p.name)}</option>`)
    .join("");

  const profileList = state.profiles.filter((p) => p.status !== "Paused");
  const ownerList = profileList.length
    ? profileList
    : [{ name: "Amaka" }, { name: "Tunde" }, { name: "Fatima" }, { name: "David" }, { name: "Grace" }];

  document.querySelector("#taskOwner").innerHTML = ownerList
    .map((p) => `<option>${escapeHtml(p.name)}</option>`)
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
      task.title, task.project, task.owner, task.priority,
      task.status, task.department, task.approvalStatus, task.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
    const matchesProject = state.projectFilter === "all" || task.project === state.projectFilter;
    return matchesSearch && matchesProject;
  });
}

function isOverdue(task) {
  return task.status !== "Done" && Boolean(task.dueDate) && daysUntil(task.dueDate) < 0;
}

// ── Render ─────────────────────────────────────────────────────────────────

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
    authButton.onclick = () => document.querySelector("#authEmail").focus();
  }
  renderAuthGate();
}

function renderAuthGate() {
  const isSignedIn = Boolean(session?.user?.email);
  authPage.classList.toggle("active", !isSignedIn);
  appShell.classList.toggle("is-hidden", !isSignedIn);
}

function renderMetrics() {
  const openTasks = state.tasks.filter((task) => task.status !== "Done");
  const dueSoon = openTasks.filter((task) => daysUntil(task.dueDate) >= 0 && daysUntil(task.dueDate) <= 7);
  const blocked = state.tasks.filter((task) => task.blocked || task.updates.some((u) => u.text.toLowerCase().includes("waiting")));
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
      (p) => `<button class="segment ${state.projectFilter === p.name ? "active" : ""}" data-project-filter="${escapeHtml(p.name)}" type="button">${escapeHtml(p.name)}</button>`
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
    ? tasks.map((t) => taskCard(t)).join("")
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
  const colors = state.statusColors || {};

  document.querySelector("#kanbanBoard").innerHTML = state.statuses
    .map((status) => {
      const columnTasks = tasks.filter((task) => task.status === status);
      const dot = colors[status]
        ? `<span class="status-dot" style="background:${escapeHtml(colors[status])}"></span>`
        : "";
      return `
        <section class="kanban-column" data-status="${escapeHtml(status)}">
          <div class="column-title">${dot}${escapeHtml(status)}<span>${columnTasks.length}</span></div>
          <div class="task-list" id="col-tasks-${escapeHtml(status)}">
            ${columnTasks.length ? columnTasks.map((task) => taskCard(task, true)).join("") : emptyState("Nothing here yet.")}
          </div>
          <div class="drag-placeholder" style="display:none"></div>
        </section>
      `;
    })
    .join("");

  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      await moveTaskToStatus(button.dataset.taskId, button.dataset.move);
    });
  });

  document.querySelectorAll(".kanban-column").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("drag-over");
      const placeholder = column.querySelector(".drag-placeholder");
      if (placeholder) placeholder.style.display = "block";
    });
    column.addEventListener("dragleave", (event) => {
      if (!column.contains(event.relatedTarget)) {
        column.classList.remove("drag-over");
        const placeholder = column.querySelector(".drag-placeholder");
        if (placeholder) placeholder.style.display = "none";
      }
    });
    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      column.classList.remove("drag-over");
      const placeholder = column.querySelector(".drag-placeholder");
      if (placeholder) placeholder.style.display = "none";
      await moveTaskToStatus(event.dataTransfer.getData("text/plain"), column.dataset.status);
    });
  });
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
            <div class="progress-meta">
              <span>${escapeHtml(project.owner)} · ${escapeHtml(project.department)}</span>
              <strong>${progress}%</strong>
            </div>
            <div class="bar-track"><div class="bar-fill" style="width: ${progress}%"></div></div>
          </div>
          <div class="task-meta">
            <span class="pill">${escapeHtml(project.status)}</span>
            <span class="pill">${tasks.length} tasks</span>
            <span class="pill">Due ${project.dueDate ? formatDate(project.dueDate) : "TBD"}</span>
          </div>
          <div class="card-actions">
            <button class="small-button" data-edit-project="${project.id}" type="button">Edit Project</button>
            <button class="small-button danger" data-delete-project="${project.id}" type="button">Delete Project</button>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-edit-project]").forEach((btn) => {
    btn.addEventListener("click", () => openEditProjectModal(btn.dataset.editProject));
  });
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
        <div class="team-card-header">
          <div class="avatar">${escapeHtml(avatarInitials(profile.name))}</div>
          <div>
            <h2>${escapeHtml(profile.name)}</h2>
            <p>${escapeHtml(profile.email || "—")}</p>
          </div>
        </div>
        <div class="task-meta">
          <span class="pill">${escapeHtml(profile.role)}</span>
          <span class="pill">${escapeHtml(profile.department)}</span>
          <span class="pill ${profile.status === "Invited" ? "medium" : profile.status === "Paused" ? "overdue" : ""}">${escapeHtml(profile.status)}</span>
        </div>
        <div class="team-card-actions">
          <button class="small-button" data-edit-member="${profile.id}" type="button">Edit Member</button>
        </div>
      </article>
    `
    )
    .join("");

  document.querySelectorAll("[data-edit-member]").forEach((btn) => {
    btn.addEventListener("click", () => openEditMemberModal(btn.dataset.editMember));
  });
}

function renderReports() {
  const approvals = state.tasks.filter((task) => task.approvalStatus === "Pending Approval");
  const blocked = state.tasks.filter((task) => task.blocked || task.dependencyNote);
  document.querySelector("#approvalTasks").innerHTML = approvals.length
    ? approvals.map((t) => taskCard(t, false, true)).join("")
    : emptyState("No approvals are waiting.");
  document.querySelector("#blockedTasks").innerHTML = blocked.length
    ? blocked.map((t) => taskCard(t)).join("")
    : emptyState("No blocked work right now.");
}

function renderTemplates() {
  document.querySelector("#templateList").innerHTML = templates
    .map(
      (template, i) => `
        <article class="template-card" data-template="${i}" role="button" tabindex="0" aria-label="Use template: ${escapeHtml(template.name)}">
          <strong>${escapeHtml(template.name)}</strong>
          <p>${escapeHtml(template.detail)}</p>
        </article>
      `
    )
    .join("");

  document.querySelectorAll("[data-template]").forEach((card) => {
    const activate = () => {
      const template = templates[Number(card.dataset.template)];
      openTaskModal();
      document.querySelector("#taskTitle").value = template.name;
      document.querySelector("#taskDescription").value = template.detail;
      if (template.recurrence) document.querySelector("#taskRecurrence").value = template.recurrence;
      if (template.approval) document.querySelector("#taskApproval").value = template.approval;
    };
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") activate(); });
  });
}

// ── Task card ──────────────────────────────────────────────────────────────

function taskCard(task, showActions = false, showApprovalActions = false) {
  const overdue = isOverdue(task);
  const actions = state.statuses
    .filter((status) => status !== task.status)
    .map((status) => `<button class="small-button" data-task-id="${task.id}" data-move="${escapeHtml(status)}" type="button">${escapeHtml(status)}</button>`)
    .join("");

  const approvalActions = showApprovalActions && task.approvalStatus === "Pending Approval"
    ? `<button class="small-button success" data-approve-task="${task.id}" type="button">Approve</button>
       <button class="small-button danger" data-reject-task="${task.id}" type="button">Request Changes</button>`
    : "";

  const tags = task.tags?.length
    ? task.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")
    : "";

  return `
    <article class="task-card${overdue ? " overdue" : ""}" data-task-card="${task.id}" ${showActions ? 'draggable="true"' : ""}>
      <div>
        <h3 class="task-title-link" data-open-detail="${task.id}">${escapeHtml(task.title)}</h3>
        <div class="task-meta">
          <span class="pill">${escapeHtml(task.project)}</span>
          <span class="pill">${escapeHtml(task.owner)}</span>
          <span class="pill ${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span>
          ${task.blocked ? '<span class="pill high">Blocked</span>' : ""}
          ${overdue ? '<span class="pill overdue">Overdue</span>' : ""}
        </div>
      </div>
      <div class="task-footer">
        <span class="pill">${escapeHtml(task.status)}</span>
        <span class="pill">Due ${formatDate(task.dueDate)}</span>
        <span class="pill">${escapeHtml(task.approvalStatus)}</span>
        <span class="pill">${escapeHtml(task.recurrence)}</span>
        <span class="pill">${task.estimatedHours}h</span>
        <span class="pill">${task.updates.length} update${task.updates.length !== 1 ? "s" : ""}</span>
        ${tags}
      </div>
      ${task.dependencyNote ? `<p class="task-note">${escapeHtml(task.dependencyNote)}</p>` : ""}
      <div class="card-actions">
        ${showActions ? actions : ""}
        ${approvalActions}
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

  document.querySelectorAll("[data-open-detail]").forEach((el) => {
    el.addEventListener("click", () => openTaskDetail(el.dataset.openDetail));
  });

  document.querySelectorAll("[data-approve-task]").forEach((btn) => {
    btn.addEventListener("click", () => approveTask(btn.dataset.approveTask));
  });
  document.querySelectorAll("[data-reject-task]").forEach((btn) => {
    btn.addEventListener("click", () => rejectTask(btn.dataset.rejectTask));
  });
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

// ── Date / format helpers ──────────────────────────────────────────────────

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

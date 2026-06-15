const STORAGE_KEY = "sta-task-hub-state-v1";

const statuses = ["To Do", "In Progress", "Review", "Done"];

const seedState = {
  projectFilter: "all",
  tasks: [
    {
      id: crypto.randomUUID(),
      title: "Confirm launch checklist owners",
      project: "Product Launch",
      owner: "Amaka",
      priority: "High",
      status: "In Progress",
      dueDate: addDays(2),
      updates: [
        {
          author: "Amaka",
          text: "Marketing and training owners are confirmed. Waiting on finance sign-off.",
          createdAt: "Today, 9:10 AM",
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      title: "Resolve blocked onboarding tasks",
      project: "Client Delivery",
      owner: "Tunde",
      priority: "High",
      status: "To Do",
      dueDate: addDays(1),
      updates: [
        {
          author: "Tunde",
          text: "Two client accounts are waiting on access credentials from admin.",
          createdAt: "Yesterday, 4:45 PM",
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      title: "Prepare weekly revenue variance note",
      project: "Finance Ops",
      owner: "Fatima",
      priority: "Medium",
      status: "Review",
      dueDate: addDays(4),
      updates: [
        {
          author: "Fatima",
          text: "Draft is ready. Needs management review before Friday close.",
          createdAt: "Today, 11:25 AM",
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      title: "Publish internal project update format",
      project: "People & Admin",
      owner: "Grace",
      priority: "Low",
      status: "Done",
      dueDate: addDays(-1),
      updates: [
        {
          author: "Grace",
          text: "Template is published and shared with project leads.",
          createdAt: "Monday, 2:05 PM",
        },
      ],
    },
  ],
};

let state = loadState();
let currentView = "dashboard";

const views = {
  dashboard: document.querySelector("#dashboardView"),
  board: document.querySelector("#boardView"),
  projects: document.querySelector("#projectsView"),
  updates: document.querySelector("#updatesView"),
};

const viewTitle = document.querySelector("#viewTitle");
const searchInput = document.querySelector("#searchInput");
const taskModal = document.querySelector("#taskModal");
const taskForm = document.querySelector("#taskForm");
const updateForm = document.querySelector("#updateForm");

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll("[data-project-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.projectFilter = button.dataset.projectFilter;
    saveState();
    render();
  });
});

document.querySelector("#openTaskModal").addEventListener("click", () => {
  document.querySelector("#taskDueDate").value = addDays(3);
  taskModal.showModal();
});

document.querySelector("#closeTaskModal").addEventListener("click", () => taskModal.close());
document.querySelector("#cancelTask").addEventListener("click", () => taskModal.close());
searchInput.addEventListener("input", render);

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = document.querySelector("#taskTitle").value.trim();
  const firstUpdate = document.querySelector("#taskDescription").value.trim();

  state.tasks.unshift({
    id: crypto.randomUUID(),
    title,
    project: document.querySelector("#taskProject").value,
    owner: document.querySelector("#taskOwner").value,
    priority: document.querySelector("#taskPriority").value,
    status: "To Do",
    dueDate: document.querySelector("#taskDueDate").value,
    updates: firstUpdate
      ? [{ author: "You", text: firstUpdate, createdAt: formatNow() }]
      : [],
  });

  taskForm.reset();
  taskModal.close();
  saveState();
  render();
});

updateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const taskId = document.querySelector("#updateTaskSelect").value;
  const text = document.querySelector("#updateText").value.trim();
  if (!text) return;

  const task = state.tasks.find((item) => item.id === taskId);
  task.updates.unshift({ author: "You", text, createdAt: formatNow() });
  document.querySelector("#updateText").value = "";
  saveState();
  render();
});

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return structuredClone(seedState);

  try {
    return JSON.parse(stored);
  } catch {
    return structuredClone(seedState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setView(viewName) {
  currentView = viewName;
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
    const matchesSearch = [task.title, task.project, task.owner, task.priority, task.status]
      .join(" ")
      .toLowerCase()
      .includes(query);
    const matchesProject =
      state.projectFilter === "all" || task.project === state.projectFilter;
    return matchesSearch && matchesProject;
  });
}

function render() {
  renderMetrics();
  renderPriorityTasks();
  renderOwnerLoad();
  renderBoard();
  renderProjects();
  renderUpdates();
  renderProjectFilter();
}

function renderMetrics() {
  const openTasks = state.tasks.filter((task) => task.status !== "Done");
  const dueSoon = openTasks.filter((task) => {
    const days = daysUntil(task.dueDate);
    return days >= 0 && days <= 7;
  });
  const blocked = state.tasks.filter((task) =>
    task.updates.some((update) => update.text.toLowerCase().includes("waiting"))
  );
  const done = state.tasks.filter((task) => task.status === "Done");
  const score = Math.max(40, Math.round(100 - blocked.length * 8 - overdueCount() * 12));

  document.querySelector("#openTasksMetric").textContent = openTasks.length;
  document.querySelector("#dueMetric").textContent = dueSoon.length;
  document.querySelector("#blockedMetric").textContent = blocked.length;
  document.querySelector("#doneMetric").textContent = done.length;
  document.querySelector("#healthScore").textContent = `${score}%`;
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
          <strong>${owner}</strong>
          <div class="bar-track"><div class="bar-fill" style="width: ${(count / max) * 100}%"></div></div>
          <span>${count}</span>
        </div>
      `
    )
    .join("");
}

function renderBoard() {
  const tasks = getFilteredTasks();
  document.querySelector("#kanbanBoard").innerHTML = statuses
    .map((status) => {
      const columnTasks = tasks.filter((task) => task.status === status);
      return `
        <section class="kanban-column">
          <div class="column-title">${status}<span>${columnTasks.length}</span></div>
          <div class="task-list">
            ${
              columnTasks.length
                ? columnTasks.map((task) => taskCard(task, true)).join("")
                : emptyState("Nothing here yet.")
            }
          </div>
        </section>
      `;
    })
    .join("");

  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.tasks.find((item) => item.id === button.dataset.taskId);
      task.status = button.dataset.move;
      task.updates.unshift({
        author: "System",
        text: `Status moved to ${button.dataset.move}.`,
        createdAt: formatNow(),
      });
      saveState();
      render();
    });
  });
}

function renderProjects() {
  const projects = [...new Set(state.tasks.map((task) => task.project))];
  document.querySelector("#projectsGrid").innerHTML = projects
    .map((project) => {
      const tasks = state.tasks.filter((task) => task.project === project);
      const done = tasks.filter((task) => task.status === "Done").length;
      const progress = Math.round((done / tasks.length) * 100);
      const ownerCount = new Set(tasks.map((task) => task.owner)).size;
      return `
        <article class="project-card">
          <div>
            <h2>${project}</h2>
            <p>${tasks.length} tasks · ${ownerCount} owners · ${done} completed</p>
          </div>
          <div class="progress-row">
            <div class="progress-meta"><span>Progress</span><strong>${progress}%</strong></div>
            <div class="bar-track"><div class="bar-fill" style="width: ${progress}%"></div></div>
          </div>
          <div class="task-meta">
            ${statuses
              .map((status) => `<span class="pill">${status}: ${tasks.filter((task) => task.status === status).length}</span>`)
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
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
            <strong>${update.task}</strong>
            <p>${update.text}</p>
            <span class="pill">${update.project}</span>
            <span class="pill">${update.author} · ${update.createdAt}</span>
          </article>
        `
        )
        .join("")
    : emptyState("No updates have been posted yet.");

  document.querySelector("#updateTaskSelect").innerHTML = state.tasks
    .filter((task) => task.status !== "Done")
    .map((task) => `<option value="${task.id}">${task.title}</option>`)
    .join("");
}

function renderProjectFilter() {
  document.querySelectorAll("[data-project-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.projectFilter === state.projectFilter);
  });
}

function taskCard(task, showActions = false) {
  const actions = statuses
    .filter((status) => status !== task.status)
    .map(
      (status) =>
        `<button class="small-button" data-task-id="${task.id}" data-move="${status}" type="button">${status}</button>`
    )
    .join("");

  return `
    <article class="task-card">
      <div>
        <h3>${task.title}</h3>
        <div class="task-meta">
          <span class="pill">${task.project}</span>
          <span class="pill">${task.owner}</span>
          <span class="pill ${task.priority.toLowerCase()}">${task.priority}</span>
        </div>
      </div>
      <div class="task-footer">
        <span class="pill">${task.status}</span>
        <span class="pill">Due ${formatDate(task.dueDate)}</span>
        <span class="pill">${task.updates.length} updates</span>
      </div>
      ${showActions ? `<div class="card-actions">${actions}</div>` : ""}
    </article>
  `;
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
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(`${dateText}T00:00:00`)
  );
}

function formatNow() {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

render();

// js/due-soon-badge.js

// Endpoint returns: { items: [{ aircraft, nextDueDate, ... }, ...] }
window.DUE_SOON_URL =
  "https://dssjr33iy8.execute-api.eu-west-2.amazonaws.com/admin/aircraft-maintenance/due-soon?limit=50";

const DUE_WINDOW_DAYS = 30;

// ---------- Date helpers ----------
function daysUntil(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const d = new Date(dateStr + "T00:00:00"); // local midnight
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ---------- Auth helpers ----------
async function waitForAuthFetch(maxMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (typeof window.authFetch === "function") return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

async function fetchDueSoon() {
  const ok = await waitForAuthFetch();
  if (!ok) return null;

  const res = await window.authFetch(window.DUE_SOON_URL, { method: "GET" });
  if (!res || !res.ok) return null;

  return await res.json(); // { items: [...] }
}

// ---------- Tooltip helper ----------
function setBadgeTooltip(badge, msg) {
  badge.setAttribute("title", msg);
  badge.setAttribute("data-bs-original-title", msg);

  if (!window.bootstrap?.Tooltip) return;

  const inst = bootstrap.Tooltip.getInstance(badge);
  if (inst) {
    try {
      inst.setContent({ ".tooltip-inner": msg });
    } catch {
      inst.dispose();
      new bootstrap.Tooltip(badge);
    }
  } else {
    new bootstrap.Tooltip(badge);
  }
}

// ---------- Paint ----------
function paintBadge(count, worstDays) {
  const badge = document.getElementById("dueSoonBadge");
  if (!badge) return;

  if (!count || count <= 0) {
    badge.classList.add("d-none");
    badge.textContent = "0";
    badge.classList.remove("bg-danger", "bg-warning", "bg-success");
    badge.removeAttribute("title");
    badge.removeAttribute("data-bs-original-title");
    const inst = window.bootstrap?.Tooltip?.getInstance?.(badge);
    if (inst) inst.dispose();
    return;
  }

  badge.classList.remove("d-none");
  badge.textContent = String(count);

  badge.classList.remove("bg-danger", "bg-warning", "bg-success");

  let msg = "";
  if (worstDays <= 0) {
    badge.classList.add("bg-danger");
    msg = `${count} aircraft overdue for maintenance`;
  } else if (worstDays <= 7) {
    badge.classList.add("bg-danger");
    msg = `${count} aircraft due within 7 days`;
  } else if (worstDays <= DUE_WINDOW_DAYS) {
    badge.classList.add("bg-warning");
    msg = `${count} aircraft due within ${DUE_WINDOW_DAYS} days`;
  } else {
    badge.classList.add("bg-success");
    msg = `${count} upcoming maintenance items`;
  }

  setBadgeTooltip(badge, msg);
}

// ---------- Core update ----------
async function updateDueSoonBadge() {
  // Only show badge if Admin menu exists AND is visible
  const adminMenu = document.getElementById("adminMenu");
  if (!adminMenu || adminMenu.classList.contains("d-none")) return { status: "not-ready" };

  const data = await fetchDueSoon();
  if (!data?.items || !Array.isArray(data.items)) return { status: "not-ready" };

  let count = 0;
  let worstDays = Infinity;

  for (const it of data.items) {
    const d = daysUntil(it.nextDueDate);
    if (d === null) continue;

    if (d <= DUE_WINDOW_DAYS) {
      count += 1;
      if (d < worstDays) worstDays = d;
    }
  }

  if (count === 0) {
    paintBadge(0, Infinity);
    return { status: "ok" };
  }

  paintBadge(count, worstDays);
  return { status: "ok" };
}

// ---------- Click wiring ----------
function wireBadgeClick() {
  const badge = document.getElementById("dueSoonBadge");
  if (!badge) return;

  if (badge.dataset.wired === "1") return;
  badge.dataset.wired = "1";

  badge.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  badge.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = "admin-due-soon.html";
  });

  badge.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = "admin-due-soon.html";
    }
  });
}

// ---------- Bootstrap retry (fixes the “badge appears late”) ----------
let bootstrapRetryTimer = null;
let periodicTimer = null;

function clearBootstrapRetry() {
  if (bootstrapRetryTimer) {
    clearTimeout(bootstrapRetryTimer);
    bootstrapRetryTimer = null;
  }
}

async function bootstrapUpdateLoop(maxMs = 10000) {
  clearBootstrapRetry();

  const start = Date.now();
  let delay = 150;

  const tick = async () => {
    try {
      wireBadgeClick();

      const res = await updateDueSoonBadge();
      if (res?.status === "ok") return; // ✅ done

      // not ready yet: keep trying (with backoff) until maxMs
      if (Date.now() - start >= maxMs) return;

      delay = Math.min(Math.floor(delay * 1.35), 1200);
      bootstrapRetryTimer = setTimeout(tick, delay);
    } catch (e) {
      console.error(e);
      if (Date.now() - start >= maxMs) return;
      delay = Math.min(Math.floor(delay * 1.35), 1200);
      bootstrapRetryTimer = setTimeout(tick, delay);
    }
  };

  tick();
}

function ensurePeriodicRefresh() {
  if (periodicTimer) return;
  periodicTimer = setInterval(() => updateDueSoonBadge().catch(console.error), 5 * 60 * 1000);
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  // Might not have navbar yet, but harmless
  wireBadgeClick();
  bootstrapUpdateLoop(10000);
  ensurePeriodicRefresh();
});

window.addEventListener("navbar:loaded", () => {
  wireBadgeClick();
  bootstrapUpdateLoop(10000);
  ensurePeriodicRefresh();
});

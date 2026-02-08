// js/due-soon-badge.js

// Endpoint returns: { items: [{ aircraft, nextDueDate, ... }, ...] }
window.DUE_SOON_URL =
  "https://dssjr33iy8.execute-api.eu-west-2.amazonaws.com/admin/aircraft-maintenance/due-soon?limit=50";

const DUE_WINDOW_DAYS = 30;

// ---------- Date helpers ----------
function daysUntil(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;

  // Expect YYYY-MM-DD; use local midnight to avoid UTC/local off-by-one weirdness
  const d = new Date(dateStr + "T00:00:00");
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
    // Bootstrap 5.3 supports setContent
    try {
      inst.setContent({ ".tooltip-inner": msg });
    } catch {
      // fallback: recreate
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

  // Hide if nothing due
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

  // Show badge
  badge.classList.remove("d-none");
  badge.textContent = String(count);

  // Reset colours
  badge.classList.remove("bg-danger", "bg-warning", "bg-success");

  // Colour + tooltip logic
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
  if (!adminMenu || adminMenu.classList.contains("d-none")) return;

  const data = await fetchDueSoon();
  if (!data?.items || !Array.isArray(data.items)) return;

  // Count only items due within window (or overdue)
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
    return;
  }

  paintBadge(count, worstDays);
}

// ---------- Click wiring ----------
function wireBadgeClick() {
  const badge = document.getElementById("dueSoonBadge");
  if (!badge) return;

  // Avoid double-binding if called multiple times
  if (badge.dataset.wired === "1") return;
  badge.dataset.wired = "1";

  // Some browsers toggle dropdown on mousedown; stop it early
  badge.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  badge.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation(); // don’t toggle dropdown
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

// ---------- Scheduling ----------
// We run on DOMContentLoaded and on navbar:loaded.
// Also re-run shortly after navbar inject to allow adminMenu to be revealed by setupAdminMenu.
function scheduleBadgeUpdate() {
  updateDueSoonBadge().catch(console.error);
  setTimeout(() => updateDueSoonBadge().catch(console.error), 400);
}

document.addEventListener("DOMContentLoaded", () => {
  wireBadgeClick();
  scheduleBadgeUpdate();
});

window.addEventListener("navbar:loaded", () => {
  wireBadgeClick();
  scheduleBadgeUpdate();
});

// Optional periodic refresh (5 minutes)
setInterval(() => updateDueSoonBadge().catch(console.error), 5 * 60 * 1000);

window.DUE_SOON_URL = "https://dssjr33iy8.execute-api.eu-west-2.amazonaws.com/admin/aircraft-maintenance/due-soon?limit=50";
 
const DUE_WINDOW_DAYS = 30;

function daysUntil(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  // dateStr is YYYY-MM-DD
  const d = new Date(dateStr + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

async function waitForToken(maxMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const t = localStorage.getItem("access_token");
    if (t) return t;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function fetchDueSoon() {
  const token = await waitForToken();
  if (!token) return null;

  const res = await fetch(DUE_SOON_URL, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) return null;
  return await res.json(); // expects { items: [...] }
}

function paintBadge(count, worstDays) {
  const badge = document.getElementById("dueSoonBadge");
  if (!badge) return;

  // Hide if nothing due
  if (!count || count <= 0) {
    badge.classList.add("d-none");
    badge.textContent = "0";
    badge.classList.remove("bg-danger", "bg-warning", "bg-success");
    badge.removeAttribute("title");
    return;
  }

  // Show badge
  badge.classList.remove("d-none");
  badge.textContent = String(count);

  // Reset colours
  badge.classList.remove("bg-danger", "bg-warning", "bg-success");

  // Colour + tooltip logic
  if (worstDays <= 0) {
    badge.classList.add("bg-danger");
    badge.setAttribute(
      "title",
      `${count} aircraft overdue for maintenance`
    );
  } else if (worstDays <= 7) {
    badge.classList.add("bg-danger");
    badge.setAttribute(
      "title",
      `${count} aircraft due within 7 days`
    );
  } else if (worstDays <= DUE_WINDOW_DAYS) {
    badge.classList.add("bg-warning");
    badge.setAttribute(
      "title",
      `${count} aircraft due within ${DUE_WINDOW_DAYS} days`
    );
  } else {
    badge.classList.add("bg-success");
    badge.setAttribute(
      "title",
      `${count} upcoming maintenance items`
    );
  }
}



async function updateDueSoonBadge() {
  // Only show badge if Admin menu exists AND is visible
  const adminMenu = document.getElementById("adminMenu");
  if (!adminMenu || adminMenu.classList.contains("d-none")) return;

  const data = await fetchDueSoon();
  if (!data?.items) return;

  // Count only items due within window (or overdue)
  let count = 0;
  let worstDays = 999999;

  for (const it of data.items) {
    const d = daysUntil(it.nextDueDate);
    if (d === null) continue;

    if (d <= DUE_WINDOW_DAYS) {
      count += 1;
      if (d < worstDays) worstDays = d;
    }
  }

  // If nothing is within 30 days, hide badge (or show green if you prefer)
  if (count === 0) {
    paintBadge(0, 999999);
    return;
  }

  paintBadge(count, worstDays);
}

// Run on load and whenever navbar is injected
document.addEventListener("DOMContentLoaded", updateDueSoonBadge);
window.addEventListener("navbar:loaded", updateDueSoonBadge);

// Optional: refresh every 5 minutes while page is open
setInterval(updateDueSoonBadge, 5 * 60 * 1000);



function wireBadgeClick() {
  const badge = document.getElementById("dueSoonBadge");
  if (!badge) return;

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

window.addEventListener("navbar:loaded", wireBadgeClick);
document.addEventListener("DOMContentLoaded", wireBadgeClick);



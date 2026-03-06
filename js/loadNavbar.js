// js/loadNavbar.js

async function loadNavbar() {
  try {
    const res = await fetch("/partials/navbar.html");
    if (!res.ok) throw new Error("Failed to load navbar.html");

    const html = await res.text();
    const mount = document.getElementById("navbar-placeholder");
    if (!mount) return;

    mount.innerHTML = html;

    // Show logged in username
    const userEl = document.getElementById("loggedInUser");
    if (userEl) {
      userEl.textContent = localStorage.getItem("username") || "User";
    }

    const currentPath = window.location.pathname.replace(/\/$/, "");

    // Only process actual anchor nav links
    document.querySelectorAll("a.nav-link[href]").forEach(link => {
      const rawHref = link.getAttribute("href");

      if (!rawHref || rawHref === "#" || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) {
        return;
      }

      try {
        const linkPath = new URL(rawHref, window.location.href).pathname.replace(/\/$/, "");
        if (linkPath === currentPath) {
          link.classList.add("active");
          link.setAttribute("aria-current", "page");
        }
      } catch (err) {
        console.warn("Skipping invalid nav link:", rawHref, err);
      }
    });

    // Only process actual anchor dropdown items
    document.querySelectorAll("a.dropdown-item[href]").forEach(item => {
      const rawHref = item.getAttribute("href");

      if (!rawHref || rawHref === "#" || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) {
        return;
      }

      try {
        const itemPath = new URL(rawHref, window.location.href).pathname.replace(/\/$/, "");

        if (itemPath === currentPath) {
          item.classList.add("active");

          const dropdown = item.closest(".dropdown");
          const toggle = dropdown?.querySelector("a.nav-link.dropdown-toggle");
          if (toggle) {
            toggle.classList.add("active");
            toggle.setAttribute("aria-current", "page");
          }
        }
      } catch (err) {
        console.warn("Skipping invalid dropdown item:", rawHref, err);
      }
    });

    if (window.setupAdminMenu) {
      await window.setupAdminMenu();
    }

    if (window.bootstrap) {
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
        new bootstrap.Tooltip(el);
      });
    }

    window.dispatchEvent(new Event("navbar:loaded"));
  } catch (err) {
    console.error("Navbar load failed:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadNavbar);
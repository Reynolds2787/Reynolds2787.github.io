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

    // Highlight current page safely
    const currentPath = window.location.pathname.replace(/\/$/, "");

    // Top-level nav links
    document.querySelectorAll(".nav-link").forEach(link => {
      const rawHref = link.getAttribute("href");

      // Ignore dropdown toggles and placeholder links
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
        console.warn("Skipping invalid nav-link href:", rawHref, err);
      }
    });

    // Dropdown items
    document.querySelectorAll(".dropdown-item").forEach(item => {
      const rawHref = item.getAttribute("href");
      if (!rawHref || rawHref === "#" || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) {
        return;
      }

      try {
        const itemPath = new URL(rawHref, window.location.href).pathname.replace(/\/$/, "");
        if (itemPath === currentPath) {
          item.classList.add("active");

          // Also highlight parent dropdown toggle
          const dropdown = item.closest(".dropdown");
          const toggle = dropdown?.querySelector(".nav-link.dropdown-toggle");
          if (toggle) {
            toggle.classList.add("active");
            toggle.setAttribute("aria-current", "page");
          }
        }
      } catch (err) {
        console.warn("Skipping invalid dropdown-item href:", rawHref, err);
      }
    });

    // Reveal admin menu if allowed
    if (window.setupAdminMenu) {
      await window.setupAdminMenu();
    }

    // Enable tooltips inside navbar
    if (window.bootstrap) {
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
        new bootstrap.Tooltip(el);
      });
    }

    // Notify page scripts that navbar is ready
    window.dispatchEvent(new Event("navbar:loaded"));

  } catch (err) {
    console.error("Navbar load failed:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadNavbar);
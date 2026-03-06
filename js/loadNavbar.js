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

    document.querySelectorAll(".nav-link").forEach(link => {
      const rawHref = link.getAttribute("href");

      if (!rawHref || rawHref === "#" || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) {
        return;
      }

      try {
        const linkPath = new URL(rawHref, window.location.origin).pathname.replace(/\/$/, "");
        if (linkPath === currentPath) {
          link.classList.add("active");
          link.setAttribute("aria-current", "page");
        }
      } catch (err) {
        console.warn("Skipping invalid nav link:", rawHref, err);
      }
    });

    // Enable admin menu
    if (window.setupAdminMenu) {
      await window.setupAdminMenu();
    }

    // Enable bootstrap tooltips inside navbar
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
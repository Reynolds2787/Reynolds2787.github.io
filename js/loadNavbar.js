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

    // Highlight current page
    const currentPath = window.location.pathname.replace(/\/$/, "");
    document.querySelectorAll(".nav-link").forEach(link => {
      const linkPath = new URL(link.href).pathname.replace(/\/$/, "");
      if (linkPath === currentPath) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
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

    // Notify page navbar is ready
    window.dispatchEvent(new Event("navbar:loaded"));

  } catch (err) {
    console.error("Navbar load failed:", err);
  }
}

// Run automatically when DOM is ready
document.addEventListener("DOMContentLoaded", loadNavbar);
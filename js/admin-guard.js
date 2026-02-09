const PROFILE_URL = "https://hwjx5fihi5.execute-api.eu-west-2.amazonaws.com/profile";

// Wait for authFetch to exist (auth.js may still be loading)
async function waitForAuthFetch(maxMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (typeof window.authFetch === "function") return true;
    await new Promise(r => setTimeout(r, 80));
  }
  return false;
}

// --- Simple in-memory cache to avoid repeated profile GETs ---
let _profileCache = null;
let _profileCacheAt = 0;
const PROFILE_CACHE_MS = 30_000;

async function fetchUserProfile({ force = false } = {}) {
  const now = Date.now();
  if (!force && _profileCache && (now - _profileCacheAt) < PROFILE_CACHE_MS) {
    return _profileCache;
  }

  const ok = await waitForAuthFetch();
  if (!ok) return null;

  const res = await window.authFetch(PROFILE_URL, { method: "GET" });
  if (!res || !res.ok) return null;

  const profile = await res.json();
  _profileCache = profile;
  _profileCacheAt = Date.now();
  return profile;
}

window.isAdminUser = async function () {
  const profile = await fetchUserProfile();
  return (profile?.role || "").toLowerCase() === "admin";
};

// Helper to broadcast state consistently
function dispatchAdminReady(isAdmin, reason = "") {
  window.dispatchEvent(
    new CustomEvent("admin:ready", { detail: { isAdmin: !!isAdmin, reason } })
  );
}

window.setupAdminMenu = async function () {
  const adminMenu = document.getElementById("adminMenu");
  if (!adminMenu) {
    // navbar not injected yet
    dispatchAdminReady(false, "adminMenu-missing");
    return;
  }

  // Default hidden until confirmed admin (prevents flashing)
  adminMenu.classList.add("d-none");

  const start = Date.now();
  let delay = 200;

  while (Date.now() - start < 10_000) { // try for up to 10s
    try {
      const ok = await window.isAdminUser();
      if (ok) {
        adminMenu.classList.remove("d-none");
        dispatchAdminReady(true, "confirmed");
        return;
      }
    } catch (e) {
      console.error("setupAdminMenu error:", e);
    }

    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(Math.floor(delay * 1.4), 1200);
  }

  // Not admin (or couldn't confirm in time) -> remain hidden, but still signal ready
  dispatchAdminReady(false, "not-admin-or-timeout");
};

// Run on normal load
document.addEventListener("DOMContentLoaded", () => window.setupAdminMenu());

// Also run when navbar is injected
window.addEventListener("navbar:loaded", () => window.setupAdminMenu());

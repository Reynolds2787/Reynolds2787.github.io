const PROFILE_URL = "https://hwjx5fihi5.execute-api.eu-west-2.amazonaws.com/profile";

// Wait for authFetch to exist (auth.js may still be loading)
async function waitForAuthFetch(maxMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (typeof window.authFetch === "function") return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

async function fetchUserProfile() {
  // Ensure auth.js is ready so we get refresh-on-expiry behaviour
  const ok = await waitForAuthFetch();
  if (!ok) return null;

  const res = await window.authFetch(PROFILE_URL, { method: "GET" });
  if (!res || !res.ok) return null;

  return await res.json();
}

window.isAdminUser = async function () {
  const profile = await fetchUserProfile();
  return (profile?.role || "").toLowerCase() === "admin";
};

window.setupAdminMenu = async function () {
  const adminMenu = document.getElementById("adminMenu");
  if (!adminMenu) return;

  // Default hidden until confirmed admin (prevents flashing)
  adminMenu.classList.add("d-none");

  // Retry a couple times while auth/nav settles
  for (let i = 0; i < 3; i++) {
    const ok = await window.isAdminUser();
    if (ok) {
      adminMenu.classList.remove("d-none");
      window.dispatchEvent(new Event("admin:ready"));
      return;
      
    }
    await new Promise(r => setTimeout(r, 250));
  }
};

// Run on normal load
document.addEventListener("DOMContentLoaded", window.setupAdminMenu);

// Also run when navbar is injected
window.addEventListener("navbar:loaded", window.setupAdminMenu);

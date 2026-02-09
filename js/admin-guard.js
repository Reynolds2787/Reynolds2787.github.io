const PROFILE_URL = "https://hwjx5fihi5.execute-api.eu-west-2.amazonaws.com/profile";

// Wait for access_token to appear (auth.js may still be finishing)
async function waitForToken(maxMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const t = localStorage.getItem("access_token");
    if (t) return t;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

async function fetchUserProfile() {
  const token = await waitForToken();
  if (!token) return null;

  const res = await fetch(PROFILE_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) return null;
  return await res.json();
}

window.isAdminUser = async function () {
  const profile = await fetchUserProfile();
  return (profile?.role || "").toLowerCase() === "admin";
};

window.setupAdminMenu = async function () {
  const adminMenu = document.getElementById("adminMenu");
  if (!adminMenu) return;

  // retry a couple times in case profile endpoint is temporarily 401 while auth settles
  for (let i = 0; i < 3; i++) {
    const ok = await window.isAdminUser();
    if (ok) {
      adminMenu.classList.remove("d-none");
      return;
    }
    await new Promise(r => setTimeout(r, 250));
  }
};

// Run on normal load
document.addEventListener("DOMContentLoaded", window.setupAdminMenu);

// Also run when navbar is injected
window.addEventListener("navbar:loaded", window.setupAdminMenu);

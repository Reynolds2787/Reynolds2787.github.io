// /js/admin-guard.js

const PROFILE_URL = "https://hwjx5fihi5.execute-api.eu-west-2.amazonaws.com/profile";

async function fetchUserProfile() {
  const token = localStorage.getItem("access_token");
  if (!token) return null;

  const res = await fetch(PROFILE_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) return null;
  return await res.json();
}

// Expose globally so admin pages can call it
window.isAdminUser = async function isAdminUser() {
  const profile = await fetchUserProfile();
  return (profile?.role || "").toLowerCase() === "admin";
};

window.setupAdminMenu = async function setupAdminMenu() {
  const adminMenu = document.getElementById("adminMenu");
  if (!adminMenu) return;

  const isAdmin = await window.isAdminUser();
  if (isAdmin) adminMenu.classList.remove("d-none");
};

document.addEventListener("DOMContentLoaded", window.setupAdminMenu);

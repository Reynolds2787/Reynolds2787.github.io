// js/admin-guard.js

async function getAccessToken() {
  return localStorage.getItem("access_token"); // adjust if you store elsewhere
}

async function fetchUserProfile() {
  // IMPORTANT: replace with your real endpoint that returns user profile
  // e.g. https://api.efmapp.co.uk/profile
  const PROFILE_URL = "https://hwjx5fihi5.execute-api.eu-west-2.amazonaws.com/profile";

  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch(PROFILE_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) return null;
  return await res.json();
}

async function isAdminUser() {
  const profile = await fetchUserProfile();
  // Expecting something like { isAdmin: true } in the returned profile
  return !!profile?.isAdmin;
}

async function setupAdminMenu() {
  const adminMenu = document.getElementById("adminMenu");
  if (!adminMenu) return;

  const admin = await isAdminUser();
  if (admin) adminMenu.classList.remove("d-none");
}

document.addEventListener("DOMContentLoaded", setupAdminMenu);

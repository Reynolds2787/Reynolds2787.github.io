document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  const userEl = document.getElementById("loggedInUser");

  if (userEl) {
    userEl.textContent = localStorage.getItem("username") || "User";
  }

  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();

    localStorage.removeItem("access_token");
    localStorage.removeItem("id_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("username");

    window.location.href = "https://efmapp.co.uk/"
  });
  
});

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

    window.location.href =
      "https://eu-west-2gytf1n6yk.auth.eu-west-2.amazoncognito.com/logout" +
      "?client_id=r3kibut2khk4blk1mj7ti9c6p" +
      "&logout_uri=" + encodeURIComponent("https://efmapp.co.uk/");
  });
});

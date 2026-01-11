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
      "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_6tjf0zBnC" +
      "?client_id=63ag0fj4bpqi4ouvat8bsc0890" +
      "&logout_uri=" + encodeURIComponent("https://efmapp.co.uk/");
  });
});

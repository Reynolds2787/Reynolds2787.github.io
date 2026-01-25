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

    const COGNITO_DOMAIN =
      "https://eu-west-26tjf0zbnc.auth.eu-west-2.amazoncognito.com";
    const CLIENT_ID = "63ag0fj4bpqi4ouvat8bsc0890";

    const logoutUrl =
      `${COGNITO_DOMAIN}/logout` +
      `?client_id=${CLIENT_ID}` +
      `&logout_uri=${encodeURIComponent(window.location.origin)}`;

    window.location.href = logoutUrl;
  });
});


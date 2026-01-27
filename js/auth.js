(async function () {
  const COGNITO_DOMAIN = "https://eu-west-26tjf0zbnc.auth.eu-west-2.amazoncognito.com";
  const CLIENT_ID = "63ag0fj4bpqi4ouvat8bsc0890";
  const REDIRECT_URI = window.location.origin + "/";

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  // ===============================
  // Helpers
  // ===============================
  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  function isTokenExpired() {
    const expiry = parseInt(localStorage.getItem("token_expiry"), 10);
    return !expiry || expiry <= nowSeconds();
  }

  // ===============================
  // 1️⃣ Exchange authorization code
  // ===============================
  if (code && !localStorage.getItem("access_token")) {
    try {
      const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          code
        })
      });

      const tokens = await res.json();

      if (!res.ok) {
        console.error("Token endpoint error:", tokens);
        return;
      }

      localStorage.setItem("access_token", tokens.access_token);
      localStorage.setItem("id_token", tokens.id_token);
      localStorage.setItem("refresh_token", tokens.refresh_token || "");

      // ⏱ Track expiry
      localStorage.setItem(
        "token_expiry",
        nowSeconds() + tokens.expires_in
      );

      // Decode ID token for username
      const payload = JSON.parse(atob(tokens.id_token.split(".")[1]));
      localStorage.setItem(
        "username",
        payload.name || payload.email || "User"
      );

      window.history.replaceState({}, document.title, window.location.pathname);

    } catch (err) {
      console.error("Token exchange failed:", err);
      return;
    }
  }

  // ===============================
  // 2️⃣ Enforce login
  // ===============================
  if (!code && !localStorage.getItem("access_token")) {
    window.location.href =
      `${COGNITO_DOMAIN}/login` +
      `?client_id=${CLIENT_ID}` +
      `&response_type=code` +
      `&scope=openid+email+profile` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  }

  // ===============================
  // 3️⃣ Refresh session
  // ===============================
  async function refreshSession() {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) throw new Error("No refresh token");

    const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        refresh_token: refreshToken
      })
    });

    const tokens = await res.json();
    if (!res.ok) throw new Error("Refresh failed");

    localStorage.setItem("access_token", tokens.access_token);
    if (tokens.id_token) {
      localStorage.setItem("id_token", tokens.id_token);
    }

    localStorage.setItem(
      "token_expiry",
      nowSeconds() + tokens.expires_in
    );
  }

  // ===============================
  // 4️⃣ Safe fetch wrapper (IMPORTANT)
  // ===============================
  window.authFetch = async function (url, options = {}) {
    if (isTokenExpired()) {
      try {
        await refreshSession();
      } catch {
        window.location.href = "login.html";
        return;
      }
    }

    const token = localStorage.getItem("access_token");
    //const token = localStorage.getItem("id_token");


    let res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });

    if (res.status === 401) {
      await refreshSession();

      const newToken = localStorage.getItem("access_token");
      res = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`
        }
      });
    }

    return res;
  };

function renderLoggedInUser() {
  const el = document.getElementById("loggedInUser");
  if (!el) return;

  // Use whatever you already store (examples below)
  const name =
    localStorage.getItem("username") ||
    "User";

  el.textContent = name;
}

// run normally
document.addEventListener("DOMContentLoaded", renderLoggedInUser);

// run again after navbar is injected
window.addEventListener("navbar:loaded", renderLoggedInUser);


})();




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

  // URL-safe base64 decode for JWT payloads
  function decodeJwtPayload(token) {
    if (!token) return null;
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(base64)
          .split("")
          .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function getDisplayNameFromIdToken() {
    const idToken = localStorage.getItem("id_token");
    const payload = decodeJwtPayload(idToken);
    if (!payload) return null;

    return (
      payload.name ||
      payload.given_name ||
      payload.email ||
      payload["cognito:username"] ||
      null
    );
  }

  function setStoredUsernameFromIdToken() {
    const name = getDisplayNameFromIdToken();
    if (name) localStorage.setItem("username", name);
  }

  function renderLoggedInUser() {
    const el = document.getElementById("loggedInUser");
    if (!el) return;

    // Prefer fresh token-derived name, fallback to stored, then default.
    const name =
      getDisplayNameFromIdToken() ||
      localStorage.getItem("username") ||
      "User";

    el.textContent = name;
  }

  function redirectToHostedLogin() {
    window.location.href =
      `${COGNITO_DOMAIN}/login` +
      `?client_id=${CLIENT_ID}` +
      `&response_type=code` +
      `&scope=openid+email+profile` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
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
      localStorage.setItem("token_expiry", nowSeconds() + tokens.expires_in);

      // Store & render username
      setStoredUsernameFromIdToken();
      renderLoggedInUser();

      // Clean URL
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
    redirectToHostedLogin();
    return;
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

    // If Cognito returns a new id_token, store it and refresh displayed name
    if (tokens.id_token) {
      localStorage.setItem("id_token", tokens.id_token);
      setStoredUsernameFromIdToken();
    }

    localStorage.setItem("token_expiry", nowSeconds() + tokens.expires_in);

    // In case navbar is present, update it
    renderLoggedInUser();
  }

  // ===============================
  // 4️⃣ Safe fetch wrapper (IMPORTANT)
  // ===============================
  window.authFetch = async function (url, options = {}) {
    if (isTokenExpired()) {
      try {
        await refreshSession();
      } catch (e) {
        console.warn("Session refresh failed:", e);
        redirectToHostedLogin();
        return;
      }
    }

    const token = localStorage.getItem("access_token");

    let res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });

    if (res.status === 401) {
      try {
        await refreshSession();
      } catch (e) {
        console.warn("401 then refresh failed:", e);
        redirectToHostedLogin();
        return res;
      }

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

  // ===============================
  // 5️⃣ Navbar user display hooks
  // ===============================
  document.addEventListener("DOMContentLoaded", renderLoggedInUser);
  window.addEventListener("navbar:loaded", renderLoggedInUser);
})();

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

  // Read exp from the token itself (more reliable than localStorage expiry)
  function isJwtExpired(token, skewSeconds = 30) {
    const payload = decodeJwtPayload(token);
    if (!payload?.exp) return true;
    return (payload.exp - skewSeconds) <= nowSeconds();
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

  function clearSession() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("id_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("username");
    localStorage.removeItem("token_expiry"); // legacy
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

      // Only store refresh token if present (don’t store "")
      if (tokens.refresh_token) {
        localStorage.setItem("refresh_token", tokens.refresh_token);
      }

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
  // We require at least an access token to proceed
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
        // (Optional) If you ever find Cognito not returning id_token on refresh,
        // you can try adding: scope: "openid+email+profile"
      })
    });

    const tokens = await res.json();
    if (!res.ok) throw new Error(tokens?.error || "Refresh failed");

    if (tokens.access_token) localStorage.setItem("access_token", tokens.access_token);

    // IMPORTANT: update ID token whenever Cognito provides it
    if (tokens.id_token) {
      localStorage.setItem("id_token", tokens.id_token);
      setStoredUsernameFromIdToken();
    }

    // Refresh token rotation (only if returned)
    if (tokens.refresh_token) {
      localStorage.setItem("refresh_token", tokens.refresh_token);
    }

    renderLoggedInUser();
  }

  // Ensure we have a *fresh ID token* for UI (admin menu/group checks)
  async function ensureFreshIdToken() {
    const idToken = localStorage.getItem("id_token");
    if (!idToken || isJwtExpired(idToken)) {
      await refreshSession();
    }
  }

  // ===============================
  // 4️⃣ Safe fetch wrapper
  // ===============================
  window.authFetch = async function (url, options = {}) {
    const accessToken = localStorage.getItem("access_token");

    // Refresh if access token is expired
    if (!accessToken || isJwtExpired(accessToken)) {
      try {
        await refreshSession();
      } catch (e) {
        console.warn("Session refresh failed:", e);
        clearSession();
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

    // If API rejects, refresh and retry once
    if (res.status === 401) {
      try {
        await refreshSession();
      } catch (e) {
        console.warn("401 then refresh failed:", e);
        clearSession();
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
  // 5️⃣ Navbar hooks
  // ===============================
  async function navbarAuthSync() {
    try {
      // Make sure ID token is fresh so admin/group logic doesn’t “randomly” fail
      await ensureFreshIdToken();
    } catch (e) {
      console.warn("Navbar token sync failed:", e);
      // Don’t hard-redirect here unless you want navbar load to force re-login
      // If you do, uncomment:
      // clearSession();
      // redirectToHostedLogin();
    }
    renderLoggedInUser();
  }

  document.addEventListener("DOMContentLoaded", navbarAuthSync);
  window.addEventListener("navbar:loaded", navbarAuthSync);
})();

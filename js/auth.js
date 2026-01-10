(async function () {
  const COGNITO_DOMAIN = "https://eu-west-2gytf1n6yk.auth.eu-west-2.amazoncognito.com";
  const CLIENT_ID = "r3kibut2khk4blk1mj7ti9c6p";
  const REDIRECT_URI = window.location.origin + "/";


  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  // 🔁 Exchange auth code for tokens (once)
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

      if (!tokens.access_token) {
      console.error("Token response invalid", tokens);
      return;
        }

      localStorage.setItem("access_token", tokens.access_token);
      localStorage.setItem("id_token", tokens.id_token);
      localStorage.setItem("refresh_token", tokens.refresh_token);

      const payload = JSON.parse(atob(tokens.id_token.split(".")[1]));
      localStorage.setItem(
        "username",
        payload.name || payload.email || "User"
      );

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      console.error("Token exchange failed", err);
    }
  }

      // 🔒 Enforce login (ONLY if no code AND no token)
      if (!code && !localStorage.getItem("access_token")) {
        window.location.href =
          `${COGNITO_DOMAIN}/login` +
          `?client_id=${CLIENT_ID}` +
          `&response_type=code` +
          `&scope=openid+email+profile` +
          `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
      }

})();


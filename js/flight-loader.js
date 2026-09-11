// Shared Lottie lifecycle for Flight Log Stats and My Flights.
(() => {
  "use strict";
  const controllers = new Map();
  let suspended = false;

  function createController(loader) {
    const artwork = loader.querySelector(".flight-loader-art");
    const container = loader.querySelector(".flight-loader-lottie");
    if (!container || !artwork) return null;
    let busy = false;
    let ready = false;
    let animation = null;

    function sync() {
      if (!ready || !animation) return;
      if (busy && !document.hidden && !suspended) {
        animation.play();
      } else {
        animation.pause();
      }
    }

    const controller = { setBusy(value) { busy = Boolean(value); sync(); }, sync };
    controllers.set(loader, controller);
    sync();

    // The existing icon and loading text remain if the player or JSON fails.
    if (!window.lottie) return controller;
    try {
      animation = window.lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: true,
        autoplay: false,
        path: "/images/animations/airplane.json?v=1",
        rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: false }
      });
      animation.addEventListener("DOMLoaded", () => {
        ready = true;
        artwork.classList.add("is-ready");
        sync();
      });
      const showFallback = () => {
        ready = false;
        artwork.classList.remove("is-ready");
        animation?.pause();
      };
      animation.addEventListener("data_failed", showFallback);
      animation.addEventListener("error", showFallback);
    } catch (error) {
      console.warn("Loading animation unavailable:", error);
    }
    return controller;
  }

  window.updateFlightLoader = (loader, isBusy) => {
    if (!loader) return;
    const controller = controllers.get(loader) || createController(loader);
    controller?.setBusy(isBusy);
  };
  document.querySelectorAll(".stats-loader").forEach(createController);
  const syncAll = () => controllers.forEach(controller => controller.sync());
  document.addEventListener("visibilitychange", syncAll);
  window.addEventListener("pagehide", () => { suspended = true; syncAll(); });
  window.addEventListener("pageshow", () => { suspended = false; syncAll(); });
})();

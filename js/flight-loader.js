// Use a timer-driven, indeterminate bar on phones. It does not depend on CSS
// keyframe playback and never presents a made-up completion percentage.
(() => {
  "use strict";
  const phoneWidth = window.matchMedia("(max-width: 767.98px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isIPhone = /iPhone|iPod/i.test(navigator.userAgent);
  const controllers = new Map();

  function createController(loader) {
    const fill = loader.querySelector(".flight-loading-bar-fill");
    if (!fill) return null;
    let busy = false;
    let timer = null;
    let startedAt = 0;

    function paint() {
      const phase = (Date.now() - startedAt) / 2400 * Math.PI * 2;
      const wave = (1 - Math.cos(phase)) / 2;
      // Reduced motion uses only a soft fade, with no movement across the bar.
      fill.style.left = reducedMotion.matches ? "0%" : `${wave * 68}%`;
      fill.style.width = reducedMotion.matches ? "100%" : "32%";
      fill.style.opacity = reducedMotion.matches ? String(.45 + wave * .35) : "1";
    }

    function sync() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      const useBar = isIPhone || phoneWidth.matches;
      loader.classList.toggle("stats-loader--bar", useBar);
      if (!busy || !useBar) return;
      startedAt = Date.now();
      paint();
      if (!document.hidden) timer = window.setInterval(paint, 50);
    }

    const controller = {
      setBusy(value) { busy = Boolean(value); sync(); },
      sync,
      stop() {
        if (timer !== null) window.clearInterval(timer);
        timer = null;
      }
    };
    controllers.set(loader, controller);
    sync();
    return controller;
  }

  window.updateFlightLoader = (loader, isBusy) => {
    if (!loader) return;
    const controller = controllers.get(loader) || createController(loader);
    controller?.setBusy(isBusy);
  };

  document.querySelectorAll(".stats-loader").forEach(createController);
  const syncAll = () => controllers.forEach(controller => controller.sync());
  // Older iOS versions expose addListener rather than addEventListener here.
  [phoneWidth, reducedMotion].forEach(query => {
    if (query.addEventListener) query.addEventListener("change", syncAll);
    else query.addListener(syncAll);
  });
  document.addEventListener("visibilitychange", syncAll);
  window.addEventListener("pagehide", () => controllers.forEach(controller => controller.stop()));
  window.addEventListener("pageshow", syncAll);
})();

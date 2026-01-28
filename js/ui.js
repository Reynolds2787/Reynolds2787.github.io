// ui.js - small shared UI helpers (loading state, button spinners, toasts)
/* global bootstrap */
(function () {
  "use strict";

  function ensureToastContainer() {
    let c = document.getElementById("toastContainer");
    if (!c) {
      c = document.createElement("div");
      c.id = "toastContainer";
      c.className = "toast-container position-fixed top-0 end-0 p-3";
      c.style.zIndex = "1080";
      document.body.appendChild(c);
    }
    return c;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  window.showToast = function showToast(message, opts = {}) {
    const { title = "", variant = "primary", delay = 2500 } = opts;
    const container = ensureToastContainer();

    const toastEl = document.createElement("div");
    toastEl.className = "toast align-items-center border-0";
    toastEl.setAttribute("role", "alert");
    toastEl.setAttribute("aria-live", "assertive");
    toastEl.setAttribute("aria-atomic", "true");

    toastEl.innerHTML = `
      <div class="d-flex bg-${escapeHtml(variant)} text-white rounded">
        <div class="toast-body">
          ${title ? `<div class="fw-semibold mb-1">${escapeHtml(title)}</div>` : ""}
          ${escapeHtml(message)}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;

    container.appendChild(toastEl);

    const t = bootstrap.Toast.getOrCreateInstance(toastEl, { delay });
    toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
    t.show();
  };

  window.setPageLoading = function setPageLoading(isLoading) {
    document.body.classList.toggle("loading", !!isLoading);
  };

  window.withLoading = async function withLoading(asyncFn) {
    window.setPageLoading(true);
    try {
      return await asyncFn();
    } finally {
      window.setPageLoading(false);
    }
  };

  window.setButtonLoading = function setButtonLoading(btn, isLoading, opts = {}) {
    if (!btn) return;
    const { loadingText = "Working…" } = opts;

    if (isLoading) {
      if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        <span>${escapeHtml(loadingText)}</span>
      `;
    } else {
      btn.disabled = false;
      if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
        delete btn.dataset.originalHtml;
      }
    }
  };
})();

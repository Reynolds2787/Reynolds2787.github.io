// Guard page (redirect non-admins)
    document.addEventListener("DOMContentLoaded", async () => {
      const ok = await window.isAdminUser?.();
      if (!ok) window.location.href = "index.html";
    });

    document.getElementById("refreshBtn").addEventListener("click", () => render());
    document.getElementById("windowDays").addEventListener("change", () => render());

    render().catch(err => {
      console.error(err);
      document.getElementById("rows").innerHTML =
        `<tr><td colspan="5" class="p-3 text-danger">Failed to load due-soon list.</td></tr>`;
    });
let qnhTooltip;

const QNH_API = "https://p2o7bnxpqc.execute-api.eu-west-2.amazonaws.com/fetch-qnh";

async function fetchKembleQNH() {
  const qnhValueEl = document.getElementById("qnhValue");
  const qnhDisplayEl = document.getElementById("qnhDisplay");

  if (!qnhValueEl || !qnhDisplayEl) {
    console.warn("QNH elements not found in DOM");
    return;
  }

  try {
    const resp = await fetch(QNH_API, { cache: "no-store" });
    const data = await resp.json().catch(() => null);

    if (!resp.ok || !data?.qnh_hpa) {
      throw new Error(`Bad response: HTTP ${resp.status}`);
    }

    // Update display
    qnhValueEl.textContent = data.qnh_hpa;
    document.getElementById("metarStation").textContent = data.stationUsed;
  

    // Tooltip: METAR + station + source
    const title = `${data.metar || "METAR unavailable"}\n— Source: ${data.sourceUsed || "Unknown"} (${data.stationUsed || "Unknown"})`;
    qnhDisplayEl.setAttribute("title", title);

    // Create tooltip once; title updates automatically next time it shows
    if (!qnhTooltip) qnhTooltip = new bootstrap.Tooltip(qnhDisplayEl);

    return;
  } catch (err) {
    console.warn("QNH fetch failed", err);
  }

  // If it fails, show placeholder (or keep previous value if you prefer)
  qnhValueEl.textContent = "—";
  qnhDisplayEl.setAttribute("title", "QNH unavailable");
  if (!qnhTooltip) qnhTooltip = new bootstrap.Tooltip(qnhDisplayEl);
}

document.addEventListener("DOMContentLoaded", () => {
  fetchKembleQNH();
  setInterval(fetchKembleQNH, 600000); // every 10 minutes
});

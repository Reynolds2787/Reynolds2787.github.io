const FLIGHTS_URL =
  window.FLIGHTS_URL ||
  "https://q97yj6cmpe.execute-api.eu-west-2.amazonaws.com/EFM_API/get_all_flights";

const KEMBLE_FR24_FALLBACK = "https://www.flightradar24.com/51.668,-2.056/12";

const flightCardsEl = document.getElementById("flightCards");
const loadingSpinnerEl = document.getElementById("loadingSpinner");
const refreshFlightsBtn = document.getElementById("refreshFlightsBtn");

if (flightCardsEl) {
  if (refreshFlightsBtn) {
    refreshFlightsBtn.addEventListener("click", loadFlights);
  }
  loadFlights();
}

async function loadFlights() {
  showLoading(true);
  flightCardsEl.innerHTML = "";

  try {
    const res = await fetch(FLIGHTS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Flight fetch failed: ${res.status}`);

    let data = await res.json();
    console.log("Raw active flights response:", data);

    data = unwrapApiPayload(data);
    console.log("Unwrapped active flights response:", data);

    const flights = normaliseFlights(data);
    console.log("Normalised flights:", flights);

    showLoading(false);

    if (!flights.length) {
      flightCardsEl.innerHTML = `
        <div class="col-12">
          <div class="empty-state p-4 text-center">
            <div class="fs-2 mb-2">✅</div>
            <h3 class="h5 mb-1">No active flights</h3>
            <p class="text-muted mb-0">There are currently no aircraft out flying.</p>
          </div>
        </div>
      `;
      return;
    }

    flightCardsEl.innerHTML = flights.map(renderFlightCard).join("");

    flightCardsEl.querySelectorAll("[data-fr24-url]").forEach(card => {
      card.addEventListener("click", () => {
        const url = card.getAttribute("data-fr24-url");
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      });
    });

    flightCardsEl.querySelectorAll("[data-fr24-link]").forEach(link => {
      link.addEventListener("click", (e) => e.stopPropagation());
    });

  } catch (err) {
    console.error("Active flights load error:", err);
    showLoading(false);
    flightCardsEl.innerHTML = `
      <div class="col-12">
        <div class="empty-state p-4 text-center">
          <div class="fs-2 mb-2">⚠️</div>
          <h3 class="h5 mb-1">Unable to load active flights</h3>
          <p class="text-muted mb-0">Please try again in a moment.</p>
        </div>
      </div>
    `;
  }
}

function showLoading(isLoading) {
  if (!loadingSpinnerEl) return;
  loadingSpinnerEl.style.display = isLoading ? "" : "none";
}

function unwrapApiPayload(data) {
  if (!data) return [];

  // Common API Gateway/Lambda proxy pattern: { statusCode, body: "..." }
  if (typeof data === "object" && typeof data.body === "string") {
    try {
      const parsed = JSON.parse(data.body);
      return parsed;
    } catch {
      return [];
    }
  }

  return data;
}

function normaliseFlights(data) {
  let raw = [];

  if (Array.isArray(data)) {
    raw = data;
  } else if (data && typeof data === "object") {
    raw =
      data.items ||
      data.Items ||
      data.flights ||
      data.Flights ||
      data.records ||
      data.Records ||
      data.data ||
      data.Data ||
      [];
  }

  // If a single flight object is returned instead of an array
  if (!Array.isArray(raw) && raw && typeof raw === "object") {
    raw = [raw];
  }

  return raw.map(item => ({
    aircraft:
      item.aircraft ??
      item.Aircraft ??
      item.registration ??
      item.Registration ??
      item.reg ??
      item.Reg ??
      "Unknown",

    from:
      item.from ??
      item.From ??
      item.departure ??
      item.Departure ??
      item.origin ??
      item.Origin ??
      "—",

    to:
      item.to ??
      item.To ??
      item.destination ??
      item.Destination ??
      "—",

    eta:
      item.eta ??
      item.ETA ??
      item.arrivalTime ??
      item.ArrivalTime ??
      item.arrival ??
      item.Arrival ??
      "—",

    picName:
      item.picName ??
      item.PICName ??
      item.pic ??
      item.PIC ??
      item.pilot ??
      item.Pilot ??
      ""
  }));
}

function renderFlightCard(flight) {
  const fr24Url = buildFr24Url(flight.aircraft);
  const etaText = formatEta(flight.eta);

  return `
    <div class="col-md-6 col-xl-4">
      <div class="flight-card h-100" data-fr24-url="${escapeHtml(fr24Url)}">
        <div class="flight-card-head p-3">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <div class="text-muted small mb-1">Aircraft</div>
              <div class="h4 mb-0">${escapeHtml(flight.aircraft)}</div>
            </div>
            <span class="flight-badge">Active</span>
          </div>
        </div>

        <div class="p-3">
          <div class="route-pill mb-3">
            <span>${escapeHtml(flight.from)}</span>
            <span>→</span>
            <span>${escapeHtml(flight.to)}</span>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-6">
              <div class="meta-label">From</div>
              <div class="meta-value">${escapeHtml(flight.from)}</div>
            </div>
            <div class="col-6">
              <div class="meta-label">To</div>
              <div class="meta-value">${escapeHtml(flight.to)}</div>
            </div>
            <div class="col-6">
              <div class="meta-label">ETA</div>
              <div class="meta-value">${escapeHtml(etaText)}</div>
            </div>
            <div class="col-6">
              <div class="meta-label">PIC</div>
              <div class="meta-value">${escapeHtml(flight.picName || "—")}</div>
            </div>
          </div>

          <a
            href="${escapeHtml(fr24Url)}"
            target="_blank"
            rel="noopener noreferrer"
            class="fr24-inline"
            data-fr24-link="1"
          >
            Open in FR24
          </a>
        </div>
      </div>
    </div>
  `;
}

function buildFr24Url(aircraft) {
  if (!aircraft || aircraft === "Unknown") {
    return KEMBLE_FR24_FALLBACK;
  }

  return `https://www.flightradar24.com/${encodeURIComponent(
    String(aircraft).replace(/[^A-Za-z0-9-]/g, "")
  )}`;
}

function formatEta(value) {
  if (!value) return "—";
  return String(value).replace("T", " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
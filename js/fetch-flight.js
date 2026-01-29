const apiUrl = "https://q97yj6cmpe.execute-api.eu-west-2.amazonaws.com/EFM_API/get_all_flights";
const tableBody = document.getElementById("flightsTableBody");
const cardsContainer = document.getElementById("flightCards");
const spinner = document.getElementById("loadingSpinner");

// Home airfield (Kemble / EGBP)
const HOME_AIRFIELD = "EGBP";
const HOME_LAT = 51.668;   // Kemble approx
const HOME_LON = -2.056;   // Kemble approx
const HOME_ZOOM = 12;

// A reliable FR24 "centered map" URL format
function fr24HomeMapUrl() {
  return `https://www.flightradar24.com/${HOME_LAT},${HOME_LON}/${HOME_ZOOM}`;
}

function fr24UrlFromReg(reg) {
  const clean = String(reg || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean ? `https://www.flightradar24.com/${encodeURIComponent(clean)}/` : null;
}


function radarIconHtml() {
  return `
    <span class="fr24-link" aria-hidden="true">
      <span class="fr24-icon">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
          <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2" opacity="0.7"/>
          <path d="M12 12 L19 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="19" cy="9" r="1.6" fill="currentColor"/>
        </svg>
      </span>
      <span>Open in FR24</span>
    </span>
  `;
}

function openInSameTab(url) {
  window.location.href = url;
}

function renderNoFlightsFallback() {
  const homeUrl = fr24HomeMapUrl();

  // Desktop table fallback row
  tableBody.innerHTML = `
    <tr class="clickable-row">
      <td colspan="4" class="text-center py-3">
        <span class="fw-semibold">No aircraft airborne.</span>
        <span class="ms-2 text-primary">
          Open FlightRadar24 centred on ${HOME_AIRFIELD}
          ${radarIconHtml()}
        </span>
      </td>
    </tr>
  `;
  const tr = tableBody.querySelector("tr");
  tr.title = `Open FlightRadar24 centred on ${HOME_AIRFIELD}`;
  tr.addEventListener("click", () => openNewTab(homeUrl));

 

  // Mobile card fallback
  cardsContainer.innerHTML = `
    <div class="card clickable-card">
      <div class="card-body text-center">
        <div class="fw-semibold mb-2">No aircraft airborne.</div>
        <div class="text-primary">
          Open FlightRadar24 centred on ${HOME_AIRFIELD}
          ${radarIconHtml()}
        </div>
      </div>
    </div>
  `;
  const card = cardsContainer.querySelector(".card");
  card.title = `Open FlightRadar24 centred on ${HOME_AIRFIELD}`;
  card.addEventListener("click", () => openNewTab(homeUrl));
}

function fetchFlights() {
  spinner.style.display = "block";

  fetch(apiUrl)
    .then(r => r.json())
    .then(data => {
      tableBody.innerHTML = "";
      cardsContainer.innerHTML = "";

      // Defensive: ensure array
      if (!Array.isArray(data)) data = [];

      // Sort by ETA
      data.sort((a, b) => new Date(a["ETA FULL"]) - new Date(b["ETA FULL"]));
      const now = new Date();

      // If no active flights -> show centered map fallback
      if (data.length === 0) {
        renderNoFlightsFallback();
        spinner.style.display = "none";
        return;
      }

      data.forEach(f => {
        const reg = f["Aircraft"];
        const frUrl = fr24UrlFromReg(reg);

        const eta = new Date(f["ETA FULL"]);
        const overdue = eta < now;

        // Desktop row (click anywhere)
        const tr = document.createElement("tr");
        tr.classList.add("clickable-row");
        if (overdue) tr.classList.add("table-danger");

        tr.innerHTML = `
          <td class="fw-semibold">
            ${reg ?? ""}
            ${radarIconHtml()}
          </td>
          <td>${f["From"] ?? ""}</td>
          <td>${f["To"] ?? ""}</td>
          <td>${f["ETA Abbreviated"] ?? ""}${overdue ? ' <span class="badge bg-danger">OVERDUE</span>' : ''}</td>
        `;

        tr.title = frUrl ? "Open in FlightRadar24" : `Open FlightRadar24 centred on ${HOME_AIRFIELD}`;
        tr.addEventListener("click", () => openInSameTab(frUrl || fr24HomeMapUrl()));
        tableBody.appendChild(tr);

          

        // Mobile card (click anywhere)
        const card = document.createElement("div");
        card.className = `card mb-2 clickable-card ${overdue ? "border-danger" : ""}`;

        card.innerHTML = `
          <div class="card-body">
            <h5 class="mb-3">
              ${reg ?? ""}
              ${radarIconHtml()}
            </h5>
            <p class="mb-1"><strong>From:</strong> ${f["From"] ?? ""}</p>
            <p class="mb-1"><strong>To:</strong> ${f["To"] ?? ""}</p>
            <p class="mb-1"><strong>ETA:</strong> ${f["ETA Abbreviated"] ?? ""}</p>
            <p class="mb-1"><strong>PIC:</strong> ${f["PIC"] ?? ""}</p>
            <p class="mb-0"><strong>Reason:</strong> ${f["Reason For Flight"] ?? ""}</p>
            ${overdue ? '<span class="badge bg-danger mt-2">OVERDUE</span>' : ''}
          </div>
        `;

        card.title = frUrl ? "Open in FlightRadar24" : `Open FlightRadar24 centred on ${HOME_AIRFIELD}`;
        card.addEventListener("click", () => openInSameTab(frUrl || fr24HomeMapUrl()));
        cardsContainer.appendChild(card);
      });

      spinner.style.display = "none";
    })
    .catch(() => {
      spinner.style.display = "none";
    });
}

fetchFlights();
setInterval(fetchFlights, 30000);



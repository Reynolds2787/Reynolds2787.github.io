const PAYMENT_API_URL =
  "https://pycwqimgld.execute-api.eu-west-2.amazonaws.com/calculate-payment";

function money2dp(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function setPaymentField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = money2dp(value);
}

function renderPaymentSummary(data) {
  setPaymentField("aircraftHireCost", data?.aircraftHireCost);
  setPaymentField("landingFees", data?.landingFees);
  setPaymentField("instrucCost", data?.instructorCost);
  setPaymentField("surcharge", data?.surcharge);
  setPaymentField("lfcTotal", data?.lfcTotal);
}

function parseHHMMToMinutes(v) {
  if (!v || !/^\d{2}:\d{2}$/.test(v)) return null;
  const [hh, mm] = v.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ✅ Uses YOUR actual form IDs
function buildPaymentPayload() {
  const aircraft = document.getElementById("aircraft")?.value?.trim() || "";

  // blockTime is an auto field like "01:30"
  const blockTime = document.getElementById("blockTime")?.value?.trim() || "";
  const blockMinutes = parseHHMMToMinutes(blockTime);

  // instructional is a select with "Yes"/"No"
  const instructionalValue = document.getElementById("instructional")?.value || "";
  const instructional = instructionalValue === "Yes";

  // landings are two inputs
  const kemble = toNumber(document.getElementById("landingsKemble")?.value) ?? 0;
  const other = toNumber(document.getElementById("landingsOther")?.value) ?? 0;
  const landingCount = Math.max(0, kemble + other);

  // tachoDiff is a readonly text like "1.7"
  const tachDiff = toNumber(document.getElementById("tachoDiff")?.value);

  // tempMember is a select "Yes"/"No"
  const tempMember = document.getElementById("tempMember")?.value === "Yes";

  // Maintenance Flight is a select "Yes"/"No"
  const maintFlight = document.getElementById("maintenanceTrip")?.value === "Yes";

  // Rescue Flight is a select "Yes"/"No"
  const rescueFlight = document.getElementById("rescueFlight")?.value === "Yes";

  // no surcharge input yet; keep zero for now
  const surcharge = 0;

  return { aircraft, blockMinutes, instructional, landingCount, tachDiff, tempMember, surcharge, maintFlight, rescueFlight };
}

async function fetchPaymentSummary() {
  if (typeof window.authFetch !== "function") {
    throw new Error("authFetch is not available. Ensure auth.js is loaded before calculatePayment.js.");
  }

  const payload = buildPaymentPayload();

  // Guard: if key inputs aren't ready, clear fields
  if (!payload.aircraft || !Number.isFinite(payload.blockMinutes) || payload.blockMinutes <= 0) {
    renderPaymentSummary(null);
    return null;
  }

  const res = await window.authFetch(PAYMENT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res) return null;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Payment calc failed (${res.status}): ${text}`);
  }

  return res.json();
}

function debounce(fn, delayMs = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delayMs);
  };
}

const refreshPaymentOverview = debounce(async () => {
  try {
    const data = await fetchPaymentSummary();
    if (data) renderPaymentSummary(data);
  } catch (e) {
    console.warn("Payment summary error:", e);
  }
}, 350);

// ✅ Your HTML calls refreshPaymentOverview(), so expose it globally
window.refreshPaymentOverview = refreshPaymentOverview;

document.addEventListener("DOMContentLoaded", () => {
  refreshPaymentOverview();

  // Watch the fields that affect price
  const watchIds = [
    "aircraft",
    "instructional",
    "landingsKemble",
    "landingsOther",
    "tempMember",
    // These change blockTime indirectly via your validateAndCalcTimes():
    "offChocks",
    "takeoff",
    "land",
    "onChocks",
    "maintenanceTrip",
    "rescueFlight",
    "tachoDiff"
  ];

  for (const id of watchIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("change", refreshPaymentOverview);
    el.addEventListener("input", refreshPaymentOverview);
  }
});

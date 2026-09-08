import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand
} from "@aws-sdk/lib-dynamodb";
import ExcelJS from "exceljs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FLIGHTLOGS_TABLE = process.env.FLIGHTLOGS_TABLE || "FlightLogs";
const USER_TABLE = process.env.USER_TABLE || "UserProfiles";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://efmapp.co.uk";

const AIRCRAFT_LIST = ["G-AZWS", "G-BPAF", "G-EDGI", "G-AVYL", "G-BULL"];
const USES_FLIGHT_HOURS = new Set(["G-AZWS", "G-BULL"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

const EXPORT_COLUMNS = [
  { header: "Date", key: "date", width: 12, format: "date" },
  { header: "PIC", key: "pic", width: 22 },
  { header: "Auth", key: "auth", width: 18 },
  { header: "Temp Member", key: "tempMember", width: 14 },
  { header: "Reason", key: "reason", width: 18 },
  { header: "Cost Sharing", key: "costSharing", width: 14 },
  { header: "Instructional", key: "instructional", width: 14 },
  { header: "Rescue Flight", key: "rescueFlight", width: 14 },

  { header: "P2", key: "p2", width: 20 },
  { header: "P3", key: "p3", width: 20 },
  { header: "P4", key: "p4", width: 20 },

  { header: "From", key: "from", width: 14 },
  { header: "To", key: "to", width: 14 },
  { header: "# Move", key: "numberOfMovements", width: 10, format: "integer" },
  { header: "Home Landings", key: "homeLandings", width: 15, format: "integer" },
  { header: "Landings Elsewhere", key: "landingsElsewhere", width: 18, format: "integer" },

  { header: "Off Chocks", key: "offChocks", width: 12 },
  { header: "On Chocks", key: "onChocks", width: 12 },
  { header: "Takeoff Time", key: "takeoffTime", width: 13 },
  { header: "Landing Time", key: "landingTime", width: 13 },

  { header: "Flight Time", key: "flightTime", width: 12 },
  { header: "Logged Time", key: "loggedTime", width: 12 },

  { header: "Flight Time Before", key: "flightTimeBefore", width: 18, format: "decimal2" },
  { header: "Flight Time After", key: "flightTimeAfter", width: 18, format: "decimal2" },

  { header: "Tacho Start", key: "tachoStart", width: 13, format: "decimal" },
  { header: "Tacho End", key: "tachoEnd", width: 13, format: "decimal" },
  { header: "Tacho Difference", key: "tachoDifference", width: 16, format: "decimal" },
  { header: "Next Service Due At", key: "nextServiceDueAt", width: 20 },

  { header: "Maintenance Trip", key: "maintenanceTrip", width: 16 },

  { header: "Fuel Upload Kemble", key: "fuelUploadKemble", width: 18, format: "integer" },
  { header: "Fuel Upload Away", key: "fuelUploadAway", width: 18, format: "integer" },
  { header: "Oil Home", key: "oilHome", width: 12 },
  { header: "Aero Time", key: "aeroTime", width: 12 },
  { header: "Remaining Fuel", key: "remainingFuel", width: 16 },

  { header: "Landing Cost", key: "landingCost", width: 14, format: "currency" },
  { header: "Aircraft Hire Cost", key: "aircraftHireCost", width: 18, format: "currency" },
  { header: "Surcharge Cost", key: "surchargeCost", width: 16, format: "currency" },
  { header: "Fuel Cost Away", key: "fuelCostAway", width: 16, format: "currency" },
  { header: "Total Cost", key: "totalCost", width: 14, format: "currency" },

  { header: "Payer", key: "payer", width: 14 },
  { header: "Payment Method", key: "paymentMethod", width: 16 },
  { header: "Aircraft", key: "aircraft", width: 12 },
  { header: "PIC Member ID", key: "picMemberId", width: 16 },
  { header: "P2 Member ID", key: "p2MemberId", width: 16 }
];

function response(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(bodyObj)
  };
}

function binaryResponse(filename, base64Body) {
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      ...CORS_HEADERS,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    },
    body: base64Body
  };
}

function normalizeReg(value) {
  return String(value || "").trim().toUpperCase();
}

function parseBody(event) {
  if (!event?.body) return {};
  try {
    return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return {};
  }
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function coerceNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function coerceText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function toMoney(value) {
  const n = coerceNumber(value, null);
  return n === null ? null : Number(n.toFixed(2));
}

function yesNo(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  return String(value);
}

function safeSheetName(name) {
  return String(name || "Sheet")
    .replace(/[\\/*?:[\]]/g, "-")
    .slice(0, 31);
}

function firstNonEmpty(item, keys, fallback = "") {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function isKemble(value) {
  const v = String(value || "").trim().toUpperCase();
  return v === "KEMBLE" || v === "EGBP";
}

function calcMovements(item, homeLandings) {
  const stored = firstNonEmpty(item, ["numberOfMovements", "movements"], null);
  const n = coerceNumber(stored, null);
  if (n !== null) return n;

  const departedKemble = isKemble(firstNonEmpty(item, ["from", "From"]));
  return (departedKemble ? 1 : 0) + (Number(homeLandings) || 0);
}

function excelColumnName(number) {
  let name = "";
  while (number > 0) {
    const rem = (number - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

function sortRows(rows) {
  return rows.sort((a, b) => {
    const aDate = String(a.date || "");
    const bDate = String(b.date || "");
    if (aDate !== bDate) return aDate.localeCompare(bDate);

    const aSk = String(a.sk || "");
    const bSk = String(b.sk || "");
    return aSk.localeCompare(bSk);
  });
}

async function assertAdmin(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;

  if (!userId) {
    return { ok: false, statusCode: 401, message: "Unauthenticated" };
  }

  const userRes = await ddb.send(
    new GetCommand({
      TableName: USER_TABLE,
      Key: { userId }
    })
  );

  const role = String(userRes.Item?.role || "").toLowerCase();
  if (role !== "admin") {
    return { ok: false, statusCode: 403, message: "Admin access required" };
  }

  return { ok: true, userId, profile: userRes.Item };
}

async function queryAllForAircraft(aircraft) {
  const items = [];
  let ExclusiveStartKey;

  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: FLIGHTLOGS_TABLE,
        KeyConditionExpression: "aircraft = :aircraft",
        ExpressionAttributeValues: {
          ":aircraft": aircraft
        },
        ExclusiveStartKey
      })
    );

    if (Array.isArray(res.Items)) items.push(...res.Items);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items;
}

function inDateRange(item, fromDate, toDate) {
  const fd = String(item?.flightDate || "");
  return fd >= fromDate && fd <= toDate;
}

function mapFlightLogRow(item) {
  const aircraft = normalizeReg(item.aircraft);

  const homeLandings = coerceNumber(
    firstNonEmpty(item, ["landingsKemble", "homeLandings"]),
    0
  );

  const landingsElsewhere = coerceNumber(
    firstNonEmpty(item, ["landingsOther", "landingsElsewhere"]),
    0
  );

  return {
    date: coerceText(firstNonEmpty(item, ["flightDate", "date", "Date"])),
    pic: coerceText(firstNonEmpty(item, ["picName", "pic", "PIC"])),
    auth: coerceText(firstNonEmpty(item, ["authorised", "authorized", "auth", "Auth"])),
    tempMember: yesNo(firstNonEmpty(item, ["tempMember"])),
    reason: coerceText(firstNonEmpty(item, ["reason", "Reason"])),
    costSharing: yesNo(firstNonEmpty(item, ["costSharing", "costShare", "cost_sharing"])),
    instructional: yesNo(firstNonEmpty(item, [
      "instructionalFlight",
      "instructional",
      "instuctional"
    ])),
    rescueFlight: yesNo(firstNonEmpty(item, ["rescueFlight"])),

    p2: coerceText(firstNonEmpty(item, ["p2", "P2"])),
    p3: coerceText(firstNonEmpty(item, ["p3", "P3"])),
    p4: coerceText(firstNonEmpty(item, ["p4", "P4"])),

    from: coerceText(firstNonEmpty(item, ["from", "From"])),
    to: coerceText(firstNonEmpty(item, ["to", "To"])),
    numberOfMovements: calcMovements(item, homeLandings),
    homeLandings,
    landingsElsewhere,

    offChocks: coerceText(firstNonEmpty(item, ["offChocks"])),
    onChocks: coerceText(firstNonEmpty(item, ["onChocks"])),
    takeoffTime: coerceText(firstNonEmpty(item, ["takeoff", "takeoffTime"])),
    landingTime: coerceText(firstNonEmpty(item, ["land", "landingTime"])),

    flightTime: coerceText(firstNonEmpty(item, ["airTime", "flightTime"])),
    loggedTime: coerceText(firstNonEmpty(item, ["blockTime", "loggedTime"])),

    // Meter reading before the flight. The desktop app (EFM Desktop) stores this
    // as `currentHoursBeforeFlight` for flight-hours aircraft, so it must be
    // checked first — the legacy `remainingTachoTime*` keys can hold a stale 0.
    flightTimeBefore: coerceNumber(firstNonEmpty(item, [
      "currentHoursBeforeFlight",
      "flightTimeBefore",
      "flightHoursBefore",
      "remainingFlightHoursBeforeFlight",
      "remainingTachoTimeBeforeFlight"
    ])),

    flightTimeAfter: coerceNumber(firstNonEmpty(item, [
      "currentHoursAfterFlight",
      "flightTimeAfter",
      "flightHoursAfter",
      "remainingFlightHoursAfterFlight",
      "remainingTachoTimeAfterFlight"
    ])),

    tachoStart: coerceNumber(firstNonEmpty(item, ["startTacho", "tachoStart"])),
    tachoEnd: coerceNumber(firstNonEmpty(item, ["endTacho", "tachoEnd"])),
    tachoDifference: coerceNumber(firstNonEmpty(item, [
      "tachometerUsed",
      "tachoDiff",
      "tachoDifference"
    ])),

    nextServiceDueAt: coerceText(firstNonEmpty(item, [
      "nextServiceDueAt",
      "serviceAt",
      "nextServiceDue"
    ])),

    maintenanceTrip: yesNo(firstNonEmpty(item, ["maintenanceTrip"])),

    fuelUploadKemble: coerceNumber(firstNonEmpty(item, [
      "fuelUpliftedLfc",
      "fuelUploadKemble"
    ]), 0),

    fuelUploadAway: coerceNumber(firstNonEmpty(item, [
      "fuelUpliftedElsewhere",
      "fuelUploadAway"
    ]), 0),

    oilHome: coerceText(firstNonEmpty(item, ["oilUploaded", "oilHome"])),
    aeroTime: coerceText(firstNonEmpty(item, ["aeroTime", "aerosTime", "aerobaticTime"])),
    remainingFuel: coerceText(firstNonEmpty(item, ["fuelRemaining", "remainingFuel"])),

    landingCost: toMoney(firstNonEmpty(item, ["landingFees", "landingCost"])),
    aircraftHireCost: toMoney(firstNonEmpty(item, ["aircraftHireCost"])),
    surchargeCost: toMoney(firstNonEmpty(item, ["surcharge", "surchargeCost"])),
    fuelCostAway: toMoney(firstNonEmpty(item, ["fuelCost", "fuelCostAway"])),
    totalCost: toMoney(firstNonEmpty(item, ["lfcTotal", "totalCost"])),

    payer: coerceText(firstNonEmpty(item, ["payer"])),
    paymentMethod: coerceText(firstNonEmpty(item, ["paymentMethod"])),
    aircraft,

    picMemberId: coerceText(firstNonEmpty(item, [
      "picMemberId",
      "picMemberID",
      "pic_member_id"
    ])),

    p2MemberId: coerceText(firstNonEmpty(item, [
      "p2MemberId",
      "p2MemberID",
      "p2_member_id"
    ])),

    sk: coerceText(item.sk),
    createdAt: coerceText(item.createdAt),
    userId: coerceText(item.userId)
  };
}

function buildWorkbookRows(items) {
  return sortRows(items.map(mapFlightLogRow));
}

function styleInfoCell(cell, fillArgb = "FFE9ECEF") {
  cell.font = { bold: true };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: fillArgb }
  };
  cell.border = {
    top: { style: "thin", color: { argb: "FFD0D7DE" } },
    left: { style: "thin", color: { argb: "FFD0D7DE" } },
    bottom: { style: "thin", color: { argb: "FFD0D7DE" } },
    right: { style: "thin", color: { argb: "FFD0D7DE" } }
  };
}

function styleValueCell(cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FFD0D7DE" } },
    left: { style: "thin", color: { argb: "FFD0D7DE" } },
    bottom: { style: "thin", color: { argb: "FFD0D7DE" } },
    right: { style: "thin", color: { argb: "FFD0D7DE" } }
  };
}

function sumBy(rows, key) {
  return rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
}

function getAircraftTotals(rows) {
  return {
    rowsExported: rows.length,
    totalMovements: sumBy(rows, "numberOfMovements"),
    totalLandingsKemble: sumBy(rows, "homeLandings"),
    totalLandingsOther: sumBy(rows, "landingsElsewhere"),
    totalFuelLfc: sumBy(rows, "fuelUploadKemble"),
    totalFuelElsewhere: sumBy(rows, "fuelUploadAway"),
    totalFuelCost: sumBy(rows, "fuelCostAway"),
    totalHireCost: sumBy(rows, "aircraftHireCost"),
    totalLandingFees: sumBy(rows, "landingCost"),
    totalSurcharge: sumBy(rows, "surchargeCost"),
    totalLfcTotal: sumBy(rows, "totalCost")
  };
}

function round2(n) {
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

// Hours flown for a single mapped row: prefer the flight-hours meter delta,
// fall back to the tacho difference. Guarded against bad/rolled-over readings.
function rowHoursFlown(row) {
  const before = coerceNumber(row.flightTimeBefore, null);
  const after = coerceNumber(row.flightTimeAfter, null);
  if (before !== null && after !== null) {
    const diff = after - before;
    if (diff > 0 && diff < 100) return diff;
  }

  const tacho = coerceNumber(row.tachoDifference, null);
  if (tacho !== null && tacho > 0 && tacho < 100) return tacho;

  return 0;
}

// Per-aircraft operational rollup used by the Summary sheet.
function getAircraftOpsSummary(aircraft, rows) {
  const usesHours = USES_FLIGHT_HOURS.has(aircraft);
  const totals = getAircraftTotals(rows);
  const pilots = new Set();
  const pilotStats = new Map();

  let hoursFlown = 0;
  let instructional = 0;

  for (const r of rows) {
    const rowHours = rowHoursFlown(r);
    hoursFlown += rowHours;

    const isInstructional = String(r.instructional).toLowerCase() === "yes";
    if (isInstructional) instructional += 1;

    const pic = String(r.pic || "").trim() || "(unknown)";
    const key = pic.toUpperCase();
    pilots.add(key);

    const ps = pilotStats.get(key) || {
      pilot: pic,
      flights: 0,
      hoursFlown: 0,
      instructional: 0,
      movements: 0
    };
    ps.flights += 1;
    ps.hoursFlown += rowHours;
    ps.instructional += isInstructional ? 1 : 0;
    ps.movements += coerceNumber(r.numberOfMovements, 0);
    pilotStats.set(key, ps);
  }

  // Latest meter = the reading from the most recent flight in the range
  // (rows are already sorted oldest -> newest), NOT the highest value seen.
  let latestMeter = null;
  for (let i = rows.length - 1; i >= 0 && latestMeter === null; i--) {
    const meter = usesHours
      ? coerceNumber(rows[i].flightTimeAfter, null)
      : coerceNumber(rows[i].tachoEnd, null);
    if (meter !== null) latestMeter = meter;
  }

  const pilotBreakdown = Array.from(pilotStats.values())
    .map(p => ({ ...p, hoursFlown: round2(p.hoursFlown) }))
    .sort((a, b) => b.hoursFlown - a.hoursFlown || b.flights - a.flights);

  return {
    aircraft,
    metric: usesHours ? "Flight Hours" : "Tacho Hours",
    flights: rows.length,
    hoursFlown: round2(hoursFlown),
    movements: totals.totalMovements,
    homeLandings: totals.totalLandingsKemble,
    landingsElsewhere: totals.totalLandingsOther,
    instructional,
    pilots: pilots.size,
    fuelKemble: totals.totalFuelLfc,
    fuelAway: totals.totalFuelElsewhere,
    hireCost: round2(totals.totalHireCost),
    landingFees: round2(totals.totalLandingFees),
    surcharge: round2(totals.totalSurcharge),
    fuelCost: round2(totals.totalFuelCost),
    totalCost: round2(totals.totalLfcTotal),
    latestMeter: latestMeter === null ? "" : round2(latestMeter),
    _pilotSet: pilots,
    _pilotBreakdown: pilotBreakdown
  };
}

const PILOT_COLUMNS = [
  { header: "Pilot", key: "pilot", width: 24, total: { totalsRowLabel: "Total" } },
  { header: "Flights", key: "flights", width: 9, format: "integer", total: { totalsRowFunction: "sum" } },
  { header: "Hours Flown", key: "hoursFlown", width: 12, format: "decimal2", total: { totalsRowFunction: "sum" } },
  { header: "Instructional", key: "instructional", width: 13, format: "integer", total: { totalsRowFunction: "sum" } },
  { header: "Movements", key: "movements", width: 11, format: "integer", total: { totalsRowFunction: "sum" } }
];

const SUMMARY_COLUMNS = [
  { header: "Aircraft", key: "aircraft", width: 12, total: { totalsRowLabel: "Total" } },
  { header: "Service Metric", key: "metric", width: 14, total: { totalsRowLabel: "" } },
  { header: "Flights", key: "flights", width: 9, format: "integer", total: { totalsRowFunction: "sum" } },
  { header: "Hours Flown", key: "hoursFlown", width: 12, format: "decimal2", total: { totalsRowFunction: "sum" } },
  { header: "Movements", key: "movements", width: 11, format: "integer", total: { totalsRowFunction: "sum" } },
  { header: "Home Landings", key: "homeLandings", width: 13, format: "integer", total: { totalsRowFunction: "sum" } },
  { header: "Landings Elsewhere", key: "landingsElsewhere", width: 16, format: "integer", total: { totalsRowFunction: "sum" } },
  { header: "Instructional Flights", key: "instructional", width: 16, format: "integer", total: { totalsRowFunction: "sum" } },
  { header: "Distinct Pilots", key: "pilots", width: 12, format: "integer", total: { totalsRowLabel: "" } },
  { header: "Fuel Kemble (L)", key: "fuelKemble", width: 13, format: "integer", total: { totalsRowFunction: "sum" } },
  { header: "Fuel Away (L)", key: "fuelAway", width: 12, format: "integer", total: { totalsRowFunction: "sum" } },
  { header: "Hire Cost", key: "hireCost", width: 12, format: "currency", total: { totalsRowFunction: "sum" } },
  { header: "Landing Fees", key: "landingFees", width: 12, format: "currency", total: { totalsRowFunction: "sum" } },
  { header: "Surcharge", key: "surcharge", width: 11, format: "currency", total: { totalsRowFunction: "sum" } },
  { header: "Fuel Cost", key: "fuelCost", width: 11, format: "currency", total: { totalsRowFunction: "sum" } },
  { header: "Total Cost", key: "totalCost", width: 12, format: "currency", total: { totalsRowFunction: "sum" } },
  { header: "Latest Meter", key: "latestMeter", width: 12, format: "decimal2", total: { totalsRowLabel: "" } }
];

function applyCellFormat(cell, format) {
  if (format === "currency") cell.numFmt = "£#,##0.00";
  if (format === "decimal") cell.numFmt = "0.0";
  if (format === "decimal2") cell.numFmt = "0.00";
  if (format === "integer") cell.numFmt = "0";
  if (format === "date") cell.numFmt = "dd/mm/yyyy";
}

function applyDataFormatting(ws, firstDataRow, lastDataRow) {
  if (lastDataRow < firstDataRow) return;

  EXPORT_COLUMNS.forEach((col, index) => {
    const colLetter = excelColumnName(index + 1);

    for (let row = firstDataRow; row <= lastDataRow; row++) {
      const cell = ws.getCell(`${colLetter}${row}`);

      cell.alignment = {
        vertical: "middle",
        wrapText: true
      };

      cell.border = {
        top: { style: "thin", color: { argb: "FFE9ECEF" } },
        left: { style: "thin", color: { argb: "FFE9ECEF" } },
        bottom: { style: "thin", color: { argb: "FFE9ECEF" } },
        right: { style: "thin", color: { argb: "FFE9ECEF" } }
      };

      applyCellFormat(cell, col.format);
    }
  });
}

// Accounting view: only the columns the accounts manager needs, kept as far
// left as possible so the sheet prints on one screen width. Columns with
// `sumTotal: true` get a SUM in the manually-built Total row.
const CONDENSED_COLUMNS = [
  { header: "Date", key: "date", width: 12, format: "date" },
  { header: "PIC", key: "pic", width: 20 },
  { header: "P2", key: "p2", width: 18 },
  { header: "Payer", key: "payer", width: 14 },
  { header: "Tacho Used", key: "tachoDifference", width: 12, format: "decimal", sumTotal: true },
  { header: "Movements", key: "numberOfMovements", width: 11, format: "integer", sumTotal: true },
  { header: "Paid Landings", key: "landingCost", width: 13, format: "currency", sumTotal: true },
  { header: "Hire Cost", key: "aircraftHireCost", width: 13, format: "currency", sumTotal: true },
  { header: "Total Cost", key: "totalCost", width: 13, format: "currency", sumTotal: true },
  { header: "Maint Trip", key: "maintenanceTrip", width: 11 },
  { header: "Away Fuel Cost", key: "fuelCostAway", width: 14, format: "currency" },
  { header: "Tacho Start", key: "tachoStart", width: 12, format: "decimal" },
  { header: "Tacho End", key: "tachoEnd", width: 12, format: "decimal" }
];

function addCondensedSheet(ws, aircraft, rows, fromDate, toDate) {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ state: "frozen", ySplit: 4, xSplit: 1 }];

  const lastCol = excelColumnName(CONDENSED_COLUMNS.length);

  ws.getCell("A1").value = `Condensed View - ${aircraft}`;
  ws.getCell("A1").font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF6F42C1" }
  };
  ws.mergeCells(`A1:${lastCol}1`);

  ws.getCell("A2").value = `From: ${fromDate}`;
  ws.getCell("C2").value = `To: ${toDate}`;
  ws.getCell("E2").value = `Aircraft: ${aircraft}`;
  ["A2", "C2", "E2"].forEach(ref => styleInfoCell(ws.getCell(ref)));

  ws.columns = CONDENSED_COLUMNS.map(({ key, width }) => ({ key, width }));

  const tableStartRow = 4;

  if (rows.length > 0) {
    const firstDataRow = tableStartRow + 1;
    const lastDataRow = tableStartRow + rows.length;
    const totalsRow = lastDataRow + 1;

    // Plain table, no built-in totals row (that adds a function-picker dropdown
    // to every column). The Total row below is built by hand.
    ws.addTable({
      name: `tbl_cond_${aircraft.replace(/-/g, "_")}`,
      ref: `A${tableStartRow}`,
      headerRow: true,
      totalsRow: false,
      style: { theme: "TableStyleMedium4", showRowStripes: true },
      columns: CONDENSED_COLUMNS.map(c => ({ name: c.header })),
      rows: rows.map(r => CONDENSED_COLUMNS.map(c => r[c.key] ?? ""))
    });

    for (let i = 0; i < CONDENSED_COLUMNS.length; i++) {
      const letter = excelColumnName(i + 1);
      for (let row = firstDataRow; row <= lastDataRow; row++) {
        const cell = ws.getCell(`${letter}${row}`);
        cell.alignment = { vertical: "middle", wrapText: true };
        applyCellFormat(cell, CONDENSED_COLUMNS[i].format);
      }
    }

    // Manual Total row.
    ws.getCell(`A${totalsRow}`).value = "Total";
    CONDENSED_COLUMNS.forEach((col, i) => {
      const letter = excelColumnName(i + 1);
      const cell = ws.getCell(`${letter}${totalsRow}`);
      cell.font = { bold: true };
      cell.border = { top: { style: "double", color: { argb: "FF9E9E9E" } } };
      if (col.sumTotal) {
        cell.value = { formula: `SUBTOTAL(109,${letter}${firstDataRow}:${letter}${lastDataRow})` };
        applyCellFormat(cell, col.format);
      }
    });

    ws.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3
      }
    };
    ws.pageSetup.printArea = `A1:${lastCol}${totalsRow}`;
  } else {
    const headerRow = ws.getRow(tableStartRow);
    headerRow.values = CONDENSED_COLUMNS.map(c => c.header);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" }
    };
    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true
    };

    ws.getCell(`A${tableStartRow + 1}`).value =
      "No rows found for selected date range.";
    ws.getCell(`A${tableStartRow + 1}`).font = {
      italic: true,
      color: { argb: "FF6C757D" }
    };
  }
}

function addSheet(ws, aircraft, rows, fromDate, toDate) {
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ state: "frozen", ySplit: 6 }];

  ws.getCell("A1").value = `FlightLogs Export - ${aircraft}`;
  ws.getCell("A1").font = {
    size: 14,
    bold: true,
    color: { argb: "FFFFFFFF" }
  };
  ws.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0D6EFD" }
  };
  ws.mergeCells("A1:H1");

  ws.getCell("A2").value = `From: ${fromDate}`;
  ws.getCell("C2").value = `To: ${toDate}`;
  ws.getCell("E2").value = `Aircraft: ${aircraft}`;
  ws.getCell("G2").value = `Service Metric: ${
    USES_FLIGHT_HOURS.has(aircraft) ? "Flight Hours" : "Tacho Hours"
  }`;

  ["A2", "C2", "E2", "G2"].forEach(ref => styleInfoCell(ws.getCell(ref)));

  const totals = getAircraftTotals(rows);

  ws.getCell("A3").value = `Rows Exported: ${totals.rowsExported}`;
  ws.getCell("C3").value = `Total Movements: ${totals.totalMovements}`;
  ws.getCell("E3").value = `Home Landings: ${totals.totalLandingsKemble}`;
  ws.getCell("G3").value = `Total Cost: £${totals.totalLfcTotal.toFixed(2)}`;

  ["A3", "C3", "E3", "G3"].forEach(ref => {
    styleValueCell(ws.getCell(ref));
    ws.getCell(ref).font = { bold: true };
  });

  ws.columns = EXPORT_COLUMNS.map(({ key, width }) => ({
    key,
    width
  }));

  const tableStartRow = 6;
  const firstDataRow = tableStartRow + 1;

  if (rows.length > 0) {
    ws.addTable({
      name: `tbl_${aircraft.replace(/-/g, "_")}`,
      ref: `A${tableStartRow}`,
      headerRow: true,
      totalsRow: false,
      style: {
        theme: "TableStyleMedium2",
        showRowStripes: true
      },
      columns: EXPORT_COLUMNS.map(c => ({ name: c.header })),
      rows: rows.map(r => EXPORT_COLUMNS.map(c => r[c.key] ?? ""))
    });

    applyDataFormatting(ws, firstDataRow, firstDataRow + rows.length - 1);
  } else {
    const headerRow = ws.getRow(tableStartRow);
    headerRow.values = EXPORT_COLUMNS.map(c => c.header);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" }
    };
    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true
    };

    ws.getCell(`A${tableStartRow + 1}`).value =
      "No rows found for selected date range.";
    ws.getCell(`A${tableStartRow + 1}`).font = {
      italic: true,
      color: { argb: "FF6C757D" }
    };
  }
}

function addSummarySheet(workbook, groupedRows, fromDate, toDate) {
  const ws = workbook.addWorksheet("Summary");
  ws.properties.defaultRowHeight = 20;
  ws.views = [{ state: "frozen", ySplit: 6 }];

  const lastColLetter = excelColumnName(SUMMARY_COLUMNS.length);

  ws.getCell("A1").value = "FlightLogs Export Summary";
  ws.getCell("A1").font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF198754" }
  };
  ws.mergeCells(`A1:${lastColLetter}1`);

  ws.getCell("A2").value = `From: ${fromDate}`;
  ws.getCell("C2").value = `To: ${toDate}`;
  ws.getCell("E2").value = `Generated: ${new Date().toISOString().slice(0, 10)}`;
  ["A2", "C2", "E2"].forEach(ref => styleInfoCell(ws.getCell(ref)));

  const aircraftWithData = AIRCRAFT_LIST.filter(aircraft =>
    Object.prototype.hasOwnProperty.call(groupedRows, aircraft)
  );

  const summaries = aircraftWithData.map(aircraft =>
    getAircraftOpsSummary(aircraft, groupedRows[aircraft])
  );

  // Club-wide headline figures.
  const clubPilots = new Set();
  summaries.forEach(s => s._pilotSet.forEach(p => clubPilots.add(p)));

  const club = {
    flights: summaries.reduce((n, s) => n + s.flights, 0),
    hoursFlown: round2(summaries.reduce((n, s) => n + s.hoursFlown, 0)),
    movements: summaries.reduce((n, s) => n + s.movements, 0),
    homeLandings: summaries.reduce((n, s) => n + s.homeLandings, 0),
    instructional: summaries.reduce((n, s) => n + s.instructional, 0),
    fuel: summaries.reduce((n, s) => n + s.fuelKemble + s.fuelAway, 0),
    totalCost: round2(summaries.reduce((n, s) => n + s.totalCost, 0)),
    pilots: clubPilots.size,
    aircraftFlown: summaries.filter(s => s.flights > 0).length
  };

  const singleAircraft = summaries.length === 1 ? summaries[0] : null;

  const busiest = summaries
    .slice()
    .sort((a, b) => b.hoursFlown - a.hoursFlown)[0];

  // KPI strip adapts: club-wide when several aircraft are exported, otherwise
  // scoped to the one aircraft (a "busiest aircraft" line makes no sense there).
  const kpis = singleAircraft
    ? [
        ["Aircraft", singleAircraft.aircraft],
        ["Total Flights", singleAircraft.flights],
        ["Hours Flown", singleAircraft.hoursFlown.toFixed(2)],
        ["Total Movements", singleAircraft.movements],
        ["Home Landings", singleAircraft.homeLandings],
        ["Landings Elsewhere", singleAircraft.landingsElsewhere],
        ["Instructional Flights", singleAircraft.instructional],
        ["Distinct Pilots", singleAircraft.pilots],
        ["Latest Meter", singleAircraft.latestMeter === "" ? "—" : singleAircraft.latestMeter.toFixed(2)],
        ["Total Cost", `£${singleAircraft.totalCost.toFixed(2)}`]
      ]
    : [
        ["Total Flights", club.flights],
        ["Hours Flown", club.hoursFlown.toFixed(2)],
        ["Total Movements", club.movements],
        ["Home Landings", club.homeLandings],
        ["Instructional Flights", club.instructional],
        ["Distinct Pilots", club.pilots],
        ["Aircraft Flown", club.aircraftFlown],
        ["Total Fuel (L)", club.fuel],
        ["Total Cost", `£${club.totalCost.toFixed(2)}`],
        ["Busiest Aircraft", busiest && busiest.hoursFlown > 0
          ? `${busiest.aircraft} (${busiest.hoursFlown.toFixed(2)} h)`
          : "—"]
      ];

  // KPI strip across rows 3-4, five per row.
  kpis.forEach(([label, value], i) => {
    const row = 3 + Math.floor(i / 5);
    const col = excelColumnName((i % 5) * 2 + 1);
    const cell = ws.getCell(`${col}${row}`);
    cell.value = `${label}: ${value}`;
    styleValueCell(cell);
    cell.font = { bold: true };
    ws.mergeCells(`${col}${row}:${excelColumnName((i % 5) * 2 + 2)}${row}`);
  });

  ws.columns = SUMMARY_COLUMNS.map(({ key, width }) => ({ key, width }));

  const tableStartRow = 6;

  if (summaries.length > 0) {
    ws.addTable({
      name: "tbl_summary",
      ref: `A${tableStartRow}`,
      headerRow: true,
      totalsRow: true,
      style: { theme: "TableStyleMedium9", showRowStripes: true },
      columns: SUMMARY_COLUMNS.map(c => ({ name: c.header, ...c.total })),
      rows: summaries.map(s => SUMMARY_COLUMNS.map(c => s[c.key] ?? ""))
    });

    const firstDataRow = tableStartRow + 1;
    const totalsRow = tableStartRow + summaries.length + 1;

    SUMMARY_COLUMNS.forEach((col, index) => {
      if (!col.format) return;
      const letter = excelColumnName(index + 1);
      for (let row = firstDataRow; row <= totalsRow; row++) {
        applyCellFormat(ws.getCell(`${letter}${row}`), col.format);
      }
    });

    // Pilot breakdown table — scoped to the single aircraft, or aggregated
    // across all exported aircraft.
    const pilotAgg = new Map();
    summaries.forEach(s => {
      s._pilotBreakdown.forEach(p => {
        const key = p.pilot.toUpperCase();
        const agg = pilotAgg.get(key) || {
          pilot: p.pilot,
          flights: 0,
          hoursFlown: 0,
          instructional: 0,
          movements: 0
        };
        agg.flights += p.flights;
        agg.hoursFlown += p.hoursFlown;
        agg.instructional += p.instructional;
        agg.movements += p.movements;
        pilotAgg.set(key, agg);
      });
    });

    const pilotRows = Array.from(pilotAgg.values())
      .map(p => ({ ...p, hoursFlown: round2(p.hoursFlown) }))
      .sort((a, b) => b.hoursFlown - a.hoursFlown || b.flights - a.flights);

    if (pilotRows.length > 0) {
      const pilotTitleRow = totalsRow + 2;
      const pilotHeaderRow = pilotTitleRow + 1;

      const titleCell = ws.getCell(`A${pilotTitleRow}`);
      titleCell.value = singleAircraft
        ? `Pilot Breakdown - ${singleAircraft.aircraft}`
        : "Pilot Breakdown - All Aircraft";
      titleCell.font = { size: 12, bold: true };

      ws.addTable({
        name: "tbl_pilots",
        ref: `A${pilotHeaderRow}`,
        headerRow: true,
        totalsRow: true,
        style: { theme: "TableStyleMedium2", showRowStripes: true },
        columns: PILOT_COLUMNS.map(c => ({ name: c.header, ...c.total })),
        rows: pilotRows.map(p => PILOT_COLUMNS.map(c => p[c.key] ?? ""))
      });

      const pFirstRow = pilotHeaderRow + 1;
      const pTotalsRow = pilotHeaderRow + pilotRows.length + 1;
      PILOT_COLUMNS.forEach((col, index) => {
        if (!col.format) return;
        const letter = excelColumnName(index + 1);
        for (let row = pFirstRow; row <= pTotalsRow; row++) {
          applyCellFormat(ws.getCell(`${letter}${row}`), col.format);
        }
      });
    }
  } else {
    const headerRow = ws.getRow(tableStartRow);
    headerRow.values = SUMMARY_COLUMNS.map(c => c.header);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" }
    };
    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true
    };

    ws.getCell(`A${tableStartRow + 1}`).value =
      "No rows found for selected date range.";
    ws.mergeCells(`A${tableStartRow + 1}:${lastColLetter}${tableStartRow + 1}`);
    ws.getCell(`A${tableStartRow + 1}`).font = {
      italic: true,
      color: { argb: "FF6C757D" }
    };
  }
}

export const handler = async (event) => {
  try {
    if (event.requestContext?.http?.method === "OPTIONS") {
      return {
        statusCode: 204,
        headers: CORS_HEADERS,
        body: ""
      };
    }

    const admin = await assertAdmin(event);
    if (!admin.ok) {
      return response(admin.statusCode, { message: admin.message });
    }

    const body = parseBody(event);

    const fromDate = String(body.fromDate || "").trim();
    const toDate = String(body.toDate || "").trim();
    const fileName = String(body.fileName || "flightlogs-export.xlsx").trim();

    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
      return response(400, {
        message: "fromDate and toDate must be in YYYY-MM-DD format"
      });
    }

    if (fromDate > toDate) {
      return response(400, {
        message: "fromDate cannot be after toDate"
      });
    }

    const requestedAircraft =
      Array.isArray(body.aircraft) && body.aircraft.length
        ? body.aircraft.map(normalizeReg).filter(Boolean)
        : AIRCRAFT_LIST;

    const aircraftToExport = requestedAircraft.filter(a =>
      AIRCRAFT_LIST.includes(a)
    );

    if (!aircraftToExport.length) {
      return response(400, { message: "No valid aircraft selected" });
    }

    const groupedRows = {};

    for (const aircraft of aircraftToExport) {
      const allItems = await queryAllForAircraft(aircraft);
      const filtered = allItems.filter(item =>
        inDateRange(item, fromDate, toDate)
      );
      groupedRows[aircraft] = buildWorkbookRows(filtered);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EFM Web App";
    workbook.created = new Date();
    workbook.modified = new Date();

    addSummarySheet(workbook, groupedRows, fromDate, toDate);

    // Accounting-oriented condensed sheets first, then the full detail sheets.
    for (const aircraft of aircraftToExport) {
      const cws = workbook.addWorksheet(safeSheetName(`Condensed - ${aircraft}`));
      addCondensedSheet(cws, aircraft, groupedRows[aircraft], fromDate, toDate);
    }

    for (const aircraft of aircraftToExport) {
      const ws = workbook.addWorksheet(safeSheetName(aircraft));
      addSheet(ws, aircraft, groupedRows[aircraft], fromDate, toDate);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    return binaryResponse(
      fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`,
      base64
    );
  } catch (err) {
    console.error("flightlogs export failed", err);

    return response(500, {
      message: "Failed to generate export",
      error: err?.message || "Unknown error"
    });
  }
};

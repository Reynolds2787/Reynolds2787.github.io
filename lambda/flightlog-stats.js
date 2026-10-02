import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FLIGHTLOGS_TABLE = process.env.FLIGHTLOGS_TABLE || "EFM_FlightLogs";
const FLIGHTLOGS_INDEX =
  process.env.FLIGHTLOGS_INDEX || "aircraft-createdAt-index";
const USER_TABLE = process.env.USER_TABLE || "UserProfiles";
const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || "https://efmapp.co.uk";

const AIRCRAFT_LIST = ["G-AZWS", "G-BPAF", "G-EDGI", "G-AVYL", "G-BULL"];
const WARRIOR_FLEET = ["G-BPAF", "G-EDGI", "G-AZWS"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS"
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function firstNonEmpty(item, keys, fallback = null) {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function numberValue(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, dp = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(dp)) : 0;
}

function normalizeReg(value) {
  return String(value || "").trim().toUpperCase();
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function monthKey(date) {
  return String(date || "").slice(0, 7);
}

function parseDurationHours(value) {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value).trim();
  const hhmm = text.match(/^(\d+):([0-5]\d)$/);
  if (hhmm) {
    return Number(hhmm[1]) + Number(hhmm[2]) / 60;
  }

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getTachoUsed(item) {
  const stored = firstNonEmpty(item, [
    "tachometerUsed",
    "tachoDiff",
    "tachoDifference"
  ]);

  if (stored !== null) return Math.max(0, numberValue(stored, 0));

  const start = firstNonEmpty(item, ["startTacho", "tachoStart"]);
  const end = firstNonEmpty(item, ["endTacho", "tachoEnd"]);

  if (start !== null && end !== null) {
    const diff = numberValue(end, 0) - numberValue(start, 0);
    if (diff >= 0 && diff < 100) return diff;
  }

  const before = firstNonEmpty(item, [
    "currentHoursBeforeFlight",
    "flightTimeBefore",
    "flightHoursBefore",
    "remainingFlightHoursBeforeFlight"
  ]);
  const after = firstNonEmpty(item, [
    "currentHoursAfterFlight",
    "flightTimeAfter",
    "flightHoursAfter",
    "remainingFlightHoursAfterFlight"
  ]);

  if (before !== null && after !== null) {
    const diff = numberValue(after, 0) - numberValue(before, 0);
    if (diff >= 0 && diff < 100) return diff;
  }

  return 0;
}

function getAirborneHours(item) {
  return parseDurationHours(firstNonEmpty(item, [
    "airTime",
    "flightTime"
  ], 0));
}

function getEngineHours(item) {
  const tacho = getTachoUsed(item);
  if (tacho > 0) return tacho;

  const before = numberValue(firstNonEmpty(item, [
    "currentHoursBeforeFlight",
    "flightTimeBefore",
    "flightHoursBefore"
  ]), NaN);

  const after = numberValue(firstNonEmpty(item, [
    "currentHoursAfterFlight",
    "flightTimeAfter",
    "flightHoursAfter"
  ]), NaN);

  if (Number.isFinite(before) && Number.isFinite(after)) {
    const diff = after - before;
    if (diff >= 0 && diff < 100) return diff;
  }

  return getAirborneHours(item);
}

function mapRow(item) {
  return {
    aircraft: normalizeReg(item.aircraft),
    flightDate: String(firstNonEmpty(item, ["flightDate", "date", "Date"], "")),
    tachoUsed: getTachoUsed(item),
    engineHours: getEngineHours(item),
    airborneHours: getAirborneHours(item),
    kembleLandings: numberValue(firstNonEmpty(item, [
      "landingsKemble",
      "homeLandings"
    ]), 0),
    lfcFuel: numberValue(firstNonEmpty(item, [
      "fuelUpliftedLfc",
      "fuelUploadKemble"
    ]), 0),
    awayFuel: numberValue(firstNonEmpty(item, [
      "fuelUpliftedElsewhere",
      "fuelUploadAway"
    ]), 0),
    oilUploaded: numberValue(firstNonEmpty(item, [
      "oilUploaded",
      "oilHome"
    ]), 0)
  };
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

  return { ok: true };
}

async function queryAllForAircraft(aircraft) {
  const items = [];
  let ExclusiveStartKey;

  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: FLIGHTLOGS_TABLE,
        IndexName: FLIGHTLOGS_INDEX,
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

function monthsBetween(startDate, endDate) {
  const result = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  const cursor = new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    1
  ));

  const last = new Date(Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    1
  ));

  while (cursor <= last) {
    result.push(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`
    );
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return result;
}

function yearsBetween(startDate, endDate) {
  const startYear = Number(String(startDate).slice(0, 4));
  const endYear = Number(String(endDate).slice(0, 4));
  const years = [];

  for (let year = startYear; year <= endYear; year += 1) {
    years.push(String(year));
  }

  return years;
}

function buildStats(rows, startDate, endDate) {
  const months = monthsBetween(startDate, endDate);
  const years = yearsBetween(startDate, endDate);

  const monthlyMap = new Map(
    months.map(month => [
      month,
      Object.fromEntries(AIRCRAFT_LIST.map(a => [a, 0]))
    ])
  );

  const flightsByAircraft = Object.fromEntries(
    AIRCRAFT_LIST.map(a => [a, 0])
  );

  const fuelByAircraft = Object.fromEntries(
    AIRCRAFT_LIST.map(a => [a, { lfcFuel: 0, awayFuel: 0 }])
  );

  const consumption = Object.fromEntries(
    AIRCRAFT_LIST.map(a => [
      a,
      {
        engineHours: 0,
        airborneHours: 0,
        oilUploaded: 0,
        fuelUploaded: 0
      }
    ])
  );

  let totalFlights = 0;
  let totalTachoUsed = 0;
  let totalKembleLandings = 0;
  let totalFuelUplift = 0;

  for (const row of rows) {
    if (!AIRCRAFT_LIST.includes(row.aircraft)) continue;

    totalFlights += 1;
    totalTachoUsed += row.tachoUsed;
    totalKembleLandings += row.kembleLandings;
    totalFuelUplift += row.lfcFuel + row.awayFuel;

    flightsByAircraft[row.aircraft] += 1;
    fuelByAircraft[row.aircraft].lfcFuel += row.lfcFuel;
    fuelByAircraft[row.aircraft].awayFuel += row.awayFuel;

    const month = monthKey(row.flightDate);
    const monthEntry = monthlyMap.get(month);
    if (monthEntry) monthEntry[row.aircraft] += row.tachoUsed;

    const c = consumption[row.aircraft];
    c.engineHours += row.engineHours;
    c.airborneHours += row.airborneHours;
    c.oilUploaded += row.oilUploaded;
    c.fuelUploaded += row.lfcFuel + row.awayFuel;
  }

  const tachoMonthlyByAircraft = months.map(month => {
    const entry = monthlyMap.get(month);
    const row = { month };
    for (const aircraft of AIRCRAFT_LIST) {
      row[aircraft] = round(entry?.[aircraft] || 0, 2);
    }
    return row;
  });

  const running = Object.fromEntries(AIRCRAFT_LIST.map(a => [a, 0]));
  const tachoCumulativeByAircraft = tachoMonthlyByAircraft.map(row => {
    const output = { month: row.month };

    for (const aircraft of AIRCRAFT_LIST) {
      running[aircraft] += numberValue(row[aircraft], 0);
      output[aircraft] = round(running[aircraft], 2);
    }

    return output;
  });

  const warriorFleetYearlyHours = years.map(year => {
    const output = { year, totalHours: 0 };

    for (const aircraft of WARRIOR_FLEET) {
      const hours = rows
        .filter(r => r.aircraft === aircraft && r.flightDate.startsWith(year))
        .reduce((sum, r) => sum + r.tachoUsed, 0);

      output[aircraft] = round(hours, 2);
      output.totalHours += hours;
    }

    output.totalHours = round(output.totalHours, 2);
    return output;
  });

  return {
    aircraftList: AIRCRAFT_LIST,
    summary: {
      totalFlights,
      totalTachoUsed: round(totalTachoUsed, 2),
      totalKembleLandings,
      totalFuelUplift: round(totalFuelUplift, 2)
    },
    tachoMonthlyByAircraft,
    tachoCumulativeByAircraft,
    warriorFleetYearlyHours,
    flightsByAircraft: AIRCRAFT_LIST.map(aircraft => ({
      aircraft,
      flights: flightsByAircraft[aircraft]
    })),
    fuelUpliftTotals: AIRCRAFT_LIST.map(aircraft => ({
      aircraft,
      lfcFuel: round(fuelByAircraft[aircraft].lfcFuel, 2),
      awayFuel: round(fuelByAircraft[aircraft].awayFuel, 2)
    })),
    consumptionByAircraft: AIRCRAFT_LIST.map(aircraft => {
      const c = consumption[aircraft];
      return {
        aircraft,
        engineHours: round(c.engineHours, 2),
        oilUploaded: round(c.oilUploaded, 2),
        fuelUploaded: round(c.fuelUploaded, 2),
        oilBurnPerHour:
          c.engineHours > 0 ? round(c.oilUploaded / c.engineHours, 2) : null,
        fuelBurnPerHour:
          c.airborneHours > 0 ? round(c.fuelUploaded / c.airborneHours, 1) : null
      };
    })
  };
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

    const params = event.queryStringParameters || {};

    const now = new Date();
    const defaultStart = `${now.getUTCFullYear()}-01-01`;
    const defaultEnd = `${now.getUTCFullYear()}-12-31`;

    const startDate = String(params.startDate || defaultStart);
    const endDate = String(params.endDate || defaultEnd);

    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return response(400, {
        message: "startDate and endDate must be YYYY-MM-DD"
      });
    }

    if (startDate > endDate) {
      return response(400, {
        message: "startDate cannot be after endDate"
      });
    }

    const grouped = await Promise.all(
      AIRCRAFT_LIST.map(async aircraft => {
        const items = await queryAllForAircraft(aircraft);
        return items
          .filter(item => {
            const flightDate = String(item?.flightDate || "");
            return flightDate >= startDate && flightDate <= endDate;
          })
          .map(mapRow);
      })
    );

    return response(
      200,
      buildStats(grouped.flat(), startDate, endDate)
    );
  } catch (err) {
    console.error("flightlog stats failed", err);
    return response(500, {
      message: "Unable to load flight statistics",
      error: err?.message || "Unknown error"
    });
  }
};

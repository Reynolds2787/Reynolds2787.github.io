import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FLIGHTLOGS_TABLE = process.env.FLIGHTLOGS_TABLE || "EFM_FlightLogs";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://efmapp.co.uk";
const AIRCRAFT = ["G-AZWS", "G-BPAF", "G-EDGI", "G-BULL"];
const USES_FLIGHT_HOURS = new Set(["G-AZWS", "G-BULL"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Cache-Control": "no-store"
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(item, keys) {
  for (const key of keys) {
    const value = numberOrNull(item?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstPositiveNumber(item, keys) {
  for (const key of keys) {
    const value = numberOrNull(item?.[key]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

function firstNonNegativeNumber(item, keys) {
  for (const key of keys) {
    const value = numberOrNull(item?.[key]);
    if (value !== null && value >= 0) return value;
  }
  return null;
}

function firstText(item, keys) {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function rowTimestamp(item) {
  return [
    item?.flightDate,
    item?.date,
    item?.createdAt,
    item?.updatedAt,
    item?.sk,
    item?.SK
  ]
    .map(value => String(value || ""))
    .join("|");
}

function aircraftRegistration(item) {
  return firstText(item, [
    "aircraft",
    "Aircraft",
    "registration",
    "Registration",
    "aircraftRegistration"
  ]).toUpperCase();
}

function getStatusFromRows(aircraft, rows) {
  const useFlightHours = USES_FLIGHT_HOURS.has(aircraft);
  const newestFirst = rows.slice().sort((a, b) => rowTimestamp(b).localeCompare(rowTimestamp(a)));
  const latestRow = newestFirst[0] || {};

  let currentHours = null;
  let nextServiceDueAt = null;
  let remainingHours = null;

  for (const row of newestFirst) {
    const rowCurrentHours = useFlightHours
      ? firstNumber(row, [
          "currentHoursAfterFlight",
          "currentHoursAfter",
          "flightTimeAfter",
          "flightHoursAfter"
        ])
      : firstNumber(row, [
          "endTacho",
          "tachoEnd",
          "currentTachoAfterFlight",
          "currentTachoAfter"
        ]);
    const shouldUseRowCurrent = useFlightHours
      ? currentHours === null
      : currentHours === null || (rowCurrentHours !== null && rowCurrentHours > currentHours);
    if (rowCurrentHours !== null && shouldUseRowCurrent) {
      currentHours = rowCurrentHours;
    }

    if (nextServiceDueAt === null) {
      nextServiceDueAt = firstPositiveNumber(row, [
        "nextServiceDueAt", "serviceAt", "nextServiceDue",
        "nextMaintenanceDueAt", "maintenanceDueAt"
      ]);
    }

    if (remainingHours === null) {
      remainingHours = useFlightHours
        ? firstNonNegativeNumber(row, [
            "remainingFlightHoursAfterFlight",
            "remainingFlightHoursAfter",
            "flightHoursRemaining"
          ])
        : firstNonNegativeNumber(row, [
            "remainingTachoTimeAfterFlight",
            "remainingTachoTimeAfter",
            "tachoHoursRemaining"
          ]);
    }
  }

  if (nextServiceDueAt === null && currentHours !== null && remainingHours !== null) {
    nextServiceDueAt = Number((currentHours + remainingHours).toFixed(2));
  }

  if (remainingHours === null && currentHours !== null && nextServiceDueAt !== null) {
    remainingHours = Number((nextServiceDueAt - currentHours).toFixed(1));
  }

  return {
    aircraft,
    metric: useFlightHours ? "FLIGHT_HOURS" : "TACHO_HOURS",
    currentHours,
    nextServiceDueAt,
    remainingHours,
    lastFlightDate: firstText(latestRow, ["flightDate", "date", "createdAt"]),
    lastFlightOnChocks: firstText(latestRow, ["onChocks"]),
    lastFlightPic: firstText(latestRow, ["picName", "pic", "PIC", "pilotName"]),
    lastFlightLoggedAt: firstText(latestRow, ["createdAt", "updatedAt", "flightDate", "date"])
  };
}

async function scanFlightLogs() {
  const rows = [];
  let ExclusiveStartKey;

  do {
    const result = await ddb.send(new ScanCommand({
      TableName: FLIGHTLOGS_TABLE,
      ExclusiveStartKey
    }));

    if (Array.isArray(result.Items)) rows.push(...result.Items);
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return rows;
}

export const handler = async event => {
  try {
    if (event.requestContext?.http?.method === "OPTIONS") {
      return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    }

    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userId) return response(401, { message: "Unauthenticated" });

    // EFM_FlightLogs is keyed by the member/flight record rather than aircraft,
    // so group the scan results by registration before calculating fleet status.
    const rows = await scanFlightLogs();
    const rowsByAircraft = new Map(AIRCRAFT.map(aircraft => [aircraft, []]));

    for (const row of rows) {
      const registration = aircraftRegistration(row);
      rowsByAircraft.get(registration)?.push(row);
    }

    const aircraftStatus = AIRCRAFT.map(aircraft =>
      getStatusFromRows(aircraft, rowsByAircraft.get(aircraft))
    );

    return response(200, { aircraftStatus });
  } catch (error) {
    console.error("aircraft status failed", error);
    return response(500, { message: "Unable to load aircraft status" });
  }
};

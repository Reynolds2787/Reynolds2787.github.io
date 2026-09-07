import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FLIGHTLOGS_TABLE = process.env.FLIGHTLOGS_TABLE || "FlightLogs";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://efmapp.co.uk";
const AIRCRAFT = ["G-AZWS", "G-BPAF", "G-EDGI", "G-AVYL", "G-BULL"];
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

function rowTimestamp(item) {
  return [item?.flightDate, item?.createdAt, item?.sk]
    .map(value => String(value || ""))
    .join("|");
}

function getStatusFromRows(aircraft, rows) {
  const useFlightHours = USES_FLIGHT_HOURS.has(aircraft);
  const newestFirst = rows.slice().sort((a, b) => rowTimestamp(b).localeCompare(rowTimestamp(a)));

  let currentHours = null;
  let nextServiceDueAt = null;
  let lastFlightDate = "";

  for (const row of newestFirst) {
    if (!lastFlightDate) lastFlightDate = row.flightDate || row.createdAt || "";

    if (currentHours === null) {
      currentHours = useFlightHours
        ? firstNumber(row, ["currentHoursAfterFlight", "flightTimeAfter", "flightHoursAfter"])
        : firstNumber(row, ["endTacho", "tachoEnd"]);
    }

    if (nextServiceDueAt === null) {
      nextServiceDueAt = firstNumber(row, ["nextServiceDueAt", "serviceAt", "nextServiceDue"]);
    }

    if (currentHours !== null && nextServiceDueAt !== null) break;
  }

  return {
    aircraft,
    metric: useFlightHours ? "FLIGHT_HOURS" : "TACHO_HOURS",
    currentHours,
    nextServiceDueAt,
    remainingHours: currentHours !== null && nextServiceDueAt !== null
      ? Number((nextServiceDueAt - currentHours).toFixed(1))
      : null,
    lastFlightDate
  };
}

async function queryFlightLogs(aircraft) {
  const rows = [];
  let ExclusiveStartKey;

  do {
    const result = await ddb.send(new QueryCommand({
      TableName: FLIGHTLOGS_TABLE,
      KeyConditionExpression: "aircraft = :aircraft",
      ExpressionAttributeValues: { ":aircraft": aircraft },
      ProjectionExpression: [
        "aircraft",
        "sk",
        "flightDate",
        "createdAt",
        "currentHoursAfterFlight",
        "flightTimeAfter",
        "flightHoursAfter",
        "endTacho",
        "tachoEnd",
        "nextServiceDueAt",
        "serviceAt",
        "nextServiceDue"
      ].join(", "),
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

    const rowsByAircraft = await Promise.all(AIRCRAFT.map(queryFlightLogs));
    const aircraftStatus = AIRCRAFT.map((aircraft, index) =>
      getStatusFromRows(aircraft, rowsByAircraft[index])
    );

    return response(200, { aircraftStatus });
  } catch (error) {
    console.error("aircraft status failed", error);
    return response(500, { message: "Unable to load aircraft status" });
  }
};

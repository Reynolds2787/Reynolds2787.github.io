import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE_NAME = process.env.PRICING_TABLE || "AircraftPricing";

// Lock CORS to your domain(s)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://efmapp.co.uk",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

// Receives the Data and converts to JSON

function response(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj)
  };
}

function toNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

function roundMoney(x) {
  // keep pennies stable
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export const handler = async (event) => {
  try {
    // Preflight
    if (event.requestContext?.http?.method === "OPTIONS") {
      return { statusCode: 200, headers: CORS_HEADERS, body: "" };
    }

    // If using HTTP API JWT authorizer, you can optionally enforce auth:
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims?.sub) return response(401, { error: "Unauthorized" });

    // Parse body
    let body;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return response(400, { error: "Invalid JSON body" });
    }

    const aircraft = (body.aircraft || "").trim();
    const tachDiff = toNumber(body.tachDiff);
    const blockMinutes = toNumber(body.blockMinutes);
    const instructional = (body.instuctional);
    const landings = toNumber(body.landingCount);
    const tempMember = (body.tempMember);


    if (!aircraft) return response(400, { error: "aircraft is required" });
    if (!Number.isFinite(blockMinutes) || blockMinutes <= 0) {
      return response(400, { error: "blockMinutes must be a positive number" });
    }

    // Fetch pricing items
    const [aircraftItem, globalItem] = await Promise.all([
      ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: `AIRCRAFT#${aircraft}` }
      })),
      ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: "GLOBAL" }
      }))
    ]);

    if (!aircraftItem?.Item) {
      return response(404, { error: `No pricing found for aircraft ${aircraft}` });
    }

    const hourlyRate = toNumber(aircraftItem.Item.hourlyRate);
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      return response(500, { error: `Invalid hourlyRate stored for ${aircraft}` });
    }

    const instructorHourly = toNumber(globalItem?.Item?.instructorHourly) ?? 0;
    const defaultLandingFee = toNumber(globalItem?.Item?.defaultLandingFee) ?? 0;
    const defaultsurcharge = toNumber(globalItem?.Item?.defaultsurcharge) ?? 0;

    // Core calculation
    
    
    const blockHours = blockMinutes/60;
    const aircraftCost = roundMoney(hourlyRate * tachDiff);
    const instructorCost = instructional ? roundMoney(instructorHourly * blockHours) : 0;
    const surchargeCost = tempMember ? roundMoney(defaultsurcharge) : 0;
    const landingFeesTotal = roundMoney(defaultLandingFee * (landingCount -1))
    
 

    const LFCtotal = roundMoney(aircraftCost + instructorCost + landingFeesTotal);

    return response(200, {

      inputs: { aircraft, blockMinutes, instructional, landingCount },
      rates: { hourlyRate, instructorHourly, defaultLandingFee },
      breakdown: {
        aircraftCost,
        instructorCost,
        landingFeesTotal,
        surchargeCost,
      },
      LFCtotal
    });
  } catch (err) {
    console.error("calculate-payment error:", err);
    return response(500, { error: "Internal server error" });
  }
};

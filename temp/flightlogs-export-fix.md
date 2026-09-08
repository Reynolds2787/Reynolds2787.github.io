# FlightLogs export — flight time fix (minimal)

## Root cause
Desktop app writes the meter readings as `currentHoursBeforeFlight` /
`currentHoursAfterFlight` (DynamoDB `N`). The export's `mapFlightLogRow()`
never reads those keys:

- `flightTimeBefore` matches the stale `remainingTachoTimeBeforeFlight: 0`
  -> exports `0.0`
- `flightTimeAfter` finds nothing (siblings are `NULL`) -> exports blank

## Fix — replace these two mappings in `mapFlightLogRow`

```js
    flightTimeBefore: coerceNumber(firstNonEmpty(item, [
      "currentHoursBeforeFlight",          // desktop app (flight-hours aircraft)
      "flightTimeBefore",
      "flightHoursBefore",
      "remainingFlightHoursBeforeFlight",
      "remainingTachoTimeBeforeFlight"
    ])),

    flightTimeAfter: coerceNumber(firstNonEmpty(item, [
      "currentHoursAfterFlight",           // desktop app (flight-hours aircraft)
      "flightTimeAfter",
      "flightHoursAfter",
      "remainingFlightHoursAfterFlight",
      "remainingTachoTimeAfterFlight"
    ])),
```

Nothing else in the spreadsheet layout changes. "Flight Time" (airTime "00:30")
and "Logged Time" (blockTime "00:50") already map correctly for this item.

## 2dp on the meter columns
The meter reads to 2 decimals (6168.08) but these columns use `format: "decimal"`
= `numFmt "0.0"`, so 6168.08 shows as 6168.1. Add a `decimal2` format:

```js
function applyCellFormat(cell, format) {
  if (format === "currency") cell.numFmt = "£#,##0.00";
  if (format === "decimal") cell.numFmt = "0.0";
  if (format === "decimal2") cell.numFmt = "0.00";
  if (format === "integer") cell.numFmt = "0";
  if (format === "date") cell.numFmt = "dd/mm/yyyy";
}
```

and change just these two entries in EXPORT_COLUMNS:

```js
  { header: "Flight Time Before", key: "flightTimeBefore", width: 18, format: "decimal2" },
  { header: "Flight Time After",  key: "flightTimeAfter",  width: 18, format: "decimal2" },
```

Tacho Start/End/Difference stay at 1dp.

## Note for tacho aircraft (G-BPAF, G-EDGI, G-AVYL)
This sample is G-AZWS (serviceMetricUsed = FLIGHT_HOURS). Check what the desktop
app writes for a tacho-serviced aircraft — if those rows also leave
currentHours* empty, "Flight Time Before/After" stays blank for them and the
tacho figure lives in Tacho Start / Tacho End / Tacho Difference instead
(startTacho 4160.1, endTacho 4160.7, tachometerUsed 0.6 — all present in the
same item, so those columns already work).

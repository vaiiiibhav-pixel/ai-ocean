const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0";

// Load synthetic ocean dataset
const dataPath = path.join(__dirname, "server", "ocean_data.json");
const oceanData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

// CORS headers
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Helper to find nearest depth index
function findDepthIndex(depth) {
  let best = 0;
  let bestDist = Infinity;
  oceanData.depths.forEach((d, i) => {
    const dist = Math.abs(d - depth);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

// 1. Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 2. Model metadata
app.get("/api/model/meta", (req, res) => {
  res.json({
    region: oceanData.region,
    depths: oceanData.depths,
    times: oceanData.times,
    variables: ["temperature", "salinity"],
  });
});

// 3. Model timesteps
app.get("/api/model/timesteps", (req, res) => {
  res.json({ times: oceanData.times });
});

// 4. Model 2D field slice
app.get("/api/model/field", (req, res) => {
  const variable = req.query.variable || "temperature";
  const depth = parseFloat(req.query.depth ?? "0");
  const timeIndex = parseInt(req.query.time_index ?? "0", 10);

  if (variable !== "temperature" && variable !== "salinity") {
    return res.status(400).json({ error: "variable must be temperature or salinity" });
  }

  const di = findDepthIndex(depth);
  const ti = Math.max(0, Math.min(timeIndex, oceanData.times.length - 1));
  const values = oceanData[variable][ti][di];

  res.json({
    variable,
    depth: oceanData.depths[di],
    time_index: ti,
    time_label: oceanData.times[ti],
    lons: oceanData.lons,
    lats: oceanData.lats,
    values,
  });
});

// 5. Model current vectors
app.get("/api/model/currents", (req, res) => {
  const depth = parseFloat(req.query.depth ?? "0");
  const timeIndex = parseInt(req.query.time_index ?? "0", 10);

  const di = findDepthIndex(depth);
  const ti = Math.max(0, Math.min(timeIndex, oceanData.times.length - 1));

  res.json({
    depth: oceanData.depths[di],
    time_index: ti,
    time_label: oceanData.times[ti],
    lons: oceanData.lons,
    lats: oceanData.lats,
    u: oceanData.u[ti][di],
    v: oceanData.v[ti][di],
  });
});

// 6. Vertical cross-section (transect)
app.get("/api/model/transect", (req, res) => {
  const variable = req.query.variable || "temperature";
  const latIndex = parseInt(req.query.lat_index ?? "10", 10);
  const timeIndex = parseInt(req.query.time_index ?? "0", 10);

  if (variable !== "temperature" && variable !== "salinity") {
    return res.status(400).json({ error: "variable must be temperature or salinity" });
  }

  const li = Math.max(0, Math.min(latIndex, oceanData.lats.length - 1));
  const ti = Math.max(0, Math.min(timeIndex, oceanData.times.length - 1));
  const values = oceanData[variable][ti].map((depthGrid) => depthGrid[li]);

  res.json({
    lat: oceanData.lats[li],
    time_index: ti,
    time_label: oceanData.times[ti],
    depths: oceanData.depths,
    lons: oceanData.lons,
    values,
  });
});

// 7. Validation summary (model vs observations)
app.get("/api/validation/summary", (req, res) => {
  const perVarErrors = { temperature: [], salinity: [] };
  const perStation = [];

  for (const s of oceanData.stations) {
    const modelCol = oceanData.model_columns[s.id];
    const stationErrors = { temperature: [], salinity: [] };

    for (const varName of ["temperature", "salinity"]) {
      modelCol.depths.forEach((depth, di) => {
        const oi = s.depths.indexOf(depth);
        if (oi !== -1) {
          const err = s[varName][oi] - modelCol[varName][di];
          perVarErrors[varName].push(err);
          stationErrors[varName].push(err);
        }
      });
    }

    const rmse = (errs) =>
      errs.length
        ? Math.round(Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length) * 1000) / 1000
        : null;
    const bias = (errs) =>
      errs.length
        ? Math.round((errs.reduce((a, b) => a + b, 0) / errs.length) * 1000) / 1000
        : null;

    perStation.push({
      id: s.id,
      temperature_bias: bias(stationErrors.temperature),
      temperature_rmse: rmse(stationErrors.temperature),
      salinity_bias: bias(stationErrors.salinity),
      salinity_rmse: rmse(stationErrors.salinity),
    });
  }

  const rmseAll = (errs) =>
    errs.length
      ? Math.round(Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length) * 1000) / 1000
      : null;
  const biasAll = (errs) =>
    errs.length
      ? Math.round((errs.reduce((a, b) => a + b, 0) / errs.length) * 1000) / 1000
      : null;

  res.json({
    n_stations: oceanData.stations.length,
    temperature_rmse: rmseAll(perVarErrors.temperature),
    temperature_bias: biasAll(perVarErrors.temperature),
    salinity_rmse: rmseAll(perVarErrors.salinity),
    salinity_bias: biasAll(perVarErrors.salinity),
    per_station: perStation,
  });
});

// 8. In-situ observation station list
app.get("/api/observations", (req, res) => {
  res.json(
    oceanData.stations.map((s) => ({
      id: s.id,
      kind: s.kind,
      lon: s.lon,
      lat: s.lat,
      profile_time_label: s.profile_time_label,
    }))
  );
});

// 9. Single observation station profile + nearest model column
app.get("/api/observations/:station_id/profile", (req, res) => {
  const station = oceanData.stations.find((s) => s.id === req.params.station_id);
  if (!station) {
    return res.status(404).json({ error: "station not found" });
  }
  const modelColumn = oceanData.model_columns[station.id];
  res.json({ station, model_column: modelColumn });
});

// Serve frontend static files
const frontendDir = path.join(__dirname, "frontend");
app.use(express.static(frontendDir));

// Fallback to index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`Ocean 3D Platform running at http://${HOST}:${PORT}`);
});

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
    variables: ["temperature", "salinity", "chlorophyll"],
    organization: "Ministry of Earth Sciences (MoES) / INCOIS",
    problem_statement: "SIH26067",
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

  if (variable !== "temperature" && variable !== "salinity" && variable !== "chlorophyll") {
    return res.status(400).json({ error: "variable must be temperature, salinity, or chlorophyll" });
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

  if (variable !== "temperature" && variable !== "salinity" && variable !== "chlorophyll") {
    return res.status(400).json({ error: "variable must be temperature, salinity, or chlorophyll" });
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
  const perVarErrors = { temperature: [], salinity: [], chlorophyll: [] };
  const perStation = [];

  for (const s of oceanData.stations) {
    const modelCol = oceanData.model_columns[s.id];
    if (!modelCol) continue;
    const stationErrors = { temperature: [], salinity: [], chlorophyll: [] };

    for (const varName of ["temperature", "salinity", "chlorophyll"]) {
      if (!s[varName] || !modelCol[varName]) continue;
      modelCol.depths.forEach((depth, di) => {
        const oi = s.depths.indexOf(depth);
        if (oi !== -1 && s[varName][oi] !== undefined && modelCol[varName][di] !== undefined) {
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
      kind: s.kind,
      temperature_bias: bias(stationErrors.temperature),
      temperature_rmse: rmse(stationErrors.temperature),
      salinity_bias: bias(stationErrors.salinity),
      salinity_rmse: rmse(stationErrors.salinity),
      chlorophyll_bias: bias(stationErrors.chlorophyll),
      chlorophyll_rmse: rmse(stationErrors.chlorophyll),
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
    chlorophyll_rmse: rmseAll(perVarErrors.chlorophyll),
    chlorophyll_bias: biasAll(perVarErrors.chlorophyll),
    per_station: perStation,
  });
});

// 8. In-situ observation station list
app.get("/api/observations", (req, res) => {
  res.json(
    oceanData.stations.map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name || s.id,
      lon: s.lon,
      lat: s.lat,
      profile_time_label: s.profile_time_label,
      trajectory: s.trajectory || null,
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

// 10. Operational Mandate: Potential Fishing Zones (PFZ) Advisory
app.get("/api/operational/pfz", (req, res) => {
  const timeIndex = parseInt(req.query.time_index ?? "0", 10);
  const ti = Math.max(0, Math.min(timeIndex, oceanData.times.length - 1));
  const sstGrid = oceanData.temperature[ti][0];
  const chlaGrid = oceanData.chlorophyll[ti][0];
  const lats = oceanData.lats;
  const lons = oceanData.lons;

  const pfzZones = [];
  // Scan grid for strong SST gradients coincident with high chlorophyll
  for (let i = 1; i < lats.length - 1; i++) {
    for (let j = 1; j < lons.length - 1; j++) {
      const lat = lats[i];
      const lon = lons[j];
      const chla = chlaGrid[i][j];

      // Horizontal temperature gradient (°C per degree)
      const dSstDx = (sstGrid[i][j + 1] - sstGrid[i][j - 1]) / 2;
      const dSstDy = (sstGrid[i + 1][j] - sstGrid[i - 1][j]) / 2;
      const gradMag = Math.hypot(dSstDx, dSstDy);

      // INCOIS PFZ criteria: SST front gradient > 0.4°C/deg and Chlorophyll > 0.6 mg/m3
      if (gradMag > 0.35 && chla > 0.65) {
        let sector = "Open Ocean";
        let targetSpecies = "Pelagic / Tuna";
        if (lon < 75 && lat > 8 && lat < 23) {
          sector = "West Coast (Arabian Sea / Gujarat / Kerala)";
          targetSpecies = "Indian Mackerel, Oil Sardine, Yellowfin Tuna";
        } else if (lon >= 78 && lat > 10 && lat < 22) {
          sector = "East Coast (Bay of Bengal / AP / Odisha)";
          targetSpecies = "Skipjack Tuna, Ribbonfish, Hilsa";
        }

        pfzZones.push({
          lat: Math.round(lat * 10) / 10,
          lon: Math.round(lon * 10) / 10,
          sst: Math.round(sstGrid[i][j] * 10) / 10,
          chlorophyll: Math.round(chla * 100) / 100,
          thermal_gradient: Math.round(gradMag * 100) / 100,
          sector,
          target_species: targetSpecies,
          validity: `${oceanData.times[ti]} + 48h`,
        });
      }
    }
  }

  res.json({
    time_label: oceanData.times[ti],
    advisory_count: pfzZones.length,
    zones: pfzZones,
  });
});

// 11. Operational Mandate: Tropical Cyclone Heat Potential (TCHP) & 26°C Isotherm
app.get("/api/operational/tchp", (req, res) => {
  const timeIndex = parseInt(req.query.time_index ?? "0", 10);
  const ti = Math.max(0, Math.min(timeIndex, oceanData.times.length - 1));
  const lats = oceanData.lats;
  const lons = oceanData.lons;
  const depths = oceanData.depths;

  const d26Grid = [];
  const tchpGrid = [];
  const highRiskZones = [];

  for (let i = 0; i < lats.length; i++) {
    const d26Row = [];
    const tchpRow = [];
    for (let j = 0; j < lons.length; j++) {
      // Find depth where temperature drops to 26°C
      let d26 = 0;
      let tchp = 0; // in kJ/cm2
      const tProfile = depths.map((_, di) => oceanData.temperature[ti][di][i][j]);

      if (tProfile[0] >= 26.0) {
        for (let di = 0; di < depths.length - 1; di++) {
          const tTop = tProfile[di];
          const tBot = tProfile[di + 1];
          const zTop = depths[di];
          const zBot = depths[di + 1];

          if (tBot >= 26.0) {
            const meanT = (tTop + tBot) / 2;
            const dz = zBot - zTop;
            tchp += 4.184 * 1.025 * (meanT - 26.0) * dz * 0.1;
            d26 = zBot;
          } else {
            // Interpolate crossing
            const frac = (tTop - 26.0) / (tTop - tBot);
            const zCross = zTop + frac * (zBot - zTop);
            const meanT = (tTop + 26.0) / 2;
            const dz = zCross - zTop;
            tchp += 4.184 * 1.025 * (meanT - 26.0) * dz * 0.1;
            d26 = Math.round(zCross);
            break;
          }
        }
      }

      d26 = Math.max(0, Math.round(d26));
      tchp = Math.max(0, Math.round(tchp * 10) / 10);
      d26Row.push(d26);
      tchpRow.push(tchp);

      // TCHP > 60 kJ/cm2 indicates conditions favorable for rapid cyclone intensification
      if (tchp >= 55 && lats[i] >= 8 && lats[i] <= 22) {
        highRiskZones.push({
          lat: lats[i],
          lon: lons[j],
          d26,
          tchp,
          basin: lons[j] > 78 ? "Bay of Bengal" : "Arabian Sea",
          risk_level: tchp >= 80 ? "EXTREME" : "HIGH",
        });
      }
    }
    d26Grid.push(d26Row);
    tchpGrid.push(tchpRow);
  }

  res.json({
    time_label: oceanData.times[ti],
    d26_grid: d26Grid,
    tchp_grid: tchpGrid,
    lats,
    lons,
    high_risk_zones: highRiskZones,
  });
});

// 12. Operational Mandate: Search and Rescue (SAR) & Oil Spill Drift Simulator
app.get("/api/operational/sar-drift", (req, res) => {
  const startLat = parseFloat(req.query.lat ?? "14.0");
  const startLon = parseFloat(req.query.lon ?? "85.0");
  const hours = parseInt(req.query.hours ?? "48", 10);
  const leewayFactor = parseFloat(req.query.leeway ?? "0.03"); // windage leeway 3%

  const ti = 0;
  const lats = oceanData.lats;
  const lons = oceanData.lons;
  const uGrid = oceanData.u[ti][0]; // surface currents
  const vGrid = oceanData.v[ti][0];

  const trajectory = [{ hour: 0, lat: startLat, lon: startLon, search_radius_nm: 2.0 }];
  let curLat = startLat;
  let curLon = startLon;

  for (let h = 1; h <= hours; h++) {
    // Bilinear or nearest-neighbor interpolation of (u, v)
    let bestI = 0, bestDistI = Infinity;
    for (let i = 0; i < lats.length; i++) {
      const d = Math.abs(lats[i] - curLat);
      if (d < bestDistI) { bestDistI = d; bestI = i; }
    }
    let bestJ = 0, bestDistJ = Infinity;
    for (let j = 0; j < lons.length; j++) {
      const d = Math.abs(lons[j] - curLon);
      if (d < bestDistJ) { bestDistJ = d; bestJ = j; }
    }

    const u = uGrid[bestI][bestJ]; // m/s eastward
    const v = vGrid[bestI][bestJ]; // m/s northward

    // Convert velocity to degrees per hour
    // 1 deg lat = 111,000 m; 1 deg lon = 111,000 * cos(lat) m
    const dt = 3600; // seconds in 1 hour
    const dLat = (v * dt) / 111000;
    const dLon = (u * dt) / (111000 * Math.cos((curLat * Math.PI) / 180));

    curLat = Math.round((curLat + dLat) * 10000) / 10000;
    curLon = Math.round((curLon + dLon) * 10000) / 10000;

    // Search radius expands with time due to diffusion and leeway uncertainty
    const radiusNm = Math.round((2.0 + 0.35 * Math.sqrt(h) + h * leewayFactor * 5) * 10) / 10;
    trajectory.push({
      hour: h,
      lat: curLat,
      lon: curLon,
      u: Math.round(u * 100) / 100,
      v: Math.round(v * 100) / 100,
      search_radius_nm: radiusNm,
    });
  }

  res.json({
    initial: { lat: startLat, lon: startLon },
    hours,
    trajectory,
    final_position: trajectory[trajectory.length - 1],
  });
});

// 13. Data Ingestion: Sample Catalog
app.get("/api/ingest/samples", (req, res) => {
  res.json([
    {
      id: "sample_incois_roms_nc",
      name: "INCOIS ROMS Bay of Bengal Forecast (NetCDF CF-1.8)",
      format: "NetCDF",
      type: "model",
      description: "Numerical ocean model hydrodynamic grid with Temperature, Salinity, Current Vectors, and Chlorophyll-a",
      file_size: "1.4 MB",
      variables: ["temperature", "salinity", "u", "v", "chlorophyll"],
    },
    {
      id: "sample_argo_float_nc",
      name: "Ifremer / INCOIS Argo Float WMO 2902345 (NetCDF)",
      format: "NetCDF",
      type: "insitu",
      description: "Autonomous profiling float 2000m depth cast with CTD + BGC sensors in Central Arabian Sea",
      file_size: "185 KB",
      variables: ["PRES", "TEMP", "PSAL", "CHLA"],
    },
    {
      id: "sample_glider_mission_csv",
      name: "INCOIS Slocum Glider Mission BOB-2026 (CSV)",
      format: "CSV",
      type: "glider",
      description: "Sawtooth dive-and-climb profile records (0-500m) along East India Coastal Current (EICC)",
      file_size: "42 KB",
      variables: ["depth", "temperature", "salinity", "chlorophyll"],
    },
    {
      id: "sample_omni_buoy_csv",
      name: "INCOIS OMNI Moored Buoy BD08 Subsurface String (CSV)",
      format: "CSV",
      type: "buoy",
      description: "Moored observatory time-series at 18.2°N, 89.7°E with subsurface inductive sensor string",
      file_size: "36 KB",
      variables: ["depth", "temperature", "salinity"],
    },
  ]);
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

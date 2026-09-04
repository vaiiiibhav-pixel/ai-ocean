/* DataStore backed by a fully embedded JSON snapshot (window.OCEAN_DATA) —
 * used by the no-backend, self-contained demo build. Implements the exact
 * same method names as ApiDataStore so app.js can use either one
 * unchanged (see the store-selection line at the top of app.js). */
(function (global) {
  "use strict";

  class EmbeddedDataStore {
    constructor(data) {
      this.data = data;
    }

    async getMeta() {
      const d = this.data;
      return {
        region: d.region,
        depths: d.depths,
        times: d.times,
        variables: ["temperature", "salinity"],
      };
    }

    _depthIndex(depth) {
      const depths = this.data.depths;
      let best = 0, bestDist = Infinity;
      depths.forEach((dd, i) => {
        const dist = Math.abs(dd - depth);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      return best;
    }

    async getFieldSlice(variable, depth, timeIndex) {
      const d = this.data;
      const di = this._depthIndex(depth);
      const ti = Math.max(0, Math.min(timeIndex, d.times.length - 1));
      const values = d[variable][ti][di];
      return { lons: d.lons, lats: d.lats, values, timeLabel: d.times[ti] };
    }

    async getCurrentsSlice(depth, timeIndex) {
      const d = this.data;
      const di = this._depthIndex(depth);
      const ti = Math.max(0, Math.min(timeIndex, d.times.length - 1));
      return { lons: d.lons, lats: d.lats, u: d.u[ti][di], v: d.v[ti][di] };
    }

    async getStations() {
      return this.data.stations.map((s) => ({
        id: s.id, kind: s.kind, lon: s.lon, lat: s.lat,
        profile_time_label: s.profile_time_label,
      }));
    }

    async getStationProfile(stationId) {
      const station = this.data.stations.find((s) => s.id === stationId);
      const modelColumn = this.data.model_columns[stationId];
      return { station, modelColumn };
    }

    async getTransect(variable, latIndex, timeIndex) {
      const d = this.data;
      const ti = Math.max(0, Math.min(timeIndex, d.times.length - 1));
      const li = Math.max(0, Math.min(latIndex, d.lats.length - 1));
      const values = d[variable][ti].map((depthGrid) => depthGrid[li]); // (depth, lon)
      return {
        lat: d.lats[li], time_index: ti, time_label: d.times[ti],
        depths: d.depths, lons: d.lons, values,
      };
    }

    async getValidationSummary() {
      const d = this.data;
      const perVarErrors = { temperature: [], salinity: [] };
      const perStation = [];
      for (const s of d.stations) {
        const modelCol = d.model_columns[s.id];
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
        const rmse = (errs) => errs.length ? Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length) : null;
        const bias = (errs) => errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;
        perStation.push({
          id: s.id,
          temperature_bias: bias(stationErrors.temperature),
          temperature_rmse: rmse(stationErrors.temperature),
          salinity_bias: bias(stationErrors.salinity),
          salinity_rmse: rmse(stationErrors.salinity),
        });
      }
      const rmseAll = (errs) => errs.length ? Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length) : null;
      const biasAll = (errs) => errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;
      return {
        n_stations: d.stations.length,
        temperature_rmse: rmseAll(perVarErrors.temperature),
        temperature_bias: biasAll(perVarErrors.temperature),
        salinity_rmse: rmseAll(perVarErrors.salinity),
        salinity_bias: biasAll(perVarErrors.salinity),
        per_station: perStation,
      };
    }

    async getPFZ(timeIndex = 0) {
      const d = this.data;
      const ti = Math.max(0, Math.min(timeIndex, d.times.length - 1));
      const sstGrid = d.temperature[ti][0];
      const chlaGrid = d.chlorophyll ? d.chlorophyll[ti][0] : null;
      const lats = d.lats;
      const lons = d.lons;
      const pfzZones = [];

      for (let i = 1; i < lats.length - 1; i++) {
        for (let j = 1; j < lons.length - 1; j++) {
          const lat = lats[i];
          const lon = lons[j];
          const chla = chlaGrid ? chlaGrid[i][j] : 0.8;
          const dSstDx = (sstGrid[i][j + 1] - sstGrid[i][j - 1]) / 2;
          const dSstDy = (sstGrid[i + 1][j] - sstGrid[i - 1][j]) / 2;
          const gradMag = Math.hypot(dSstDx, dSstDy);

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
              validity: `${d.times[ti]} + 48h`,
            });
          }
        }
      }
      return { time_label: d.times[ti], advisory_count: pfzZones.length, zones: pfzZones };
    }

    async getTCHP(timeIndex = 0) {
      const d = this.data;
      const ti = Math.max(0, Math.min(timeIndex, d.times.length - 1));
      const lats = d.lats;
      const lons = d.lons;
      const depths = d.depths;
      const d26Grid = [];
      const tchpGrid = [];
      const highRiskZones = [];

      for (let i = 0; i < lats.length; i++) {
        const d26Row = [];
        const tchpRow = [];
        for (let j = 0; j < lons.length; j++) {
          let d26 = 0;
          let tchp = 0;
          const tProfile = depths.map((_, di) => d.temperature[ti][di][i][j]);

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

      return {
        time_label: d.times[ti],
        d26_grid: d26Grid,
        tchp_grid: tchpGrid,
        lats,
        lons,
        high_risk_zones: highRiskZones,
      };
    }

    async getSARDrift(lat, lon, hours = 48, leeway = 0.03) {
      const d = this.data;
      const startLat = parseFloat(lat ?? 14.0);
      const startLon = parseFloat(lon ?? 85.0);
      const ti = 0;
      const lats = d.lats;
      const lons = d.lons;
      const uGrid = d.u[ti][0];
      const vGrid = d.v[ti][0];

      const trajectory = [{ hour: 0, lat: startLat, lon: startLon, search_radius_nm: 2.0 }];
      let curLat = startLat;
      let curLon = startLon;

      for (let h = 1; h <= hours; h++) {
        let bestI = 0, bestDistI = Infinity;
        for (let i = 0; i < lats.length; i++) {
          const dist = Math.abs(lats[i] - curLat);
          if (dist < bestDistI) { bestDistI = dist; bestI = i; }
        }
        let bestJ = 0, bestDistJ = Infinity;
        for (let j = 0; j < lons.length; j++) {
          const dist = Math.abs(lons[j] - curLon);
          if (dist < bestDistJ) { bestDistJ = dist; bestJ = j; }
        }

        const u = uGrid[bestI][bestJ];
        const v = vGrid[bestI][bestJ];
        const dt = 3600;
        const dLat = (v * dt) / 111000;
        const dLon = (u * dt) / (111000 * Math.cos((curLat * Math.PI) / 180));

        curLat = Math.round((curLat + dLat) * 10000) / 10000;
        curLon = Math.round((curLon + dLon) * 10000) / 10000;
        const radiusNm = Math.round((2.0 + 0.35 * Math.sqrt(h) + h * leeway * 5) * 10) / 10;
        trajectory.push({
          hour: h,
          lat: curLat,
          lon: curLon,
          search_radius_nm: radiusNm,
          u_current: Math.round(u * 100) / 100,
          v_current: Math.round(v * 100) / 100,
        });
      }

      return {
        initial_position: { lat: startLat, lon: startLon },
        forecast_hours: hours,
        leeway_coefficient: leeway,
        trajectory,
      };
    }

    async getSamples() {
      return {
        samples: [
          {
            id: "incois-roms-arabian-sea",
            title: "INCOIS ROMS High-Res Operational Hydrodynamic Model",
            source: "Indian National Centre for Ocean Information Services (INCOIS)",
            grid: "1/12° (~9 km) Mercator",
            coverage: "Arabian Sea & Bay of Bengal",
            format: "NetCDF-4 / CF-1.8",
            vars: ["temp", "salt", "u", "v", "chla"],
          },
          {
            id: "copernicus-argo-indianocean",
            title: "Copernicus Marine Core Fleet In-Situ Argo Float Compilation",
            source: "Euro-Argo ERIC / Ifremer / INCOIS Joint",
            grid: "Lagrangian profiles (0–2000 dbar)",
            coverage: "Equatorial Indian Ocean & BoB",
            format: "NetCDF-4 / OceanSITES",
            vars: ["TEMP_ADJUSTED", "PSAL_ADJUSTED", "PRES"],
          },
        ],
      };
    }
  }

  global.EmbeddedDataStore = EmbeddedDataStore;
})(window);

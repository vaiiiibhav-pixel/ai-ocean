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
  }

  global.EmbeddedDataStore = EmbeddedDataStore;
})(window);

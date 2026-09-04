/* DataStore backed by the Flask REST API (backend/app/main.py). */
(function (global) {
  "use strict";

  class ApiDataStore {
    constructor(baseUrl = "") {
      this.baseUrl = baseUrl;
    }

    async getMeta() {
      const r = await fetch(`${this.baseUrl}/api/model/meta`);
      return r.json();
    }

    async getFieldSlice(variable, depth, timeIndex) {
      const r = await fetch(`${this.baseUrl}/api/model/field?variable=${variable}&depth=${depth}&time_index=${timeIndex}`);
      const d = await r.json();
      return { lons: d.lons, lats: d.lats, values: d.values, timeLabel: d.time_label };
    }

    async getCurrentsSlice(depth, timeIndex) {
      const r = await fetch(`${this.baseUrl}/api/model/currents?depth=${depth}&time_index=${timeIndex}`);
      const d = await r.json();
      return { lons: d.lons, lats: d.lats, u: d.u, v: d.v };
    }

    async getStations() {
      const r = await fetch(`${this.baseUrl}/api/observations`);
      return r.json();
    }

    async getStationProfile(stationId) {
      const r = await fetch(`${this.baseUrl}/api/observations/${stationId}/profile`);
      const d = await r.json();
      return { station: d.station, modelColumn: d.model_column };
    }

    async getTransect(variable, latIndex, timeIndex) {
      const r = await fetch(`${this.baseUrl}/api/model/transect?variable=${variable}&lat_index=${latIndex}&time_index=${timeIndex}`);
      return r.json();
    }

    async getValidationSummary() {
      const r = await fetch(`${this.baseUrl}/api/validation/summary`);
      return r.json();
    }

    async getPFZ(timeIndex = 0) {
      const r = await fetch(`${this.baseUrl}/api/operational/pfz?time_index=${timeIndex}`);
      return r.json();
    }

    async getTCHP(timeIndex = 0) {
      const r = await fetch(`${this.baseUrl}/api/operational/tchp?time_index=${timeIndex}`);
      return r.json();
    }

    async getSARDrift(lat, lon, hours = 48, leeway = 0.03) {
      const r = await fetch(`${this.baseUrl}/api/operational/sar-drift?lat=${lat}&lon=${lon}&hours=${hours}&leeway=${leeway}`);
      return r.json();
    }

    async getSamples() {
      const r = await fetch(`${this.baseUrl}/api/ingest/samples`);
      return r.json();
    }
  }

  global.ApiDataStore = ApiDataStore;
})(window);

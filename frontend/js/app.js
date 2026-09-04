/* App entry point — wires a DataStore (embedded or live-API, chosen below)
 * to the OceanScene and the page's UI controls. Used unchanged by both the
 * live app (served by the Flask backend) and the self-contained demo
 * build (data embedded, see datastore-embedded.js / build_demo.py). */
(function () {
  "use strict";

  // Pick a data source: an embedded JSON snapshot (self-contained demo
  // build) if present, otherwise the live Flask backend.
  const store = window.OCEAN_DATA
    ? new window.EmbeddedDataStore(window.OCEAN_DATA)
    : new window.ApiDataStore("");

  const canvas = document.getElementById("scene");
  const scene = new window.OceanScene(canvas);
  scene.attach();

  const state = { depthIndex: 0, timeIndex: 0, variable: "temperature", playing: false };
  let depths = [0, 50, 100, 200, 500];
  let times = [];
  let allStations = [];

  const el = (id) => document.getElementById(id);
  const depthSlider = el("depthSlider");
  const timeSlider = el("timeSlider");
  const timeLabel = el("timeLabel");
  const depthLabel = el("depthLabel");
  const varRadios = document.querySelectorAll('input[name="variable"]');
  const showCurrents = el("showCurrents");
  const showStations = el("showStations");
  const playBtn = el("playBtn");
  const legend = el("legend");
  const stationPanel = el("stationPanel");
  const stationPanelClose = el("stationPanelClose");
  const resetViewBtn = el("resetViewBtn");
  const loadingOverlay = el("loadingOverlay");
  const hoverTip = el("hoverTip");
  const stationSearch = el("stationSearch");
  const stationListEl = el("stationList");
  const stationCountLabel = el("stationCountLabel");
  const validationPanel = el("validationPanel");
  const exportCsvBtn = el("exportCsvBtn");
  const transectBtn = el("transectBtn");
  const transectPanel = el("transectPanel");
  const transectPanelClose = el("transectPanelClose");
  const transectLatSlider = el("transectLatSlider");
  const transectLatLabel = el("transectLatLabel");

  let lastStationProfile = null; // for CSV export

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  function drawLegend(field) {
    const ctx = legend.getContext("2d");
    const w = legend.width, h = legend.height;
    ctx.clearRect(0, 0, w, h);
    for (let x = 0; x < w; x++) {
      const t = x / w;
      const v = field.min + t * (field.max - field.min);
      ctx.fillStyle = window.ColorMaps.valueToCSS(v, field.min, field.max, state.variable);
      ctx.fillRect(x, 0, 1, h);
    }
    ctx.fillStyle = "#dfeeff";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(field.min.toFixed(1), 2, h - 3);
    const maxText = field.max.toFixed(1);
    ctx.fillText(maxText, w - 8 * maxText.length, h - 3);
  }

  async function refreshField() {
    const depth = depths[state.depthIndex];
    const [field, currents] = await Promise.all([
      store.getFieldSlice(state.variable, depth, state.timeIndex),
      store.getCurrentsSlice(depth, state.timeIndex),
    ]);
    scene.setVariable(state.variable);
    scene.animateFieldTo(field, showCurrents.checked ? currents : null);
    // drawLegend needs scene.field's min/max, which animateFieldTo sets
    // synchronously via the initial setField call inside it.
    requestAnimationFrame(() => drawLegend(scene.field));
    timeLabel.textContent = field.timeLabel || times[state.timeIndex] || "";
    depthLabel.textContent = `${depth} m`;
    if (transectPanel && !transectPanel.hidden) refreshTransect().catch(console.error);
  }

  function renderStationList(filterText) {
    const q = (filterText || "").trim().toUpperCase();
    stationListEl.innerHTML = "";
    const filtered = allStations.filter((s) => !q || s.id.toUpperCase().includes(q));
    for (const s of filtered) {
      const row = document.createElement("div");
      row.className = "station-row" + (s.id === scene.selectedStationId ? " selected" : "");
      row.innerHTML = `<span class="dot ${s.kind}"></span>${s.id} <span class="kind">${s.kind}</span>`;
      row.addEventListener("click", () => openStation(s.id).catch(console.error));
      stationListEl.appendChild(row);
    }
    stationCountLabel.textContent = `(${filtered.length}/${allStations.length})`;
  }

  async function openStation(stationId) {
    const { station, modelColumn } = await store.getStationProfile(stationId);
    lastStationProfile = { station, modelColumn };
    scene.selectedStationId = stationId;
    scene.render();
    renderStationList(stationSearch.value);
    stationPanel.hidden = false;
    el("stationTitle").textContent = `${station.id} (${station.kind})`;
    el("stationMeta").textContent =
      `${station.lat.toFixed(2)}°, ${station.lon.toFixed(2)}° — profile ${station.profile_time_label}`;
    const chartCanvas = el("profileChart");
    window.ProfileChart.drawProfileChart(chartCanvas, { station, modelColumn, variable: state.variable });
  }

  async function exportProfileCsv() {
    if (!lastStationProfile) return;
    const { station, modelColumn } = lastStationProfile;
    const rows = [["depth_m", "obs_temperature_c", "obs_salinity_psu", "model_temperature_c", "model_salinity_psu"]];
    station.depths.forEach((depth, i) => {
      const mi = modelColumn.depths.indexOf(depth);
      rows.push([
        depth,
        station.temperature[i], station.salinity[i],
        mi !== -1 ? modelColumn.temperature[mi] : "",
        mi !== -1 ? modelColumn.salinity[mi] : "",
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const filename = `${station.id}_profile.csv`;

    // When this page is running inside the claude.ai Artifact viewer, a
    // plain <a download> link is inert there — use the platform's
    // downloads capability instead (see frontend README note in app.js).
    // Outside that host (the live app / standalone demo in a normal
    // browser tab), window.claude is absent and we fall back to a
    // regular blob download.
    if (window.claude && typeof window.claude.use === "function") {
      try {
        const downloads = await window.claude.use("downloads");
        if (downloads) {
          await downloads.save({ filename, data: csv });
          return;
        }
      } catch (e) {
        console.warn("downloads.save failed or was declined:", e && e.code ? e.code : e);
        return; // don't fall back to a blob link here — it would silently no-op in this host
      }
    }

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function refreshValidation() {
    const summary = await store.getValidationSummary();
    const tFmt = (v) => (v === null || v === undefined ? "—" : v.toFixed(2));
    validationPanel.innerHTML = `
      <div class="row"><span>Stations compared</span><span>${summary.n_stations}</span></div>
      <div class="row"><span>Temp RMSE / bias</span><span>${tFmt(summary.temperature_rmse)}°C / ${tFmt(summary.temperature_bias)}°C</span></div>
      <div class="row"><span>Salinity RMSE / bias</span><span>${tFmt(summary.salinity_rmse)} / ${tFmt(summary.salinity_bias)} PSU</span></div>
    `;
  }

  async function refreshTransect() {
    const latIndex = Number(transectLatSlider.value);
    const data = await store.getTransect(state.variable, latIndex, state.timeIndex);
    transectLatLabel.textContent = `${Math.abs(data.lat).toFixed(1)}°${data.lat >= 0 ? "N" : "S"}`;
    window.TransectChart.drawTransect(el("transectChart"), {
      depths: data.depths, lons: data.lons, values: data.values,
      variable: state.variable, latLabel: transectLatLabel.textContent,
    });
  }

  scene.onStationClick = (id) => { openStation(id).catch(console.error); };
  scene.onStationHover = (id, screenPos) => {
    if (!id || !screenPos) { hoverTip.hidden = true; return; }
    hoverTip.hidden = false;
    hoverTip.textContent = id;
    hoverTip.style.left = `${screenPos.sx + 12}px`;
    hoverTip.style.top = `${screenPos.sy - 8}px`;
  };

  depthSlider.addEventListener("input", () => {
    state.depthIndex = Number(depthSlider.value);
    refreshField().catch(console.error);
  });
  timeSlider.addEventListener("input", () => {
    state.timeIndex = Number(timeSlider.value);
    refreshField().catch(console.error);
  });
  varRadios.forEach((r) => r.addEventListener("change", () => {
    if (r.checked) { state.variable = r.value; refreshField().catch(console.error); }
  }));
  showCurrents.addEventListener("change", () => refreshField().catch(console.error));
  showStations.addEventListener("change", () => {
    scene.setStations(showStations.checked ? allStations : []);
    scene.render();
  });
  stationPanelClose.addEventListener("click", () => {
    stationPanel.hidden = true;
    scene.selectedStationId = null;
    scene.render();
    renderStationList(stationSearch.value);
  });
  stationSearch.addEventListener("input", () => renderStationList(stationSearch.value));
  exportCsvBtn.addEventListener("click", exportProfileCsv);
  resetViewBtn.addEventListener("click", () => scene.resetView());

  transectBtn.addEventListener("click", () => {
    transectPanel.hidden = !transectPanel.hidden;
    if (!transectPanel.hidden) refreshTransect().catch(console.error);
  });
  transectPanelClose.addEventListener("click", () => { transectPanel.hidden = true; });
  transectLatSlider.addEventListener("input", () => refreshTransect().catch(console.error));

  playBtn.addEventListener("click", () => {
    state.playing = !state.playing;
    playBtn.textContent = state.playing ? "⏸ Pause" : "▶ Play";
    if (state.playing) tick();
  });
  function tick() {
    if (!state.playing) return;
    state.timeIndex = (state.timeIndex + 1) % (times.length || 6);
    timeSlider.value = state.timeIndex;
    refreshField().then(() => setTimeout(tick, 1100)).catch(console.error);
  }

  window.addEventListener("resize", () => { resizeCanvas(); scene.render(); });

  async function init() {
    resizeCanvas();
    const meta = await store.getMeta();
    depths = meta.depths;
    times = meta.times;
    depthSlider.max = depths.length - 1;
    timeSlider.max = times.length - 1;

    allStations = await store.getStations();
    scene.setStations(allStations);
    renderStationList("");

    transectLatSlider.max = 20; // grid has 21 lat rows (indices 0..20)

    await refreshField();
    refreshValidation().catch((e) => { validationPanel.textContent = "unavailable"; console.error(e); });

    loadingOverlay.hidden = true;
  }

  init().catch((err) => {
    console.error(err);
    loadingOverlay.hidden = true;
    el("loadError").hidden = false;
  });
})();

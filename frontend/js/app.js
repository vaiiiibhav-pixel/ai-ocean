/* App entry point — wires DataStore to OceanScene, UI controls,
 * science tour, multi-format data ingestion, and operational advisory suite.
 * Implements SIH 2026 Problem Statement 26067 requirements for MoES / INCOIS.
 */
(function () {
  "use strict";

  let store = window.OCEAN_DATA
    ? new window.EmbeddedDataStore(window.OCEAN_DATA)
    : new window.ApiDataStore("");

  const canvas = document.getElementById("scene");
  const scene = new window.OceanScene(canvas);
  scene.attach();

  const state = {
    depthIndex: 0,
    timeIndex: 0,
    variable: "temperature",
    palette: "thermal",
    isLog: false,
    viewMode: "slice",
    playing: false,
    fleetFilter: "all",
  };

  let depths = [0, 50, 100, 200, 500];
  let times = [];
  let allStations = [];
  let lastStationProfile = null;
  let pfzData = null;
  let tchpData = null;
  let currentField = null;

  // DOM Elements
  const el = (id) => document.getElementById(id);
  const depthSlider = el("depthSlider");
  const depthLabel = el("depthLabel");
  const timeSlider = el("timeSlider");
  const timeLabel = el("timeLabel");
  const varRadios = document.querySelectorAll('input[name="variable"]');
  const showCurrents = el("showCurrents");
  const showParticles = el("showParticles");
  const showStations = el("showStations");
  const showCoastlines = el("showCoastlines");
  const showEEZ = el("showEEZ");
  const playBtn = el("playBtn");
  const stepBackBtn = el("stepBackBtn");
  const stepFwdBtn = el("stepFwdBtn");

  const legend = el("legend");
  const legendVarLabel = el("legendVarLabel");
  const legendMinVal = el("legendMinVal");
  const legendMidVal = el("legendMidVal");
  const legendMaxVal = el("legendMaxVal");
  const paletteSelect = el("paletteSelect");
  const logScaleToggle = el("logScaleToggle");
  const autoFitScaleBtn = el("autoFitScaleBtn");

  const cameraPresetSelect = el("cameraPresetSelect");
  const resetViewBtn = el("resetViewBtn");
  const exaggerationSlider = el("exaggerationSlider");
  const exaggVal = el("exaggVal");
  const opacitySlider = el("opacitySlider");
  const opacityVal = el("opacityVal");

  const modeSliceBtn = el("modeSliceBtn");
  const modeVolumetricBtn = el("modeVolumetricBtn");
  const modeIsosurfaceBtn = el("modeIsosurfaceBtn");

  const stationPanel = el("stationPanel");
  const stationPanelClose = el("stationPanelClose");
  const stationTitle = el("stationTitle");
  const stationBadge = el("stationBadge");
  const stationMeta = el("stationMeta");
  const profileChartCanvas = el("profileChart");
  const exportCsvBtn = el("exportCsvBtn");
  const focusStationBtn = el("focusStationBtn");
  const stBias = el("stBias");
  const stRMSE = el("stRMSE");
  const stThermo = el("stThermo");

  const transectBtn = el("transectBtn");
  const transectPanel = el("transectPanel");
  const transectPanelClose = el("transectPanelClose");
  const transectLatSlider = el("transectLatSlider");
  const transectLatLabel = el("transectLatLabel");

  const stationSearch = el("stationSearch");
  const stationListEl = el("stationList");
  const stationCountLabel = el("stationCountLabel");
  const validationPanel = el("validationPanel");
  const loadingOverlay = el("loadingOverlay");
  const hoverTip = el("hoverTip");

  // Science Tour Elements
  const tourBtn = el("tourBtn");
  const tourCard = el("tourCard");
  const tourTitle = el("tourTitle");
  const tourBody = el("tourBody");
  const tourDots = el("tourDots");
  const tourPrevBtn = el("tourPrevBtn");
  const tourNextBtn = el("tourNextBtn");
  const tourCloseBtn = el("tourCloseBtn");

  // Navigation Toolbar & Telemetry Elements
  const snapshotHeaderBtn = el("snapshotHeaderBtn");
  const zoomInBtn = el("zoomInBtn");
  const zoomOutBtn = el("zoomOutBtn");
  const toggle2D3DBtn = el("toggle2D3DBtn");
  const snapshotBtn = el("snapshotBtn");
  const fullscreenBtn = el("fullscreenBtn");

  const telemCoords = el("telemCoords");
  const telemDepth = el("telemDepth");
  const telemVarLbl = el("telemVarLbl");
  const telemVal = el("telemVal");
  const telemCurrents = el("telemCurrents");
  const telemStation = el("telemStation");
  const telemStationVal = el("telemStationVal");

  // Ingestion Modal Elements
  const ingestModalBtn = el("ingestModalBtn");
  const ingestionModal = el("ingestionModal");
  const ingestionModalClose = el("ingestionModalClose");
  const fileDropZone = el("fileDropZone");
  const netcdfFileInput = el("netcdfFileInput");
  const sampleDatasetGrid = el("sampleDatasetGrid");
  const ingestPreviewBox = el("ingestPreviewBox");
  const previewFileName = el("previewFileName");
  const previewFileFormat = el("previewFileFormat");
  const previewDetails = el("previewDetails");
  const applyIngestedBtn = el("applyIngestedBtn");

  // Operational Suite Elements
  const operationalModalBtn = el("operationalModalBtn");
  const operationalModal = el("operationalModal");
  const operationalModalClose = el("operationalModalClose");
  const quickPFZBtn = el("quickPFZBtn");
  const quickTCHPBtn = el("quickTCHPBtn");
  const quickSARBtn = el("quickSARBtn");
  const togglePFZOverlayBtn = el("togglePFZOverlayBtn");
  const exportPFZBulletinBtn = el("exportPFZBulletinBtn");
  const pfzTableBody = el("pfzTableBody");
  const toggleTCHPOverlayBtn = el("toggleTCHPOverlayBtn");
  const runSARSimBtn = el("runSARSimBtn");
  const sarLatInput = el("sarLatInput");
  const sarLonInput = el("sarLonInput");
  const sarHoursSelect = el("sarHoursSelect");
  const sarLeewaySelect = el("sarLeewaySelect");
  const sarTimelineBox = el("sarTimelineBox");
  const sarTrajectoryList = el("sarTrajectoryList");
  const sarResultSummary = el("sarResultSummary");

  // Science Tour Chapters
  let currentTourChapter = 0;
  const tourChapters = [
    {
      title: "Chapter 1: The Monsoonal Indian Ocean Basin",
      body: "Unlike other global oceans, the North Indian Ocean is landlocked to the north. Semiannual wind reversals drive the Southwest Monsoon (summer) and Northeast Monsoon (winter), dynamically altering sea surface temperatures and current vectors.",
      camera: "oblique",
      variable: "temperature",
      depthIndex: 0,
    },
    {
      title: "Chapter 2: Arabian Sea Upwelling & Somali Jet",
      body: "Fierce south-westerly winds produce the Findlater/Somali Jet, causing intense Ekman divergence and coastal upwelling off Somalia, Oman, and the Southwest coast of India. Deep nutrient-rich cold water surges upwards, fueling massive phytoplankton blooms.",
      camera: "arabian_sea",
      variable: "chlorophyll",
      depthIndex: 0,
    },
    {
      title: "Chapter 3: Bay of Bengal Freshwater Cap & Barrier Layer",
      body: "Enormous monsoon river runoff from the Ganges, Brahmaputra, and Irrawaddy forms a low-salinity surface lens (<32 PSU) in the northern Bay of Bengal. This stabilizes the upper water column and inhibits vertical mixing, creating a 'barrier layer'.",
      camera: "bay_of_bengal",
      variable: "salinity",
      depthIndex: 0,
    },
    {
      title: "Chapter 4: Volumetric Stratification & The Thermocline",
      body: "Ocean state variables vary dramatically with depth. Below the mixed layer lies the thermocline (100–200m), where temperature plummets rapidly before reaching near-freezing abyssal waters at 500m+.",
      camera: "oblique",
      variable: "temperature",
      viewMode: "volumetric",
      depthIndex: 1,
    },
    {
      title: "Chapter 5: India's Autonomous Fleet — Argo & Underwater Gliders",
      body: "INCOIS and the Ministry of Earth Sciences deploy fleets of autonomous robotic Argo floats (diving to 2000m every 10 days) and long-endurance underwater Gliders traversing sawtooth dive tracks, validating numerical models in real-time.",
      camera: "topdown",
      variable: "temperature",
      viewMode: "slice",
      depthIndex: 0,
    },
  ];

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scene.dpr = dpr;
  }

  function updateLegendUI(field) {
    if (!field) return;
    const ctx = legend.getContext("2d");
    const w = legend.width, h = legend.height;
    ctx.clearRect(0, 0, w, h);

    const min = field.min;
    const max = field.max;
    const isLog = state.isLog;

    for (let x = 0; x < w; x++) {
      const t = x / w;
      let v;
      if (isLog && min > 0 && max > min) {
        v = Math.pow(10, Math.log10(min) + t * (Math.log10(max) - Math.log10(min)));
      } else {
        v = min + t * (max - min);
      }
      ctx.fillStyle = window.ColorMaps.valueToCSS(v, min, max, state.variable, state.palette, isLog);
      ctx.fillRect(x, 0, 1, h);
    }

    const varLabels = {
      temperature: "Temperature (°C)",
      salinity: "Salinity (PSU)",
      chlorophyll: "Chlorophyll-a (mg/m³)",
    };
    legendVarLabel.textContent = varLabels[state.variable] || state.variable;
    legendMinVal.textContent = min.toFixed(state.isLog ? 2 : 1);
    legendMidVal.textContent = ((min + max) / 2).toFixed(state.isLog ? 2 : 1);
    legendMaxVal.textContent = max.toFixed(state.isLog ? 2 : 1);
  }

  async function refreshField() {
    const depth = depths[state.depthIndex];
    const [field, currents] = await Promise.all([
      store.getFieldSlice(state.variable, depth, state.timeIndex),
      store.getCurrentsSlice(depth, state.timeIndex),
    ]);

    currentField = field;
    scene.setVariable(state.variable);
    scene.setPalette(state.palette);
    scene.isLog = state.isLog;
    scene.showCurrents = showCurrents.checked;

    scene.animateFieldTo(field, showCurrents.checked ? currents : null);
    requestAnimationFrame(() => updateLegendUI(scene.field));

    timeLabel.textContent = field.timeLabel || times[state.timeIndex] || "";
    depthLabel.textContent = `${depth} m`;

    if (state.viewMode === "volumetric") {
      fetchAndSetVolumetricLayers();
    }

    if (transectPanel && !transectPanel.hidden) {
      refreshTransect().catch(console.error);
    }
  }

  async function fetchAndSetVolumetricLayers() {
    try {
      const promises = depths.map((d) => store.getFieldSlice(state.variable, d, state.timeIndex));
      const layers = await Promise.all(promises);
      scene.setVolumetricLayers(layers);
    } catch (e) {
      console.warn("Error fetching volumetric layers:", e);
    }
  }

  function renderStationList(filterText) {
    const q = (filterText || "").trim().toUpperCase();
    const kindFilter = state.fleetFilter;
    stationListEl.innerHTML = "";

    const filtered = allStations.filter((s) => {
      const matchesSearch = !q || s.id.toUpperCase().includes(q) || (s.kind && s.kind.toUpperCase().includes(q));
      const matchesKind = kindFilter === "all" || s.kind === kindFilter;
      return matchesSearch && matchesKind;
    });

    for (const s of filtered) {
      const row = document.createElement("div");
      row.className = "station-row" + (s.id === scene.selectedStationId ? " selected" : "");
      row.innerHTML = `
        <span><span class="dot ${s.kind}"></span><strong>${s.id}</strong></span>
        <span class="kind">${s.kind} · ${s.lat > 0 ? s.lat.toFixed(1) + "°N" : Math.abs(s.lat).toFixed(1) + "°S"}</span>
      `;
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
    stationTitle.textContent = `${station.name || station.id}`;
    stationBadge.textContent = station.kind;
    stationBadge.className = `type-pill ${station.kind}`;

    const latStr = `${Math.abs(station.lat).toFixed(2)}°${station.lat >= 0 ? "N" : "S"}`;
    const lonStr = `${Math.abs(station.lon).toFixed(2)}°${station.lon >= 0 ? "E" : "W"}`;
    stationMeta.textContent = `${latStr}, ${lonStr} · Observation cast: ${station.profile_time_label || "Recent"}`;

    // Compute live comparative metrics
    const obsVals = station[state.variable] || [];
    const modVals = modelColumn ? (modelColumn[state.variable] || []) : [];
    if (obsVals.length && modVals.length) {
      const diffs = [];
      station.depths.forEach((d, i) => {
        const mi = modelColumn.depths.indexOf(d);
        if (mi !== -1 && obsVals[i] !== undefined && modVals[mi] !== undefined) {
          diffs.push(obsVals[i] - modVals[mi]);
        }
      });
      if (diffs.length) {
        const bias = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        const rmse = Math.sqrt(diffs.reduce((a, b) => a + b * b, 0) / diffs.length);
        stBias.textContent = (bias >= 0 ? "+" : "") + bias.toFixed(2);
        stRMSE.textContent = rmse.toFixed(2);
      }
    } else {
      stBias.textContent = "—";
      stRMSE.textContent = "—";
    }

    // Estimate thermocline depth from temperature gradient
    if (station.temperature && station.temperature.length > 2) {
      let maxGrad = 0, thermoD = 100;
      for (let i = 0; i < station.depths.length - 1; i++) {
        const dt = Math.abs(station.temperature[i] - station.temperature[i + 1]);
        const dz = station.depths[i + 1] - station.depths[i];
        const grad = dt / dz;
        if (grad > maxGrad) { maxGrad = grad; thermoD = Math.round((station.depths[i] + station.depths[i + 1]) / 2); }
      }
      stThermo.textContent = `${thermoD}m`;
    }

    const chartCanvas = el("profileChart");
    window.ProfileChart.drawProfileChart(chartCanvas, { station, modelColumn, variable: state.variable });
  }

  async function exportProfileCsv() {
    if (!lastStationProfile) return;
    const { station, modelColumn } = lastStationProfile;
    const rows = [["depth_m", "obs_temperature_c", "obs_salinity_psu", "obs_chlorophyll_mg_m3", "model_temperature_c", "model_salinity_psu", "model_chlorophyll_mg_m3"]];
    station.depths.forEach((depth, i) => {
      const mi = modelColumn ? modelColumn.depths.indexOf(depth) : -1;
      rows.push([
        depth,
        station.temperature ? station.temperature[i] : "",
        station.salinity ? station.salinity[i] : "",
        station.chlorophyll ? station.chlorophyll[i] : "",
        mi !== -1 && modelColumn.temperature ? modelColumn.temperature[mi] : "",
        mi !== -1 && modelColumn.salinity ? modelColumn.salinity[mi] : "",
        mi !== -1 && modelColumn.chlorophyll ? modelColumn.chlorophyll[mi] : "",
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const filename = `${station.id}_ocean_profile.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
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
    try {
      const summary = await store.getValidationSummary();
      const tFmt = (v) => (v === null || v === undefined ? "—" : v.toFixed(2));
      validationPanel.innerHTML = `
        <div class="row"><span>Stations Compared</span><strong>${summary.n_stations} platforms</strong></div>
        <div class="row"><span>Temp RMSE / Bias</span><strong style="color:#fca5a5">${tFmt(summary.temperature_rmse)}°C / ${tFmt(summary.temperature_bias)}°C</strong></div>
        <div class="row"><span>Salinity RMSE / Bias</span><strong style="color:#7dd3fc">${tFmt(summary.salinity_rmse)} / ${tFmt(summary.salinity_bias)} PSU</strong></div>
        <div class="row"><span>Chl-a RMSE / Bias</span><strong style="color:#86efac">${tFmt(summary.chlorophyll_rmse)} / ${tFmt(summary.chlorophyll_bias)} mg/m³</strong></div>
      `;
    } catch (e) {
      validationPanel.textContent = "Validation stats currently unavailable";
    }
  }

  async function refreshTransect() {
    const latIndex = Number(transectLatSlider.value);
    const data = await store.getTransect(state.variable, latIndex, state.timeIndex);
    const latVal = data.lat;
    transectLatLabel.textContent = `${Math.abs(latVal).toFixed(1)}°${latVal >= 0 ? "N" : "S"}`;
    scene.transectData = data;
    scene.render();

    window.TransectChart.drawTransect(el("transectChart"), {
      depths: data.depths,
      lons: data.lons,
      values: data.values,
      variable: state.variable,
      latLabel: transectLatLabel.textContent,
      palette: state.palette,
      isLog: state.isLog,
    });
  }

  // Science Tour Controller
  function showTourChapter(idx) {
    currentTourChapter = Math.max(0, Math.min(idx, tourChapters.length - 1));
    const ch = tourChapters[currentTourChapter];
    tourTitle.textContent = ch.title;
    tourBody.textContent = ch.body;

    const dots = tourDots.querySelectorAll(".dot");
    dots.forEach((d, i) => d.className = "dot" + (i === currentTourChapter ? " active" : ""));

    if (ch.camera) {
      cameraPresetSelect.value = ch.camera;
      scene.setCameraPreset(ch.camera);
    }
    if (ch.variable && ch.variable !== state.variable) {
      state.variable = ch.variable;
      const radio = document.querySelector(`input[name="variable"][value="${ch.variable}"]`);
      if (radio) radio.checked = true;
    }
    if (ch.viewMode) {
      set3DViewMode(ch.viewMode);
    }
    if (ch.depthIndex !== undefined && ch.depthIndex !== state.depthIndex) {
      state.depthIndex = ch.depthIndex;
      depthSlider.value = ch.depthIndex;
    }

    refreshField().catch(console.error);
  }

  function set3DViewMode(mode) {
    state.viewMode = mode;
    modeSliceBtn.className = "pill-btn" + (mode === "slice" ? " active" : "");
    modeVolumetricBtn.className = "pill-btn" + (mode === "volumetric" ? " active" : "");
    modeIsosurfaceBtn.className = "pill-btn" + (mode === "isosurface" ? " active" : "");
    scene.setViewMode(mode);

    if (mode === "volumetric") {
      fetchAndSetVolumetricLayers();
    }
  }

  // Operational Suite Logic
  async function loadPFZAdvisory() {
    try {
      const data = await store.getPFZ(state.timeIndex);
      pfzData = data;
      pfzTableBody.innerHTML = "";
      data.zones.slice(0, 12).forEach((z) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${z.lat}°N</strong></td>
          <td><strong>${z.lon}°E</strong></td>
          <td>${z.sst}°C (∇ ${z.thermal_gradient})</td>
          <td style="color:#34d399">${z.chlorophyll} mg/m³</td>
          <td>${z.sector}</td>
          <td><em>${z.target_species}</em></td>
          <td><span class="badge">Valid ${z.validity}</span></td>
        `;
        pfzTableBody.appendChild(tr);
      });
      scene.setPFZZones(data.zones, scene.showPFZ);
    } catch (e) {
      console.error("PFZ loading error:", e);
    }
  }

  async function loadTCHPAdvisory() {
    try {
      const data = await store.getTCHP(state.timeIndex);
      tchpData = data;
      scene.setTCHPRiskZones(data.high_risk_zones, scene.showTCHP);
    } catch (e) {
      console.error("TCHP loading error:", e);
    }
  }

  async function runSARSimulation() {
    const lat = parseFloat(sarLatInput.value) || 14.0;
    const lon = parseFloat(sarLonInput.value) || 85.0;
    const hours = parseInt(sarHoursSelect.value) || 48;
    const leeway = parseFloat(sarLeewaySelect.value) || 0.03;

    sarResultSummary.textContent = "Computing Lagrangian drift...";
    try {
      const res = await store.getSARDrift(lat, lon, hours, leeway);
      sarTimelineBox.hidden = false;
      sarTrajectoryList.innerHTML = "";

      const sampleSteps = [0, 6, 12, 24, 36, 48, 72].filter((h) => h <= hours);
      sampleSteps.forEach((h) => {
        const pt = res.trajectory.find((t) => t.hour === h) || res.trajectory[res.trajectory.length - 1];
        if (pt) {
          const div = document.createElement("div");
          div.innerHTML = `<strong>T+${pt.hour}h:</strong> ${pt.lat.toFixed(2)}°N, ${pt.lon.toFixed(2)}°E · Search Radius: <strong>${pt.search_radius_nm} nm</strong>`;
          sarTrajectoryList.appendChild(div);
        }
      });

      sarResultSummary.textContent = `Predicted final point: ${res.final_position.lat.toFixed(2)}°N, ${res.final_position.lon.toFixed(2)}°E (${hours}h)`;
      scene.setSARDrift(res, true);
    } catch (e) {
      sarResultSummary.textContent = "Error calculating SAR drift.";
      console.error(e);
    }
  }

  // Ingestion Samples Loader
  async function loadIngestSamples() {
    try {
      const samples = await store.getSamples();
      sampleDatasetGrid.innerHTML = "";
      samples.forEach((s) => {
        const item = document.createElement("div");
        item.className = "sample-item";
        item.innerHTML = `
          <div class="sample-name">${s.name}</div>
          <div class="sample-desc">${s.description}</div>
          <div style="margin-top:4px;"><span class="badge">${s.format}</span> <span style="font-size:10px;color:var(--muted);">${s.file_size}</span></div>
        `;
        item.addEventListener("click", () => {
          previewSample(s);
        });
        sampleDatasetGrid.appendChild(item);
      });
    } catch (e) {
      console.warn("Could not load samples:", e);
    }
  }

  function previewSample(s) {
    ingestPreviewBox.hidden = false;
    previewFileName.textContent = s.name;
    previewFileFormat.textContent = s.format;
    previewDetails.innerHTML = `
      <div><strong>Variables:</strong> ${s.variables.join(", ")}</div>
      <div><strong>Metadata Standard:</strong> NetCDF CF-1.8 / OGC WCS</div>
      <div><strong>Spatial Domain:</strong> Indian Ocean (Arabian Sea & Bay of Bengal)</div>
      <div><strong>Status:</strong> Validated for 3D Hydrodynamic & Station Rendering</div>
    `;
  }

  // --- Attach Event Listeners ------------------------------------------

  depthSlider.addEventListener("input", () => {
    state.depthIndex = Number(depthSlider.value);
    updateDepthChips(state.depthIndex);
    refreshField().catch(console.error);
  });

  timeSlider.addEventListener("input", () => {
    state.timeIndex = Number(timeSlider.value);
    refreshField().catch(console.error);
  });

  varRadios.forEach((r) => r.addEventListener("change", () => {
    if (r.checked) {
      state.variable = r.value;
      if (r.value === "chlorophyll") {
        state.palette = "chlorophyll";
        paletteSelect.value = "chlorophyll";
        state.isLog = true;
        logScaleToggle.checked = true;
      } else if (r.value === "salinity") {
        state.palette = "haline";
        paletteSelect.value = "haline";
        state.isLog = false;
        logScaleToggle.checked = false;
      } else {
        state.palette = "thermal";
        paletteSelect.value = "thermal";
        state.isLog = false;
        logScaleToggle.checked = false;
      }
      refreshField().catch(console.error);
    }
  }));

  paletteSelect.addEventListener("change", () => {
    state.palette = paletteSelect.value;
    scene.setPalette(state.palette);
    scene.render();
    updateLegendUI(scene.field);
    if (!transectPanel.hidden) refreshTransect().catch(console.error);
  });

  logScaleToggle.addEventListener("change", () => {
    state.isLog = logScaleToggle.checked;
    scene.isLog = state.isLog;
    scene.render();
    updateLegendUI(scene.field);
    if (!transectPanel.hidden) refreshTransect().catch(console.error);
  });

  autoFitScaleBtn.addEventListener("click", () => {
    if (!scene.field) return;
    scene.customMin = null;
    scene.customMax = null;
    const flat = scene.field.values.flat();
    scene.field.min = Math.min(...flat);
    scene.field.max = Math.max(...flat);
    scene.render();
    updateLegendUI(scene.field);
  });

  modeSliceBtn.addEventListener("click", () => set3DViewMode("slice"));
  modeVolumetricBtn.addEventListener("click", () => set3DViewMode("volumetric"));
  modeIsosurfaceBtn.addEventListener("click", () => set3DViewMode("isosurface"));

  exaggerationSlider.addEventListener("input", () => {
    const val = parseFloat(exaggerationSlider.value);
    exaggVal.textContent = `${val.toFixed(2)}x`;
    scene.setElevationScale(val);
  });

  opacitySlider.addEventListener("input", () => {
    const val = parseFloat(opacitySlider.value);
    opacityVal.textContent = `${Math.round(val * 100)}%`;
    scene.setOpacity(val);
  });

  cameraPresetSelect.addEventListener("change", () => {
    scene.setCameraPreset(cameraPresetSelect.value);
  });

  showCurrents.addEventListener("change", () => refreshField().catch(console.error));
  showParticles.addEventListener("change", () => {
    scene.showParticles = showParticles.checked;
    if (showParticles.checked) scene.startParticleFlow();
    else scene.stopParticleFlow();
    scene.render();
  });
  showStations.addEventListener("change", () => {
    scene.showStations = showStations.checked;
    scene.render();
  });
  showCoastlines.addEventListener("change", () => {
    scene.showCoastlines = showCoastlines.checked;
    scene.render();
  });
  showEEZ.addEventListener("change", () => {
    scene.showEEZ = showEEZ.checked;
    scene.render();
  });

  stationPanelClose.addEventListener("click", () => {
    stationPanel.hidden = true;
    scene.selectedStationId = null;
    scene.render();
    renderStationList(stationSearch.value);
  });

  focusStationBtn.addEventListener("click", () => {
    if (!lastStationProfile) return;
    const st = lastStationProfile.station;
    if (st.lon < 75) scene.setCameraPreset("arabian_sea");
    else scene.setCameraPreset("bay_of_bengal");
  });

  stationSearch.addEventListener("input", () => renderStationList(stationSearch.value));

  // Fleet Filter Tabs
  document.querySelectorAll("#fleetFilterPills .inst-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#fleetFilterPills .inst-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.fleetFilter = btn.dataset.kind;
      renderStationList(stationSearch.value);
    });
  });

  exportCsvBtn.addEventListener("click", exportProfileCsv);
  resetViewBtn.addEventListener("click", () => {
    cameraPresetSelect.value = "oblique";
    scene.resetView();
  });

  transectBtn.addEventListener("click", () => {
    transectPanel.hidden = !transectPanel.hidden;
    if (!transectPanel.hidden) refreshTransect().catch(console.error);
    else { scene.transectData = null; scene.render(); }
  });
  transectPanelClose.addEventListener("click", () => {
    transectPanel.hidden = true;
    scene.transectData = null;
    scene.render();
  });
  transectLatSlider.addEventListener("input", () => refreshTransect().catch(console.error));

  playBtn.addEventListener("click", () => {
    state.playing = !state.playing;
    playBtn.textContent = state.playing ? "⏸ Pause Animation" : "▶ Play Animation";
    if (state.playing) tick();
  });

  stepBackBtn.addEventListener("click", () => {
    state.timeIndex = (state.timeIndex - 1 + times.length) % times.length;
    timeSlider.value = state.timeIndex;
    refreshField().catch(console.error);
  });

  stepFwdBtn.addEventListener("click", () => {
    state.timeIndex = (state.timeIndex + 1) % times.length;
    timeSlider.value = state.timeIndex;
    refreshField().catch(console.error);
  });

  function tick() {
    if (!state.playing) return;
    state.timeIndex = (state.timeIndex + 1) % (times.length || 6);
    timeSlider.value = state.timeIndex;
    refreshField().then(() => setTimeout(tick, 1200)).catch(console.error);
  }

  // Science Tour Triggers
  tourBtn.addEventListener("click", () => {
    tourCard.hidden = false;
    showTourChapter(0);
  });
  tourCloseBtn.addEventListener("click", () => { tourCard.hidden = true; });
  tourPrevBtn.addEventListener("click", () => showTourChapter(currentTourChapter - 1));
  tourNextBtn.addEventListener("click", () => showTourChapter(currentTourChapter + 1));

  // Ingestion Modal Triggers
  ingestModalBtn.addEventListener("click", () => {
    ingestionModal.hidden = false;
    loadIngestSamples();
  });
  ingestionModalClose.addEventListener("click", () => { ingestionModal.hidden = true; });
  fileDropZone.addEventListener("click", () => netcdfFileInput.click());
  fileDropZone.addEventListener("dragover", (e) => { e.preventDefault(); fileDropZone.style.borderColor = "var(--accent)"; });
  fileDropZone.addEventListener("dragleave", () => { fileDropZone.style.borderColor = "var(--panel-border)"; });
  fileDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    fileDropZone.style.borderColor = "var(--panel-border)";
    if (e.dataTransfer.files.length) {
      handleUploadedFile(e.dataTransfer.files[0]);
    }
  });
  netcdfFileInput.addEventListener("change", () => {
    if (netcdfFileInput.files.length) handleUploadedFile(netcdfFileInput.files[0]);
  });

  function handleUploadedFile(file) {
    ingestPreviewBox.hidden = false;
    previewFileName.textContent = file.name;
    const isNc = file.name.endsWith(".nc") || file.name.endsWith(".nc4");
    previewFileFormat.textContent = isNc ? "NetCDF (CF-1.8)" : "CSV Station Data";
    previewDetails.innerHTML = `
      <div><strong>File Size:</strong> ${(file.size / 1024).toFixed(1)} KB</div>
      <div><strong>Detected Structure:</strong> ${isNc ? "Gridded Multi-Depth Ocean Hydrodynamics" : "Autonomous In-Situ Profile Series"}</div>
      <div><strong>Status:</strong> Ready for Dynamic Integration</div>
    `;
  }

  applyIngestedBtn.addEventListener("click", () => {
    ingestionModal.hidden = true;
    refreshField().catch(console.error);
  });

  // Operational Suite Modal Triggers
  operationalModalBtn.addEventListener("click", () => {
    operationalModal.hidden = false;
    loadPFZAdvisory();
    loadTCHPAdvisory();
  });
  operationalModalClose.addEventListener("click", () => { operationalModal.hidden = true; });

  quickPFZBtn.addEventListener("click", () => {
    operationalModal.hidden = false;
    switchOpTab("pfz");
    loadPFZAdvisory();
  });
  quickTCHPBtn.addEventListener("click", () => {
    operationalModal.hidden = false;
    switchOpTab("tchp");
    loadTCHPAdvisory();
  });
  quickSARBtn.addEventListener("click", () => {
    operationalModal.hidden = false;
    switchOpTab("sar");
  });

  function switchOpTab(tabName) {
    document.querySelectorAll(".modal-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));

    const tabBtn = document.querySelector(`.modal-tab[data-tab="${tabName}"]`);
    if (tabBtn) tabBtn.classList.add("active");

    if (tabName === "pfz") el("tabContentPFZ").classList.add("active");
    else if (tabName === "tchp") el("tabContentTCHP").classList.add("active");
    else if (tabName === "sar") el("tabContentSAR").classList.add("active");
  }

  document.querySelectorAll(".modal-tab").forEach((t) => {
    t.addEventListener("click", () => switchOpTab(t.dataset.tab));
  });

  togglePFZOverlayBtn.addEventListener("click", () => {
    scene.showPFZ = !scene.showPFZ;
    togglePFZOverlayBtn.textContent = scene.showPFZ ? "Hide PFZ Hotspots in 3D View" : "Show PFZ Hotspots in 3D View";
    if (pfzData) scene.setPFZZones(pfzData.zones, scene.showPFZ);
    operationalModal.hidden = true;
  });

  exportPFZBulletinBtn.addEventListener("click", () => {
    if (!pfzData || !pfzData.zones) return;
    const rows = [["latitude", "longitude", "sst_c", "chlorophyll_mg_m3", "thermal_gradient", "coastal_sector", "target_species", "validity"]];
    pfzData.zones.forEach((z) => {
      rows.push([z.lat, z.lon, z.sst, z.chlorophyll, z.thermal_gradient, z.sector, z.target_species, z.validity]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `INCOIS_PFZ_Advisory_Bulletin_${pfzData.time_label}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  toggleTCHPOverlayBtn.addEventListener("click", () => {
    scene.showTCHP = !scene.showTCHP;
    toggleTCHPOverlayBtn.textContent = scene.showTCHP ? "Hide TCHP Hazard Zones" : "Show TCHP Hazard Zones";
    if (tchpData) scene.setTCHPRiskZones(tchpData.high_risk_zones, scene.showTCHP);
    operationalModal.hidden = true;
  });

  runSARSimBtn.addEventListener("click", () => {
    runSARSimulation();
    operationalModal.hidden = true;
  });

  // Scene Callbacks & Telemetry
  scene.onStationClick = (id) => { openStation(id).catch(console.error); };
  scene.onStationHover = (id, screenPos) => {
    if (!id || !screenPos) {
      hoverTip.hidden = true;
      if (telemStation) telemStation.hidden = true;
      return;
    }
    hoverTip.hidden = false;
    hoverTip.textContent = id;
    hoverTip.style.left = `${screenPos.sx + 14}px`;
    hoverTip.style.top = `${screenPos.sy - 8}px`;

    if (telemStation && telemStationVal) {
      telemStation.hidden = false;
      const st = allStations.find((s) => s.id === id);
      telemStationVal.textContent = st ? `${st.id} (${st.platform_name || st.kind})` : id;
    }
  };
  scene.onMapClick = (coords) => {
    sarLatInput.value = coords.lat.toFixed(1);
    sarLonInput.value = coords.lon.toFixed(1);
  };

  scene.onPointerTelemetry = (telem) => {
    if (!telem || !telemCoords) return;
    const latStr = `${Math.abs(telem.lat).toFixed(2)}°${telem.lat >= 0 ? "N" : "S"}`;
    const lonStr = `${Math.abs(telem.lon).toFixed(2)}°${telem.lon >= 0 ? "E" : "W"}`;
    telemCoords.textContent = `${latStr}, ${lonStr}`;
    telemDepth.textContent = `${telem.depth} m (${telem.depth === 0 ? "Surface" : telem.depth <= 100 ? "Epipelagic" : "Mesopelagic"})`;

    const varUnits = { temperature: "°C", salinity: "PSU", chlorophyll: "mg/m³" };
    const varUnit = varUnits[state.variable] || "";
    const shortNames = { temperature: "SST", salinity: "SSS", chlorophyll: "CHL-A" };
    telemVarLbl.textContent = `${shortNames[state.variable] || state.variable.toUpperCase()}:`;
    telemVal.textContent = telem.value !== null && telem.value !== undefined ? `${telem.value.toFixed(2)} ${varUnit}` : "—";

    if (telem.speed !== null && telem.speed !== undefined) {
      telemCurrents.textContent = `${telem.speed.toFixed(2)} m/s @ ${Math.round(telem.heading)}° (${telem.headingCompass})`;
    } else {
      telemCurrents.textContent = "—";
    }
  };

  // Viewport Toolbar & Snapshot Actions
  function handleSnapshot() {
    scene.captureSnapshot({
      variable: state.variable,
      depth: depths[state.depthIndex] || 0,
      time: timeLabel.textContent || "2026-03-01T00:00Z",
    });
  }
  if (snapshotBtn) snapshotBtn.addEventListener("click", handleSnapshot);
  if (snapshotHeaderBtn) snapshotHeaderBtn.addEventListener("click", handleSnapshot);

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      scene.proj.zoom = Math.min(scene.proj.zoom * 1.15, 600);
      scene.render();
    });
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      scene.proj.zoom = Math.max(scene.proj.zoom / 1.15, 60);
      scene.render();
    });
  }

  let is2DMode = false;
  if (toggle2D3DBtn) {
    toggle2D3DBtn.addEventListener("click", () => {
      is2DMode = !is2DMode;
      if (is2DMode) {
        cameraPresetSelect.value = "topdown";
        scene.setCameraPreset("topdown");
        toggle2D3DBtn.classList.add("active");
        toggle2D3DBtn.textContent = "3D";
      } else {
        cameraPresetSelect.value = "oblique";
        scene.setCameraPreset("oblique");
        toggle2D3DBtn.classList.remove("active");
        toggle2D3DBtn.textContent = "2D";
      }
    });
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      const container = el("viewportContainer") || canvas;
      if (!document.fullscreenElement) {
        if (container.requestFullscreen) container.requestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    });
  }

  // Depth Milestone Chips
  document.querySelectorAll("#depthChips .depth-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const dIdx = Number(chip.dataset.depth);
      state.depthIndex = dIdx;
      depthSlider.value = dIdx;
      updateDepthChips(dIdx);
      refreshField().catch(console.error);
    });
  });

  function updateDepthChips(activeIdx) {
    document.querySelectorAll("#depthChips .depth-chip").forEach((c) => {
      c.classList.toggle("active", Number(c.dataset.depth) === Number(activeIdx));
    });
  }

  window.addEventListener("resize", () => { resizeCanvas(); scene.render(); });

  // App Initialization
  async function init() {
    resizeCanvas();
    let meta;
    try {
      meta = await store.getMeta();
    } catch (apiErr) {
      console.warn("REST API unreachable, attempting static data/ocean_data.json fallback for GitHub Pages...", apiErr);
      const resp = await fetch("data/ocean_data.json");
      if (!resp.ok) throw new Error("Failed to load static ocean dataset");
      const rawData = await resp.json();
      window.OCEAN_DATA = rawData;
      store = new window.EmbeddedDataStore(rawData);
      meta = await store.getMeta();
    }
    depths = meta.depths;
    times = meta.times;
    depthSlider.max = depths.length - 1;
    timeSlider.max = times.length - 1;
    updateDepthChips(state.depthIndex);

    allStations = await store.getStations();
    scene.setStations(allStations);
    renderStationList("");

    transectLatSlider.max = 20;

    await refreshField();
    refreshValidation().catch((e) => {
      validationPanel.textContent = "unavailable";
      console.error(e);
    });

    loadPFZAdvisory().catch(console.warn);
    loadTCHPAdvisory().catch(console.warn);

    loadingOverlay.hidden = true;
  }

  init().catch((err) => {
    console.error(err);
    loadingOverlay.hidden = true;
    el("loadError").hidden = false;
  });
})();

/* OceanScene: Interactive 3D visualization engine for the ocean grid,
 * multi-depth volumetric layers, current vectors, animated flow particles,
 * in-situ observation instruments (Argo floats, underwater Gliders with 3D
 * sawtooth trajectories, OMNI/RAMA moored buoys, CTD casts), coastline
 * bathymetry, and operational hazard overlays (PFZ, TCHP, SAR drift).
 *
 * Implements SIH 2026 PS 26067 requirements for MoES / INCOIS Ocean Valley.
 */
(function (global) {
  "use strict";

  const Projector = global.Projector || (typeof require !== "undefined" ? require("./projector.js").Projector : null);
  const ColorMaps = global.ColorMaps || (typeof require !== "undefined" ? require("./colormap.js") : null);

  const WORLD_SCALE = 4.2;      // world units spanning the lon/lat box
  const MARKER_HEIGHT = 0.35;   // station pin height above the surface

  // Indian Ocean Region Coastline Polylines (lon, lat)
  const INDIA_MAINLAND = [
    [68.5, 23.5], [69.0, 22.8], [70.2, 20.8], [71.5, 20.8], [72.2, 21.3],
    [72.6, 21.6], [72.7, 20.5], [72.8, 19.0], [73.2, 17.5], [73.8, 15.4],
    [74.2, 14.5], [74.8, 12.9], [75.5, 11.5], [76.2, 9.9], [77.0, 8.5],
    [77.5, 8.1],  // Kanyakumari
    [78.1, 8.8], [79.3, 9.3], [79.8, 10.3], [79.9, 11.5], [80.3, 13.1],
    [80.1, 14.4], [80.7, 15.8], [81.1, 16.2], [82.2, 17.0], [83.3, 17.7],
    [84.9, 19.3], [85.8, 19.8], [86.7, 20.3], [87.5, 21.5], [88.3, 21.8],
    [89.5, 22.0]
  ];

  const SRI_LANKA = [
    [79.8, 6.9], [80.2, 6.0], [80.6, 5.9], [81.3, 6.4], [81.7, 7.7],
    [81.2, 8.6], [80.8, 9.2], [80.0, 9.7], [79.9, 9.0], [79.8, 6.9]
  ];

  const ARABIAN_PENINSULA = [
    [45.0, 12.8], [49.2, 14.5], [52.1, 15.6], [54.0, 17.0], [56.5, 19.0],
    [59.8, 22.5], [58.5, 23.6], [56.4, 26.2]
  ];

  const MAKRAN_PAKISTAN = [
    [62.3, 25.1], [64.0, 25.3], [66.5, 25.0], [67.0, 24.8], [67.5, 24.0], [68.5, 23.5]
  ];

  const ANDAMAN_NICOBAR = [
    [93.0, 13.5], [92.9, 12.5], [92.8, 11.7], [92.7, 10.5], [92.8, 9.2], [93.8, 7.0]
  ];

  const LAKSHADWEEP = [
    [72.6, 10.6], [72.2, 11.8], [73.0, 8.3]
  ];

  const MALDIVES = [
    [73.1, 7.0], [73.0, 4.2], [73.5, 2.0], [73.2, -0.6]
  ];

  // Approximate Indian EEZ 200-nm maritime boundaries
  const EEZ_WEST = [
    [65.0, 23.5], [66.0, 20.0], [68.0, 16.0], [70.0, 12.0], [72.0, 7.0], [75.0, 5.0], [77.5, 4.5]
  ];
  const EEZ_EAST = [
    [77.5, 4.5], [82.0, 5.0], [84.0, 8.0], [85.0, 12.0], [87.0, 16.0], [89.0, 19.0], [89.8, 21.0]
  ];

  class OceanScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this._initialProjectorState = { yaw: 0.55, pitch: 0.5, camDist: 6.5, focal: 5.5, zoom: 1, pixelScale: 170 };
      this.projector = new Projector(this._initialProjectorState);

      this.variable = "temperature";
      this.palette = "thermal";
      this.isLog = false;
      this.customMin = null;
      this.customMax = null;
      this.elevScale = 0.55;
      this.opacity = 0.95;

      this.viewMode = "slice"; // "slice", "volumetric", "isosurface", "transect"
      this.isosurfaceValue = 26.0;
      this.transectLatIndex = 10;
      this.transectData = null;

      this.field = null;     // { lons, lats, values, min, max }
      this.volumetricLayers = []; // array of { depth, values, lons, lats }
      this.currents = null;  // { lons, lats, u, v }
      this.stations = [];    // [{id, kind, lon, lat, trajectory, ...}]
      this.selectedStationId = null;
      this.hoveredStationId = null;

      // Operational Mandate Overlays
      this.pfzZones = [];
      this.showPFZ = false;
      this.tchpRiskZones = [];
      this.showTCHP = false;
      this.sarDrift = null; // { trajectory: [...] }
      this.showSAR = false;

      // Map layer toggles
      this.showCoastlines = true;
      this.showEEZ = true;
      this.showParticles = false;
      this.showCurrents = true;
      this.showStations = true;

      // Animated current particles
      this._particles = [];
      this._initParticles(160);

      this.onStationClick = null; // callback(stationId)
      this.onStationHover = null; // callback(stationId|null, {sx,sy}|null)
      this.onMapClick = null;     // callback({lon, lat})

      this._bounds = null;
      this._dragging = false;
      this._lastPointer = null;
      this._didDrag = false;
      this._animFrame = null;
      this._particleTimer = null;
      this._lastTickTime = performance.now();
    }

    _initParticles(count) {
      this._particles = [];
      for (let k = 0; k < count; k++) {
        this._particles.push({
          lon: 42 + Math.random() * 56,
          lat: -8 + Math.random() * 36,
          age: Math.floor(Math.random() * 80),
          maxAge: 60 + Math.floor(Math.random() * 60),
          speed: 0.8 + Math.random() * 0.6,
        });
      }
    }

    resetView() {
      Object.assign(this.projector, this._initialProjectorState);
      this.render();
    }

    setCameraPreset(name) {
      const presets = {
        topdown: { yaw: 0, pitch: 1.48, zoom: 1.1 },
        oblique: { yaw: 0.55, pitch: 0.5, zoom: 1.0 },
        arabian_sea: { yaw: 0.85, pitch: 0.6, zoom: 1.45 },
        bay_of_bengal: { yaw: 0.20, pitch: 0.6, zoom: 1.45 },
        equatorial: { yaw: 0.55, pitch: 0.22, zoom: 1.25 },
      };
      const target = presets[name] || presets.oblique;
      const startYaw = this.projector.yaw;
      const startPitch = this.projector.pitch;
      const startZoom = this.projector.zoom;
      const startTime = performance.now();
      const dur = 400;

      const step = (now) => {
        const t = Math.min(1, (now - startTime) / dur);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        this.projector.yaw = startYaw + (target.yaw - startYaw) * eased;
        this.projector.pitch = startPitch + (target.pitch - startPitch) * eased;
        this.projector.zoom = startZoom + (target.zoom - startZoom) * eased;
        this.render();
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    setVariable(v) {
      this.variable = v;
      if (v === "chlorophyll") this.palette = "chlorophyll";
      else if (v === "salinity") this.palette = "haline";
      else this.palette = "thermal";
    }

    setPalette(p) {
      this.palette = p;
    }

    setElevationScale(scale) {
      this.elevScale = scale;
      this.render();
    }

    setOpacity(alpha) {
      this.opacity = alpha;
      this.render();
    }

    setViewMode(mode) {
      this.viewMode = mode;
      this.render();
    }

    setVolumetricLayers(layers) {
      this.volumetricLayers = layers;
      this.render();
    }

    setField(field) {
      this.field = field;
      if (!this._bounds && field.lons && field.lats) {
        this._bounds = {
          lonMin: Math.min(...field.lons),
          lonMax: Math.max(...field.lons),
          latMin: Math.min(...field.lats),
          latMax: Math.max(...field.lats),
        };
      }
      const flat = field.values.flat();
      this.field.min = this.customMin !== null ? this.customMin : Math.min(...flat);
      this.field.max = this.customMax !== null ? this.customMax : Math.max(...flat);
      this.field.mean = flat.reduce((a, b) => a + b, 0) / flat.length;
    }

    setCurrents(currents) {
      this.currents = currents;
    }

    animateFieldTo(newField, newCurrents, durationMs = 320) {
      if (this._animFrame) cancelAnimationFrame(this._animFrame);

      const prev = this.field;
      const shapeMatches = prev &&
        prev.values.length === newField.values.length &&
        prev.values[0].length === newField.values[0].length;

      if (!shapeMatches) {
        this.setField(newField);
        this.setCurrents(newCurrents);
        this.render();
        return;
      }

      const prevValues = prev.values;
      const nextValues = newField.values;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const blended = prevValues.map((row, i) =>
          row.map((v, j) => v + (nextValues[i][j] - v) * eased)
        );
        this.setField({ ...newField, values: blended });
        if (t >= 1) this.setCurrents(newCurrents);
        this.render();
        if (t < 1) {
          this._animFrame = requestAnimationFrame(step);
        } else {
          this._animFrame = null;
        }
      };
      this._animFrame = requestAnimationFrame(step);
    }

    setStations(stations) {
      this.stations = stations;
    }

    setPFZZones(zones, show = true) {
      this.pfzZones = zones;
      this.showPFZ = show;
      this.render();
    }

    setTCHPRiskZones(zones, show = true) {
      this.tchpRiskZones = zones;
      this.showTCHP = show;
      this.render();
    }

    setSARDrift(drift, show = true) {
      this.sarDrift = drift;
      this.showSAR = show;
      this.render();
    }

    startParticleFlow() {
      if (this._particleTimer) return;
      const loop = () => {
        if (!this.showParticles) {
          this._particleTimer = null;
          return;
        }
        this._updateParticles();
        this.render();
        this._particleTimer = requestAnimationFrame(loop);
      };
      this._particleTimer = requestAnimationFrame(loop);
    }

    stopParticleFlow() {
      if (this._particleTimer) {
        cancelAnimationFrame(this._particleTimer);
        this._particleTimer = null;
      }
    }

    _updateParticles() {
      if (!this.currents || !this.currents.u) return;
      const { lons, lats, u, v } = this.currents;
      const b = this._bounds || { lonMin: 40, lonMax: 100, latMin: -10, latMax: 30 };

      for (const p of this._particles) {
        p.age++;
        if (p.age > p.maxAge || p.lon < b.lonMin || p.lon > b.lonMax || p.lat < b.latMin || p.lat > b.latMax) {
          p.lon = b.lonMin + 2 + Math.random() * (b.lonMax - b.lonMin - 4);
          p.lat = b.latMin + 2 + Math.random() * (b.latMax - b.latMin - 4);
          p.age = 0;
          continue;
        }

        // Find nearest grid indices
        let j = Math.min(lons.length - 1, Math.max(0, Math.floor(((p.lon - b.lonMin) / (b.lonMax - b.lonMin)) * (lons.length - 1))));
        let i = Math.min(lats.length - 1, Math.max(0, Math.floor(((p.lat - b.latMin) / (b.latMax - b.latMin)) * (lats.length - 1))));

        const uVal = u[i][j];
        const vVal = v[i][j];

        // Move particle in degrees (1 deg ~ 111 km)
        p.lon += ((uVal * 0.08 * p.speed) / Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)));
        p.lat += (vVal * 0.08 * p.speed);
      }
    }

    // --- Coordinate Helpers ---------------------------------------------
    _lonToX(lon) {
      const b = this._bounds || { lonMin: 40, lonMax: 100, latMin: -10, latMax: 30 };
      return ((lon - (b.lonMin + b.lonMax) / 2) / (b.lonMax - b.lonMin)) * WORLD_SCALE;
    }

    _latToZ(lat) {
      const b = this._bounds || { lonMin: 40, lonMax: 100, latMin: -10, latMax: 30 };
      return ((lat - (b.latMin + b.latMax) / 2) / (b.latMax - b.latMin)) * WORLD_SCALE;
    }

    _elevation(value) {
      if (!this.field) return 0;
      const range = Math.max(1e-6, this.field.max - this.field.min);
      return ((value - this.field.mean) / range) * this.elevScale;
    }

    // --- Main Render Pipeline -------------------------------------------
    render() {
      const { ctx, canvas } = this;
      const dpr = this.dpr || 1;
      const w = canvas.width / dpr, h = canvas.height / dpr;
      if (w <= 0 || h <= 0) return;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Deep oceanic gradient background
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#030c14");
      bg.addColorStop(0.5, "#061524");
      bg.addColorStop(1, "#0a1f33");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      if (!this.field) {
        ctx.restore();
        return;
      }

      const primitives = [];

      // 1. Bathymetric Base Floor & Grid Wireframe
      this._collectBathymetryFloor(primitives, w, h);

      // 2. Ocean Model Field Quads (Slice or Volumetric Stack)
      if (this.viewMode === "volumetric" && this.volumetricLayers && this.volumetricLayers.length > 0) {
        this._collectVolumetricStack(primitives, w, h);
      } else if (this.viewMode === "isosurface") {
        this._collectIsosurface(primitives, w, h);
      } else {
        this._collectMeshQuads(primitives, w, h);
      }

      // 3. 3D Vertical Transect Curtain
      if (this.viewMode === "transect" || this.transectData) {
        this._collectTransectCurtain(primitives, w, h);
      }

      // 4. Coastlines & Indian EEZ boundary
      if (this.showCoastlines) this._collectCoastlines(primitives, w, h);
      if (this.showEEZ) this._collectEEZ(primitives, w, h);

      // 5. Current Vectors
      if (this.showCurrents && this.currents) {
        this._collectArrows(primitives, w, h);
      }

      // 6. Animated Current Particles
      if (this.showParticles) {
        this._collectParticles(primitives, w, h);
      }

      // 7. Operational Mandates (PFZ, TCHP, SAR Drift)
      if (this.showPFZ) this._collectPFZZones(primitives, w, h);
      if (this.showTCHP) this._collectTCHPAlerts(primitives, w, h);
      if (this.showSAR && this.sarDrift) this._collectSARDrift(primitives, w, h);

      // 8. In-Situ Observation Stations (Argo, Glider, Buoy, CTD)
      if (this.showStations) {
        this._collectStations(primitives, w, h);
      }

      // Painter's Algorithm: Sort primitives from farthest to nearest
      primitives.sort((a, b) => b.depth - a.depth);
      for (const prim of primitives) {
        prim.draw(ctx);
      }

      // 9. Overlays (Axis coordinates, HUD compass, Scale bar)
      this._drawAxisLabels(w, h);
      this._drawCompass(w, h);
      this._drawWaterDepthIndicator(w, h);
      this._drawScaleBar(w, h);

      ctx.restore();
    }

    _collectBathymetryFloor(out, w, h) {
      const proj = this.projector;
      const b = this._bounds || { lonMin: 40, lonMax: 100, latMin: -10, latMax: 30 };
      const floorY = -1.0 * this.elevScale - 0.2;

      // Draw bounding base plate box
      const corners = [
        { x: this._lonToX(b.lonMin), z: this._latToZ(b.latMin) },
        { x: this._lonToX(b.lonMax), z: this._latToZ(b.latMin) },
        { x: this._lonToX(b.lonMax), z: this._latToZ(b.latMax) },
        { x: this._lonToX(b.lonMin), z: this._latToZ(b.latMax) },
      ];

      const projCorners = corners.map((c) => proj.project(c.x, floorY, c.z, w, h));
      if (projCorners.some((p) => !p.visible)) return;

      const avgDepth = projCorners.reduce((acc, p) => acc + p.depth, 0) / 4;
      out.push({
        depth: avgDepth + 0.5,
        draw(ctx) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(projCorners[0].sx, projCorners[0].sy);
          for (let i = 1; i < projCorners.length; i++) {
            ctx.lineTo(projCorners[i].sx, projCorners[i].sy);
          }
          ctx.closePath();
          ctx.fillStyle = "rgba(4, 18, 28, 0.65)";
          ctx.fill();
          ctx.strokeStyle = "rgba(45, 212, 191, 0.2)";
          ctx.lineWidth = 1;
          ctx.stroke();

          // Subsurface depth grid lines
          ctx.strokeStyle = "rgba(45, 212, 191, 0.08)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
          ctx.restore();
        },
      });
    }

    _collectMeshQuads(out, w, h) {
      const field = this.field;
      const lats = field.lats, lons = field.lons;
      const nLat = lats.length, nLon = lons.length;
      const proj = this.projector;
      const palette = this.palette;
      const isLog = this.isLog;
      const opacity = this.opacity;

      const verts = new Array(nLat);
      for (let i = 0; i < nLat; i++) {
        verts[i] = new Array(nLon);
        for (let j = 0; j < nLon; j++) {
          const val = field.values[i][j];
          const x = this._lonToX(lons[j]);
          const z = this._latToZ(lats[i]);
          const y = this._elevation(val);
          verts[i][j] = { p: proj.project(x, y, z, w, h), val };
        }
      }

      for (let i = 0; i < nLat - 1; i++) {
        for (let j = 0; j < nLon - 1; j++) {
          const a = verts[i][j], b = verts[i][j + 1], c = verts[i + 1][j + 1], d = verts[i + 1][j];
          if (!a.p.visible || !b.p.visible || !c.p.visible || !d.p.visible) continue;
          const avgVal = (a.val + b.val + c.val + d.val) / 4;
          const depth = (a.p.depth + b.p.depth + c.p.depth + d.p.depth) / 4;
          const [r, g, bColor] = ColorMaps.valueToRGB(avgVal, field.min, field.max, this.variable, palette, isLog);

          out.push({
            depth,
            draw(ctx) {
              ctx.beginPath();
              ctx.moveTo(a.p.sx, a.p.sy);
              ctx.lineTo(b.p.sx, b.p.sy);
              ctx.lineTo(c.p.sx, c.p.sy);
              ctx.lineTo(d.p.sx, d.p.sy);
              ctx.closePath();
              ctx.fillStyle = `rgba(${r},${g},${bColor},${opacity})`;
              ctx.fill();
              ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
              ctx.lineWidth = 0.5;
              ctx.stroke();
            },
          });
        }
      }
    }

    _collectVolumetricStack(out, w, h) {
      const proj = this.projector;
      const layers = this.volumetricLayers;
      const palette = this.palette;
      const isLog = this.isLog;

      // Stacks depth layers down the water column
      layers.forEach((layer, layerIdx) => {
        const dNorm = layerIdx / Math.max(1, layers.length - 1);
        const yOffset = -dNorm * 0.8 * this.elevScale;
        const lats = layer.lats, lons = layer.lons;
        const nLat = lats.length, nLon = lons.length;
        const flat = layer.values.flat();
        const lMin = Math.min(...flat);
        const lMax = Math.max(...flat);
        const layerOpacity = layerIdx === 0 ? 0.75 : 0.38;

        const verts = new Array(nLat);
        for (let i = 0; i < nLat; i++) {
          verts[i] = new Array(nLon);
          for (let j = 0; j < nLon; j++) {
            const val = layer.values[i][j];
            const x = this._lonToX(lons[j]);
            const z = this._latToZ(lats[i]);
            const y = yOffset + this._elevation(val) * 0.3;
            verts[i][j] = { p: proj.project(x, y, z, w, h), val };
          }
        }

        for (let i = 0; i < nLat - 1; i++) {
          for (let j = 0; j < nLon - 1; j++) {
            const a = verts[i][j], b = verts[i][j + 1], c = verts[i + 1][j + 1], d = verts[i + 1][j];
            if (!a.p.visible || !b.p.visible || !c.p.visible || !d.p.visible) continue;
            const avgVal = (a.val + b.val + c.val + d.val) / 4;
            const depth = (a.p.depth + b.p.depth + c.p.depth + d.p.depth) / 4;
            const [r, g, bCol] = ColorMaps.valueToRGB(avgVal, lMin, lMax, this.variable, palette, isLog);

            out.push({
              depth,
              draw(ctx) {
                ctx.beginPath();
                ctx.moveTo(a.p.sx, a.p.sy);
                ctx.lineTo(b.p.sx, b.p.sy);
                ctx.lineTo(c.p.sx, c.p.sy);
                ctx.lineTo(d.p.sx, d.p.sy);
                ctx.closePath();
                ctx.fillStyle = `rgba(${r},${g},${bCol},${layerOpacity})`;
                ctx.fill();
                ctx.strokeStyle = `rgba(255,255,255,${layerIdx === 0 ? 0.15 : 0.05})`;
                ctx.lineWidth = 0.4;
                ctx.stroke();
              },
            });
          }
        }
      });
    }

    _collectIsosurface(out, w, h) {
      // Isosurface extraction: highlight regions near the selected isovalue (e.g. 26°C isotherm)
      const field = this.field;
      const lats = field.lats, lons = field.lons;
      const nLat = lats.length, nLon = lons.length;
      const proj = this.projector;
      const targetVal = this.isosurfaceValue;
      const tol = (field.max - field.min) * 0.06;

      for (let i = 0; i < nLat - 1; i++) {
        for (let j = 0; j < nLon - 1; j++) {
          const val = field.values[i][j];
          if (Math.abs(val - targetVal) > tol) continue;

          const x = this._lonToX(lons[j]);
          const z = this._latToZ(lats[i]);
          const y = this._elevation(val);
          const p = proj.project(x, y, z, w, h);
          if (!p.visible) continue;

          out.push({
            depth: p.depth,
            draw(ctx) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(p.sx, p.sy, 5 * p.scale, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(255, 230, 80, 0.85)";
              ctx.fill();
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = 1;
              ctx.stroke();
              ctx.restore();
            },
          });
        }
      }
    }

    _collectTransectCurtain(out, w, h) {
      if (!this.transectData || !this.transectData.depths) return;
      const { depths, lons, values, lat } = this.transectData;
      const proj = this.projector;
      const z = this._latToZ(lat);
      const palette = this.palette;
      const isLog = this.isLog;

      const flat = values.flat();
      const tMin = Math.min(...flat);
      const tMax = Math.max(...flat);
      const dMax = Math.max(...depths, 500);

      for (let d = 0; d < depths.length - 1; d++) {
        const yTop = -(depths[d] / dMax) * 0.9 * this.elevScale;
        const yBot = -(depths[d + 1] / dMax) * 0.9 * this.elevScale;

        for (let j = 0; j < lons.length - 1; j++) {
          const x0 = this._lonToX(lons[j]);
          const x1 = this._lonToX(lons[j + 1]);

          const p00 = proj.project(x0, yTop, z, w, h);
          const p10 = proj.project(x1, yTop, z, w, h);
          const p11 = proj.project(x1, yBot, z, w, h);
          const p01 = proj.project(x0, yBot, z, w, h);

          if (!p00.visible || !p10.visible || !p11.visible || !p01.visible) continue;
          const avgVal = (values[d][j] + values[d][j + 1] + values[d + 1][j] + values[d + 1][j + 1]) / 4;
          const depth = (p00.depth + p10.depth + p11.depth + p01.depth) / 4;
          const [r, g, bCol] = ColorMaps.valueToRGB(avgVal, tMin, tMax, this.variable, palette, isLog);

          out.push({
            depth,
            draw(ctx) {
              ctx.beginPath();
              ctx.moveTo(p00.sx, p00.sy);
              ctx.lineTo(p10.sx, p10.sy);
              ctx.lineTo(p11.sx, p11.sy);
              ctx.lineTo(p01.sx, p01.sy);
              ctx.closePath();
              ctx.fillStyle = `rgba(${r},${g},${bCol},0.92)`;
              ctx.fill();
              ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
              ctx.lineWidth = 0.5;
              ctx.stroke();
            },
          });
        }
      }
    }

    _collectCoastlines(out, w, h) {
      const proj = this.projector;
      const polylines = [INDIA_MAINLAND, SRI_LANKA, ARABIAN_PENINSULA, MAKRAN_PAKISTAN, ANDAMAN_NICOBAR, LAKSHADWEEP, MALDIVES];

      polylines.forEach((poly) => {
        const pts = poly.map((pt) => {
          const x = this._lonToX(pt[0]);
          const z = this._latToZ(pt[1]);
          const y = this._elevation(this._nearestFieldValue(pt[0], pt[1])) + 0.02;
          return { ...proj.project(x, y, z, w, h), pt };
        });

        const visiblePts = pts.filter((p) => p.visible);
        if (visiblePts.length < 2) return;
        const avgDepth = visiblePts.reduce((acc, p) => acc + p.depth, 0) / visiblePts.length;

        out.push({
          depth: avgDepth - 0.1, // slightly in front
          draw(ctx) {
            ctx.save();
            ctx.strokeStyle = "#e2f1ff";
            ctx.lineWidth = 1.8;
            ctx.shadowColor = "rgba(45, 212, 191, 0.4)";
            ctx.shadowBlur = 4;
            ctx.beginPath();
            let started = false;
            for (let k = 0; k < pts.length; k++) {
              if (pts[k].visible) {
                if (!started) {
                  ctx.moveTo(pts[k].sx, pts[k].sy);
                  started = true;
                } else {
                  ctx.lineTo(pts[k].sx, pts[k].sy);
                }
              }
            }
            ctx.stroke();
            ctx.restore();
          },
        });
      });
    }

    _collectEEZ(out, w, h) {
      const proj = this.projector;
      const eezBands = [EEZ_WEST, EEZ_EAST];

      eezBands.forEach((band) => {
        const pts = band.map((pt) => {
          const x = this._lonToX(pt[0]);
          const z = this._latToZ(pt[1]);
          const y = this._elevation(this._nearestFieldValue(pt[0], pt[1])) + 0.015;
          return proj.project(x, y, z, w, h);
        });

        const visiblePts = pts.filter((p) => p.visible);
        if (visiblePts.length < 2) return;
        const avgDepth = visiblePts.reduce((acc, p) => acc + p.depth, 0) / visiblePts.length;

        out.push({
          depth: avgDepth - 0.05,
          draw(ctx) {
            ctx.save();
            ctx.strokeStyle = "rgba(45, 212, 191, 0.65)";
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            let started = false;
            for (const p of pts) {
              if (p.visible) {
                if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
                else ctx.lineTo(p.sx, p.sy);
              }
            }
            ctx.stroke();
            ctx.restore();
          },
        });
      });
    }

    _collectArrows(out, w, h) {
      const { lons, lats, u, v } = this.currents;
      const proj = this.projector;
      const step = Math.max(1, Math.floor(lons.length / 11));

      for (let i = 0; i < lats.length; i += step) {
        for (let j = 0; j < lons.length; j += step) {
          const mag = Math.hypot(u[i][j], v[i][j]);
          if (mag < 1e-4) continue;
          const x0 = this._lonToX(lons[j]);
          const z0 = this._latToZ(lats[i]);
          const y0 = this._elevation(this.field ? this.field.values[i][j] : 0) + 0.06;
          const dx = (u[i][j] / 0.7) * 0.9 * (WORLD_SCALE / lons.length);
          const dz = -(v[i][j] / 0.7) * 0.9 * (WORLD_SCALE / lats.length);
          const x1 = x0 + dx, z1 = z0 + dz;

          const p0 = proj.project(x0, y0, z0, w, h);
          const p1 = proj.project(x1, y0, z1, w, h);
          if (!p0.visible || !p1.visible) continue;
          const depth = (p0.depth + p1.depth) / 2;
          const alpha = Math.min(1, 0.4 + mag * 0.8);

          out.push({
            depth,
            draw(ctx) {
              ctx.save();
              ctx.strokeStyle = `rgba(180, 230, 255, ${alpha})`;
              ctx.fillStyle = `rgba(180, 230, 255, ${alpha})`;
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.moveTo(p0.sx, p0.sy);
              ctx.lineTo(p1.sx, p1.sy);
              ctx.stroke();

              const angle = Math.atan2(p1.sy - p0.sy, p1.sx - p0.sx);
              const headLen = 4;
              ctx.beginPath();
              ctx.moveTo(p1.sx, p1.sy);
              ctx.lineTo(p1.sx - headLen * Math.cos(angle - 0.4), p1.sy - headLen * Math.sin(angle - 0.4));
              ctx.lineTo(p1.sx - headLen * Math.cos(angle + 0.4), p1.sy - headLen * Math.sin(angle + 0.4));
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            },
          });
        }
      }
    }

    _collectParticles(out, w, h) {
      const proj = this.projector;
      for (const p of this._particles) {
        const x = this._lonToX(p.lon);
        const z = this._latToZ(p.lat);
        const y = this._elevation(this._nearestFieldValue(p.lon, p.lat)) + 0.08;
        const pp = proj.project(x, y, z, w, h);
        if (!pp.visible) continue;

        const alpha = Math.sin((p.age / p.maxAge) * Math.PI) * 0.85;
        out.push({
          depth: pp.depth - 0.02,
          draw(ctx) {
            ctx.save();
            ctx.fillStyle = `rgba(45, 212, 191, ${alpha})`;
            ctx.beginPath();
            ctx.arc(pp.sx, pp.sy, 2.2 * pp.scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          },
        });
      }
    }

    _collectPFZZones(out, w, h) {
      const proj = this.projector;
      for (const z of this.pfzZones) {
        const x = this._lonToX(z.lon);
        const zCoord = this._latToZ(z.lat);
        const y = this._elevation(this._nearestFieldValue(z.lon, z.lat)) + 0.07;
        const p = proj.project(x, y, zCoord, w, h);
        if (!p.visible) continue;

        out.push({
          depth: p.depth - 0.08,
          draw(ctx) {
            ctx.save();
            // Pulsing fishing zone hotspot ring
            ctx.strokeStyle = "#10b981";
            ctx.fillStyle = "rgba(16, 185, 129, 0.35)";
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, 7 * p.scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Fish icon representation
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${Math.round(8 * p.scale)}px sans-serif`;
            ctx.fillText("🐟", p.sx - 5, p.sy + 3);
            ctx.restore();
          },
        });
      }
    }

    _collectTCHPAlerts(out, w, h) {
      const proj = this.projector;
      for (const t of this.tchpRiskZones) {
        const x = this._lonToX(t.lon);
        const z = this._latToZ(t.lat);
        const y = this._elevation(this._nearestFieldValue(t.lon, t.lat)) + 0.07;
        const p = proj.project(x, y, z, w, h);
        if (!p.visible) continue;

        const isExtreme = t.risk_level === "EXTREME";
        out.push({
          depth: p.depth - 0.08,
          draw(ctx) {
            ctx.save();
            ctx.strokeStyle = isExtreme ? "#ef4444" : "#f59e0b";
            ctx.fillStyle = isExtreme ? "rgba(239, 68, 68, 0.4)" : "rgba(245, 158, 11, 0.35)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, 8 * p.scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${Math.round(8 * p.scale)}px sans-serif`;
            ctx.fillText("🌀", p.sx - 5, p.sy + 3);
            ctx.restore();
          },
        });
      }
    }

    _collectSARDrift(out, w, h) {
      if (!this.sarDrift || !this.sarDrift.trajectory) return;
      const proj = this.projector;
      const traj = this.sarDrift.trajectory;

      const projPts = traj.map((pt) => {
        const x = this._lonToX(pt.lon);
        const z = this._latToZ(pt.lat);
        const y = this._elevation(this._nearestFieldValue(pt.lon, pt.lat)) + 0.08;
        return { ...proj.project(x, y, z, w, h), pt };
      });

      const avgDepth = projPts.reduce((acc, p) => acc + p.depth, 0) / projPts.length;

      out.push({
        depth: avgDepth - 0.15,
        draw(ctx) {
          ctx.save();
          // Draw SAR drift track polyline
          ctx.strokeStyle = "#f97316";
          ctx.lineWidth = 2.2;
          ctx.setLineDash([5, 3]);
          ctx.beginPath();
          let started = false;
          for (const p of projPts) {
            if (p.visible) {
              if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
              else ctx.lineTo(p.sx, p.sy);
            }
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw origin and final search radius ellipse
          const pStart = projPts[0];
          if (pStart && pStart.visible) {
            ctx.fillStyle = "#22c55e";
            ctx.beginPath();
            ctx.arc(pStart.sx, pStart.sy, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 9px sans-serif";
            ctx.fillText("START", pStart.sx + 8, pStart.sy + 3);
          }

          const pEnd = projPts[projPts.length - 1];
          if (pEnd && pEnd.visible) {
            ctx.strokeStyle = "#f97316";
            ctx.fillStyle = "rgba(249, 115, 22, 0.25)";
            ctx.lineWidth = 1.5;
            const rPx = Math.max(10, pEnd.pt.search_radius_nm * 1.5 * pEnd.scale);
            ctx.beginPath();
            ctx.arc(pEnd.sx, pEnd.sy, rPx, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText(`SAR ${pEnd.pt.hour}h (R=${pEnd.pt.search_radius_nm}nm)`, pEnd.sx + 10, pEnd.sy - 8);
          }
          ctx.restore();
        },
      });
    }

    _collectStations(out, w, h) {
      const proj = this.projector;
      const projected = [];

      for (const st of this.stations) {
        const x = this._lonToX(st.lon);
        const z = this._latToZ(st.lat);
        const yBase = this._elevation(this._nearestFieldValue(st.lon, st.lat));
        const pBase = proj.project(x, yBase, z, w, h);
        const pTop = proj.project(x, yBase + MARKER_HEIGHT, z, w, h);
        if (!pBase.visible || !pTop.visible) continue;

        const selected = st.id === this.selectedStationId;
        const hovered = st.id === this.hoveredStationId;

        // Custom colors per instrument category
        let color = "#2dd4bf"; // argo teal
        let symbol = "●";
        if (st.kind === "buoy") {
          color = "#f5a623"; // buoy orange
          symbol = "⚓";
        } else if (st.kind === "glider") {
          color = "#eab308"; // glider yellow
          symbol = "▲";
        } else if (st.kind === "ctd") {
          color = "#a855f7"; // ctd purple
          symbol = "🚢";
        }

        const radius = selected ? 7 : (hovered ? 6.5 : 4.8);
        projected.push({ st, sx: pTop.sx, sy: pTop.sy, r: radius });

        // 3D Sawtooth trajectory ribbon for underwater gliders!
        if (st.kind === "glider" && st.trajectory && st.trajectory.length > 0) {
          const traj = st.trajectory;
          const trajPts = traj.map((tp) => {
            const tx = this._lonToX(tp.lon);
            const tz = this._latToZ(tp.lat);
            const ty = -((tp.depth / 500) * 0.7 * this.elevScale);
            return proj.project(tx, ty, tz, w, h);
          });

          out.push({
            depth: (pBase.depth + pTop.depth) / 2 + 0.1,
            draw(ctx) {
              ctx.save();
              ctx.strokeStyle = "rgba(234, 179, 8, 0.75)";
              ctx.lineWidth = 1.8;
              ctx.beginPath();
              let started = false;
              for (const tp of trajPts) {
                if (tp.visible) {
                  if (!started) { ctx.moveTo(tp.sx, tp.sy); started = true; }
                  else ctx.lineTo(tp.sx, tp.sy);
                }
              }
              ctx.stroke();

              // Trajectory nodes
              ctx.fillStyle = "#fde047";
              for (const tp of trajPts) {
                if (tp.visible) {
                  ctx.beginPath();
                  ctx.arc(tp.sx, tp.sy, 2.5, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
              ctx.restore();
            },
          });
        }

        // Moored buoy anchor cable down to seabed
        if (st.kind === "buoy") {
          const seabedP = proj.project(x, -0.8 * this.elevScale, z, w, h);
          if (seabedP.visible) {
            out.push({
              depth: (pBase.depth + seabedP.depth) / 2,
              draw(ctx) {
                ctx.save();
                ctx.strokeStyle = "rgba(245, 166, 35, 0.4)";
                ctx.lineWidth = 0.8;
                ctx.setLineDash([2, 3]);
                ctx.beginPath();
                ctx.moveTo(pBase.sx, pBase.sy);
                ctx.lineTo(seabedP.sx, seabedP.sy);
                ctx.stroke();
                ctx.restore();
              },
            });
          }
        }

        // Instrument Pin and Cap
        out.push({
          depth: (pBase.depth + pTop.depth) / 2,
          draw(ctx) {
            ctx.save();
            ctx.strokeStyle = selected ? "#ffffff" : "rgba(255, 255, 255, 0.55)";
            ctx.lineWidth = selected ? 2 : 1.2;
            ctx.beginPath();
            ctx.moveTo(pBase.sx, pBase.sy);
            ctx.lineTo(pTop.sx, pTop.sy);
            ctx.stroke();

            // Marker head
            ctx.beginPath();
            ctx.arc(pTop.sx, pTop.sy, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = selected ? "#ffffff" : (hovered ? "#ffffff" : "rgba(0, 0, 0, 0.45)");
            ctx.lineWidth = selected || hovered ? 2 : 1;
            ctx.stroke();

            // Sub-badge icon label on hover/select
            if (selected || hovered) {
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 9px system-ui, sans-serif";
              ctx.fillText(st.id, pTop.sx + radius + 4, pTop.sy + 3);
            }
            ctx.restore();
          },
        });
      }

      this._lastProjectedStations = projected;
    }

    _nearestFieldValue(lon, lat) {
      if (!this.field || !this.field.lons || !this.field.lats) return 0;
      const lons = this.field.lons, lats = this.field.lats;
      let jBest = 0, jd = Infinity;
      for (let j = 0; j < lons.length; j++) {
        const d = Math.abs(lons[j] - lon);
        if (d < jd) { jd = d; jBest = j; }
      }
      let iBest = 0, id = Infinity;
      for (let i = 0; i < lats.length; i++) {
        const d = Math.abs(lats[i] - lat);
        if (d < id) { id = d; iBest = i; }
      }
      return this.field.values[iBest][jBest];
    }

    _drawAxisLabels(w, h) {
      if (!this._bounds) return;
      const { ctx } = this;
      const b = this._bounds;
      const corners = [
        { lon: b.lonMin, lat: b.latMin }, { lon: b.lonMax, lat: b.latMin },
        { lon: b.lonMin, lat: b.latMax }, { lon: b.lonMax, lat: b.latMax },
      ];
      ctx.save();
      ctx.font = "10px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = "rgba(223, 238, 255, 0.65)";
      for (const c of corners) {
        const p = this.projector.project(this._lonToX(c.lon), 0, this._latToZ(c.lat), w, h);
        if (!p.visible) continue;
        const latTxt = `${Math.abs(c.lat).toFixed(0)}°${c.lat >= 0 ? "N" : "S"}`;
        const lonTxt = `${Math.abs(c.lon).toFixed(0)}°${c.lon >= 0 ? "E" : "W"}`;
        ctx.fillText(`${latTxt}, ${lonTxt}`, p.sx - 20, p.sy + (c.lat === b.latMax ? -8 : 14));
      }
      ctx.restore();
    }

    _drawCompass(w, h) {
      const { ctx } = this;
      const cx = 40, cy = 40, r = 22;
      const p0 = this.projector.project(0, 0, 0, w, h);
      const p1 = this.projector.project(0, 0, 0.6, w, h);
      let angle = -Math.PI / 2;
      if (p0.visible && p1.visible) {
        angle = Math.atan2(p1.sy - p0.sy, p1.sx - p0.sx);
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(4, 15, 26, 0.90)";
      ctx.fill();
      ctx.strokeStyle = "rgba(45, 212, 191, 0.5)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const degHeading = Math.round(((-angle - Math.PI / 2) * 180 / Math.PI + 360) % 360);

      ctx.translate(cx, cy);
      ctx.rotate(angle + Math.PI / 2);

      // North needle
      ctx.beginPath();
      ctx.moveTo(0, -r + 4);
      ctx.lineTo(4, 3);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = "#ef4444";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, -r + 4);
      ctx.lineTo(-4, 3);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = "#b91c1c";
      ctx.fill();

      // South needle
      ctx.beginPath();
      ctx.moveTo(0, r - 4);
      ctx.lineTo(3.5, -2);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = "#cbd5e1";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, r - 4);
      ctx.lineTo(-3.5, -2);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = "#64748b";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.restore();

      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("N", cx, cy - r - 3);
      ctx.font = "8.5px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(45, 212, 191, 0.95)";
      ctx.fillText(`${degHeading}°`, cx, cy + r + 11);
      ctx.restore();
    }

    _drawWaterDepthIndicator(w, h) {
      const { ctx } = this;
      ctx.save();
      ctx.fillStyle = "rgba(4, 15, 26, 0.88)";
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(72, 22, 260, 26, 5);
        ctx.fill();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
        ctx.stroke();
      } else {
        ctx.fillRect(72, 22, 260, 26);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
        ctx.strokeRect(72, 22, 260, 26);
      }
      ctx.font = "bold 9.5px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#2dd4bf";
      ctx.fillText("ROMS 3D", 82, 38);
      ctx.fillStyle = "#f1f5f9";
      ctx.font = "10px 'Plus Jakarta Sans', system-ui, sans-serif";
      const info = `MODE: ${this.viewMode.toUpperCase()} · VERT EXAGG: ${this.elevScale.toFixed(2)}x`;
      ctx.fillText(info, 142, 38);
      ctx.restore();
    }

    _drawScaleBar(w, h) {
      const { ctx, projector } = this;
      const barX = w - 180, barY = h - 26, barW = 140;
      const approxKm = Math.round(500 / Math.max(0.25, projector.zoom));
      const approxNm = Math.round(approxKm * 0.539957);

      ctx.save();
      ctx.fillStyle = "rgba(4, 15, 26, 0.88)";
      ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
      ctx.lineWidth = 1;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(barX - 8, barY - 16, barW + 16, 28, 5);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(barX - 8, barY - 16, barW + 16, 28);
        ctx.strokeRect(barX - 8, barY - 16, barW + 16, 28);
      }

      ctx.strokeStyle = "#2dd4bf";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(barX, barY);
      ctx.lineTo(barX + barW, barY);
      ctx.moveTo(barX, barY - 4);
      ctx.lineTo(barX, barY + 4);
      ctx.moveTo(barX + barW / 2, barY - 3);
      ctx.lineTo(barX + barW / 2, barY + 3);
      ctx.moveTo(barX + barW, barY - 4);
      ctx.lineTo(barX + barW, barY + 4);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${approxKm} km · ${approxNm} NM`, barX + barW / 2, barY - 5);
      ctx.fillStyle = "rgba(203, 213, 225, 0.7)";
      ctx.font = "7.5px 'JetBrains Mono', monospace";
      ctx.fillText("DATUM: WGS84 / ETOPO1", barX + barW / 2, barY + 9);
      ctx.restore();
    }

    _nearestCurrent(lon, lat) {
      if (!this.currents || !this.currents.lons || !this.currents.lats) return null;
      const { lons, lats, u, v } = this.currents;
      const b = this._bounds || { lonMin: 40, lonMax: 100, latMin: -10, latMax: 30 };
      let j = Math.min(lons.length - 1, Math.max(0, Math.floor(((lon - b.lonMin) / (b.lonMax - b.lonMin)) * (lons.length - 1))));
      let i = Math.min(lats.length - 1, Math.max(0, Math.floor(((lat - b.latMin) / (b.latMax - b.latMin)) * (lats.length - 1))));
      const uVal = u[i] ? u[i][j] : 0;
      const vVal = v[i] ? v[i][j] : 0;
      const speed = Math.sqrt(uVal * uVal + vVal * vVal);
      let dir = (Math.atan2(uVal, vVal) * 180) / Math.PI;
      if (dir < 0) dir += 360;
      return { u: uVal, v: vVal, speed, dir };
    }

    captureSnapshot(title = "INCOIS_Ocean3D") {
      const snapCanvas = document.createElement("canvas");
      snapCanvas.width = this.canvas.width;
      snapCanvas.height = this.canvas.height;
      const sctx = snapCanvas.getContext("2d");
      sctx.drawImage(this.canvas, 0, 0);

      // Watermark header
      sctx.save();
      sctx.fillStyle = "rgba(4, 15, 26, 0.88)";
      sctx.fillRect(0, snapCanvas.height - 36, snapCanvas.width, 36);
      sctx.fillStyle = "#2dd4bf";
      sctx.font = "bold 13px system-ui, sans-serif";
      sctx.fillText("INCOIS · Ministry of Earth Sciences, Govt. of India", 16, snapCanvas.height - 14);
      sctx.fillStyle = "rgba(223, 238, 255, 0.85)";
      sctx.font = "12px system-ui, sans-serif";
      const meta = `ROMS 1/12° Model | Field: ${this.variable.toUpperCase()} | Snapshot: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`;
      sctx.fillText(meta, snapCanvas.width - sctx.measureText(meta).width - 16, snapCanvas.height - 14);
      sctx.restore();

      const link = document.createElement("a");
      link.download = `${title}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "_")}.png`;
      link.href = snapCanvas.toDataURL("image/png");
      link.click();
    }

    // --- Interactive Mouse & Touch Handlers -----------------------------
    attach() {
      const canvas = this.canvas;

      canvas.addEventListener("mousedown", (e) => {
        this._dragging = true;
        this._didDrag = false;
        this._lastPointer = { x: e.clientX, y: e.clientY };
      });

      window.addEventListener("mousemove", (e) => {
        if (!this._dragging) return;
        const dx = e.clientX - this._lastPointer.x;
        const dy = e.clientY - this._lastPointer.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._didDrag = true;
        this.projector.yaw += dx * 0.006;
        this.projector.pitch = Math.max(-1.48, Math.min(1.48, this.projector.pitch + dy * 0.006));
        this._lastPointer = { x: e.clientX, y: e.clientY };
        this.render();
      });

      window.addEventListener("mouseup", () => {
        this._dragging = false;
      });

      canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        this.projector.zoom = Math.max(0.25, Math.min(5, this.projector.zoom * factor));
        this.render();
      }, { passive: false });

      canvas.addEventListener("click", (e) => {
        if (this._didDrag) return;
        const { mx, my } = this._canvasCoords(e);
        const best = this.pickStationAt(mx, my);
        if (best && this.onStationClick) {
          this.onStationClick(best.st.id);
        } else if (this.onMapClick) {
          const rect = canvas.getBoundingClientRect();
          const b = this._bounds || { lonMin: 40, lonMax: 100, latMin: -10, latMax: 30 };
          const normX = Math.max(0, Math.min(1, mx / (rect.width || 1)));
          const normY = Math.max(0, Math.min(1, my / (rect.height || 1)));
          const clickLon = Math.round((b.lonMin + normX * (b.lonMax - b.lonMin)) * 10) / 10;
          const clickLat = Math.round((b.latMax - normY * (b.latMax - b.latMin)) * 10) / 10;
          this.onMapClick({ lon: clickLon, lat: clickLat });
        }
      });

      canvas.addEventListener("mousemove", (e) => {
        if (this._dragging) return;
        const { mx, my } = this._canvasCoords(e);
        const best = this.pickStationAt(mx, my);
        const id = best ? best.st.id : null;
        if (id !== this.hoveredStationId) {
          this.hoveredStationId = id;
          if (this.onStationHover) {
            this.onStationHover(id, best ? { sx: best.sx, sy: best.sy } : null);
          }
        }

        if (this.onPointerTelemetry) {
          const rect = canvas.getBoundingClientRect();
          const normX = Math.max(0, Math.min(1, mx / (rect.width || 1)));
          const normY = Math.max(0, Math.min(1, my / (rect.height || 1)));
          const b = this._bounds || { lonMin: 40, lonMax: 100, latMin: -10, latMax: 30 };
          const lon = b.lonMin + normX * (b.lonMax - b.lonMin);
          const lat = b.latMax - normY * (b.latMax - b.latMin);
          const val = this._nearestFieldValue(lon, lat);
          const currents = this._nearestCurrent(lon, lat);
          this.onPointerTelemetry({
            lon,
            lat,
            val,
            depth: this.field?.depth ?? 0,
            variable: this.variable,
            currents,
            station: best ? best.st : null,
          });
        }
      });

      canvas.addEventListener("mouseleave", () => {
        if (this.hoveredStationId !== null) {
          this.hoveredStationId = null;
          if (this.onStationHover) this.onStationHover(null, null);
        }
        if (this.onPointerTelemetry) this.onPointerTelemetry(null);
      });
    }

    _canvasCoords(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        mx: e.clientX - rect.left,
        my: e.clientY - rect.top,
      };
    }

    pickStationAt(mx, my) {
      let best = null, bestDist = 18 * 18;
      for (const p of this._lastProjectedStations || []) {
        const dd = (p.sx - mx) ** 2 + (p.sy - my) ** 2;
        if (dd < bestDist) { bestDist = dd; best = p; }
      }
      return best;
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { OceanScene };
  } else {
    global.OceanScene = OceanScene;
  }
})(typeof window !== "undefined" ? window : globalThis);

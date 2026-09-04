/* OceanScene: a hand-rolled canvas-2D "3D" renderer for the ocean grid,
 * current vectors and in-situ station markers. No WebGL / Three.js — this
 * keeps the whole platform dependency-free (works offline, no CDN, no
 * version-pinning risk), which matters for a hackathon demo.
 *
 * Consumers provide plain data via setField/setCurrents/setStations and
 * call render(); mouse drag/wheel/click wiring is set up by attach().
 */
(function (global) {
  "use strict";

  const Projector = global.Projector || require("./projector.js").Projector;
  const ColorMaps = global.ColorMaps || require("./colormap.js");

  const WORLD_SCALE = 4.2;      // world units spanning the lon/lat box
  const ELEV_SCALE = 0.55;      // height exaggeration for the anomaly relief
  const ARROW_SCALE = 0.9;      // current-vector length scaling
  const MARKER_HEIGHT = 0.35;   // station pin height above the surface

  class OceanScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this._initialProjectorState = { yaw: 0.55, pitch: 0.5, camDist: 6.5, focal: 5.5, zoom: 1, pixelScale: 170 };
      this.projector = new Projector(this._initialProjectorState);

      this.variable = "temperature";
      this.field = null;     // { lons, lats, values, min, max }
      this.currents = null;  // { lons, lats, u, v }
      this.stations = [];    // [{id, kind, lon, lat, screen?}]
      this.selectedStationId = null;
      this.hoveredStationId = null;
      this.onStationClick = null; // callback(stationId)
      this.onStationHover = null; // callback(stationId|null, {sx,sy}|null)

      this._bounds = null; // set on first setField call
      this._dragging = false;
      this._lastPointer = null;
      this._didDrag = false;
      this._animFrame = null;
    }

    resetView() {
      Object.assign(this.projector, this._initialProjectorState);
      this.render();
    }

    setVariable(v) {
      this.variable = v;
    }

    setField(field) {
      // field: { lons:[], lats:[], values: number[][] (row=lat,col=lon) }
      this.field = field;
      if (!this._bounds) {
        this._bounds = {
          lonMin: Math.min(...field.lons),
          lonMax: Math.max(...field.lons),
          latMin: Math.min(...field.lats),
          latMax: Math.max(...field.lats),
        };
      }
      const flat = field.values.flat();
      this.field.min = Math.min(...flat);
      this.field.max = Math.max(...flat);
      this.field.mean = flat.reduce((a, b) => a + b, 0) / flat.length;
    }

    setCurrents(currents) {
      this.currents = currents;
    }

    // Smoothly interpolate the mesh from its current values to newField's
    // values over durationMs, instead of jump-cutting on every depth/time
    // change. Falls back to an instant update if there's nothing to
    // interpolate from yet (first load) or the grid shape changed.
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
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
        const blended = prevValues.map((row, i) =>
          row.map((v, j) => v + (nextValues[i][j] - v) * eased)
        );
        this.setField({ ...newField, values: blended });
        if (t >= 1) this.setCurrents(newCurrents); // swap arrows only at the end (avoids odd mid-blend directions)
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

    // --- coordinate helpers ---------------------------------------------
    _lonToX(lon) {
      const b = this._bounds;
      return ((lon - (b.lonMin + b.lonMax) / 2) / (b.lonMax - b.lonMin)) * WORLD_SCALE;
    }

    _latToZ(lat) {
      const b = this._bounds;
      return ((lat - (b.latMin + b.latMax) / 2) / (b.latMax - b.latMin)) * WORLD_SCALE;
    }

    _elevation(value) {
      if (!this.field) return 0;
      const range = Math.max(1e-6, this.field.max - this.field.min);
      return ((value - this.field.mean) / range) * ELEV_SCALE;
    }

    // --- rendering ---------------------------------------------------------
    render() {
      const { ctx, canvas } = this;
      const w = canvas.width, h = canvas.height;
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      // background (deep-sea gradient)
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#061622");
      bg.addColorStop(1, "#0a2438");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      if (!this.field) {
        ctx.restore();
        return;
      }

      const primitives = [];
      this._collectMeshQuads(primitives, w, h);
      if (this.currents) this._collectArrows(primitives, w, h);
      this._collectStations(primitives, w, h);

      primitives.sort((a, b) => b.depth - a.depth); // far to near
      for (const prim of primitives) prim.draw(ctx);

      this._drawAxisLabels(w, h);
      this._drawCompass(w, h);

      ctx.restore();
      this._lastProjectedStations = this._lastProjectedStations || [];
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
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = "rgba(223,238,255,0.55)";
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
      const cx = 34, cy = 34, r = 20;
      // World "north" is +Z; project a short vector from the origin to see
      // where it lands on screen after the current yaw/pitch, so the
      // needle always points to true north regardless of camera angle.
      const p0 = this.projector.project(0, 0, 0, w, h);
      const p1 = this.projector.project(0, 0, 0.6, w, h);
      let angle = -Math.PI / 2; // default: pointing up
      if (p0.visible && p1.visible) {
        angle = Math.atan2(p1.sy - p0.sy, p1.sx - p0.sx);
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(14,36,54,0.75)";
      ctx.fill();
      ctx.strokeStyle = "rgba(223,238,255,0.35)";
      ctx.stroke();
      ctx.translate(cx, cy);
      ctx.rotate(angle + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -r + 5);
      ctx.lineTo(4, 4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fillStyle = "#ff8a65";
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = "rgba(223,238,255,0.8)";
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillText("N", cx - 3, cy + r + 12);
      ctx.restore();
    }

    _collectMeshQuads(out, w, h) {
      const field = this.field;
      const lats = field.lats, lons = field.lons;
      const nLat = lats.length, nLon = lons.length;
      const proj = this.projector;

      // Precompute projected grid vertices.
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
          const color = ColorMaps.valueToCSS(avgVal, field.min, field.max, this.variable);
          out.push({
            depth,
            draw(ctx) {
              ctx.beginPath();
              ctx.moveTo(a.p.sx, a.p.sy);
              ctx.lineTo(b.p.sx, b.p.sy);
              ctx.lineTo(c.p.sx, c.p.sy);
              ctx.lineTo(d.p.sx, d.p.sy);
              ctx.closePath();
              ctx.fillStyle = color;
              ctx.fill();
              ctx.strokeStyle = "rgba(0,0,0,0.15)";
              ctx.lineWidth = 0.5;
              ctx.stroke();
            },
          });
        }
      }
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
          const dx = (u[i][j] / 0.7) * ARROW_SCALE * (WORLD_SCALE / lons.length);
          const dz = -(v[i][j] / 0.7) * ARROW_SCALE * (WORLD_SCALE / lats.length);
          const x1 = x0 + dx, z1 = z0 + dz;

          const p0 = proj.project(x0, y0, z0, w, h);
          const p1 = proj.project(x1, y0, z1, w, h);
          if (!p0.visible || !p1.visible) continue;
          const depth = (p0.depth + p1.depth) / 2;
          const alpha = Math.min(1, 0.35 + mag);
          out.push({
            depth,
            draw(ctx) {
              ctx.save();
              ctx.strokeStyle = `rgba(210,240,255,${alpha})`;
              ctx.fillStyle = `rgba(210,240,255,${alpha})`;
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
        const color = selected ? "#ffffff" : (st.kind === "buoy" ? "#f5a623" : "#2dd4bf");
        const radius = selected ? 6 : (hovered ? 6 : 4.5);
        projected.push({ st, sx: pTop.sx, sy: pTop.sy, r: radius });
        out.push({
          depth: (pBase.depth + pTop.depth) / 2,
          draw(ctx) {
            ctx.save();
            ctx.strokeStyle = "rgba(255,255,255,0.55)";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(pBase.sx, pBase.sy);
            ctx.lineTo(pTop.sx, pTop.sy);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(pTop.sx, pTop.sy, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = hovered && !selected ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.4)";
            ctx.lineWidth = hovered && !selected ? 2 : 1;
            ctx.stroke();
            ctx.restore();
          },
        });
      }
      this._lastProjectedStations = projected;
    }

    _nearestFieldValue(lon, lat) {
      if (!this.field) return 0;
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

    // --- interaction -----------------------------------------------------
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
        this.projector.pitch = Math.max(-1.4, Math.min(1.4, this.projector.pitch + dy * 0.006));
        this._lastPointer = { x: e.clientX, y: e.clientY };
        this.render();
      });
      window.addEventListener("mouseup", () => { this._dragging = false; });

      canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        this.projector.zoom = Math.max(0.3, Math.min(4, this.projector.zoom * factor));
        this.render();
      }, { passive: false });

      canvas.addEventListener("click", (e) => {
        if (this._didDrag) return; // was a drag, not a click
        const { mx, my } = this._canvasCoords(e);
        const best = this.pickStationAt(mx, my);
        if (best && this.onStationClick) this.onStationClick(best.st.id);
      });

      canvas.addEventListener("mousemove", (e) => {
        if (this._dragging) return; // rotating — don't also hit-test
        const { mx, my } = this._canvasCoords(e);
        const best = this.pickStationAt(mx, my);
        const id = best ? best.st.id : null;
        if (id !== this.hoveredStationId) {
          this.hoveredStationId = id;
          if (this.onStationHover) {
            this.onStationHover(id, best ? { sx: best.sx, sy: best.sy } : null);
          }
        }
      });
      canvas.addEventListener("mouseleave", () => {
        if (this.hoveredStationId !== null) {
          this.hoveredStationId = null;
          if (this.onStationHover) this.onStationHover(null, null);
        }
      });
    }

    _canvasCoords(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        mx: (e.clientX - rect.left) * (this.canvas.width / rect.width),
        my: (e.clientY - rect.top) * (this.canvas.height / rect.height),
      };
    }

    // Returns the closest projected station entry {st, sx, sy} within the
    // pick radius, or null. Shared by click and hover handling.
    pickStationAt(mx, my) {
      let best = null, bestDist = 16 * 16; // pick radius in px^2
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

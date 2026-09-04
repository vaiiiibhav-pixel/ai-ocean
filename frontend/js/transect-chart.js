/* Vertical cross-section ("transect") chart: depth (y, inverted) vs.
 * longitude (x), coloured by the selected variable — a Hovmoller-style
 * section giving genuine vertical structure, complementing the horizontal
 * depth-slice 3D view. Plain canvas 2D, no chart library. */
(function (global) {
  "use strict";

  const ColorMaps = global.ColorMaps || require("./colormap.js");

  function drawTransect(canvas, { depths, lons, values, variable, latLabel }) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b1f30";
    ctx.fillRect(0, 0, w, h);

    const pad = { left: 46, right: 12, top: 22, bottom: 26 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const flat = values.flat();
    const vMin = Math.min(...flat), vMax = Math.max(...flat);
    const dMax = Math.max(...depths);

    const cellW = plotW / lons.length;
    for (let di = 0; di < depths.length - 1; di++) {
      const yTop = pad.top + (depths[di] / dMax) * plotH;
      const yBot = pad.top + (depths[di + 1] / dMax) * plotH;
      for (let li = 0; li < lons.length; li++) {
        const v = values[di][li];
        ctx.fillStyle = ColorMaps.valueToCSS(v, vMin, vMax, variable);
        ctx.fillRect(pad.left + li * cellW, yTop, cellW + 0.5, yBot - yTop);
      }
    }

    // axis labels
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "10px system-ui, sans-serif";
    for (const d of depths) {
      const y = pad.top + (d / dMax) * plotH;
      ctx.fillText(`${d}m`, 2, y + 3);
    }
    const lonTicks = [0, Math.floor(lons.length / 2), lons.length - 1];
    for (const li of lonTicks) {
      const x = pad.left + li * cellW;
      ctx.fillText(`${lons[li].toFixed(0)}°E`, x, h - pad.bottom + 14);
    }
    ctx.fillStyle = "rgba(223,238,255,0.85)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(`${variable} at ${latLabel}`, pad.left, 12);
  }

  const TransectChart = { drawTransect };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = TransectChart;
  } else {
    global.TransectChart = TransectChart;
  }
})(typeof window !== "undefined" ? window : globalThis);

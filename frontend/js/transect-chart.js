/* Vertical cross-section ("transect") chart: depth (y, inverted) vs.
 * longitude (x), coloured by the selected variable — a Hovmoller-style
 * section giving genuine vertical structure, complementing the horizontal
 * depth-slice 3D view. Plain canvas 2D, no chart library. */
(function (global) {
  "use strict";

  const ColorMaps = global.ColorMaps || require("./colormap.js");

  function drawTransect(canvas, { depths, lons, values, variable, latLabel, palette = "thermal", isLog = false }) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
    }
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width || canvas.width;
    const h = rect.height || canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#071726";
    ctx.fillRect(0, 0, w, h);

    const pad = { left: 48, right: 16, top: 24, bottom: 28 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const flat = values.flat();
    const vMin = Math.min(...flat), vMax = Math.max(...flat);
    const dMax = Math.max(...depths, 100);

    // Draw grid background
    ctx.fillStyle = "#040e18";
    ctx.fillRect(pad.left, pad.top, plotW, plotH);

    const cellW = plotW / lons.length;
    for (let di = 0; di < depths.length - 1; di++) {
      const yTop = pad.top + (depths[di] / dMax) * plotH;
      const yBot = pad.top + (depths[di + 1] / dMax) * plotH;
      for (let li = 0; li < lons.length; li++) {
        const v = values[di][li];
        ctx.fillStyle = ColorMaps.valueToCSS(v, vMin, vMax, variable, palette, isLog);
        ctx.fillRect(pad.left + li * cellW, yTop, cellW + 0.8, yBot - yTop + 0.8);
      }
    }

    // Gridlines
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    for (const d of depths) {
      const y = pad.top + (d / dMax) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = "rgba(223,238,255,0.75)";
    ctx.font = "10px system-ui, sans-serif";
    for (const d of depths) {
      const y = pad.top + (d / dMax) * plotH;
      ctx.fillText(`${d}m`, 4, y + 3);
    }
    const lonTicks = [0, Math.floor(lons.length / 4), Math.floor(lons.length / 2), Math.floor((3 * lons.length) / 4), lons.length - 1];
    for (const li of lonTicks) {
      if (!lons[li]) continue;
      const x = pad.left + li * cellW;
      ctx.fillText(`${lons[li].toFixed(0)}°E`, Math.max(pad.left, x - 8), h - pad.bottom + 16);
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText(`${variable.toUpperCase()} CROSS-SECTION @ LAT ${latLabel}`, pad.left, 14);

    ctx.restore();
  }

  const TransectChart = { drawTransect };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = TransectChart;
  } else {
    global.TransectChart = TransectChart;
  }
})(typeof window !== "undefined" ? window : globalThis);

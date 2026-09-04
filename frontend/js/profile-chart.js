/* Depth-profile chart: draws observation vs. model-column profiles on a
 * plain canvas 2D context. No chart library dependency. */
(function (global) {
  "use strict";

  function drawProfileChart(canvas, { station, modelColumn, variable }) {
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

    const pad = { left: 48, right: 18, top: 22, bottom: 32 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const obsDepths = station.depths || [];
    const obsValues = station[variable] || [];
    const modelDepths = modelColumn ? (modelColumn.depths || []) : [];
    const modelValues = modelColumn ? (modelColumn[variable] || []) : [];

    const allValues = obsValues.concat(modelValues);
    if (!allValues.length) {
      ctx.fillStyle = "rgba(223, 238, 255, 0.75)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`No ${variable} profile data available for this station`, w / 2, h / 2);
      ctx.restore();
      return;
    }
    ctx.textAlign = "left";

    const vMin = Math.min(...allValues) - 0.25;
    const vMax = Math.max(...allValues) + 0.25;
    const dMax = Math.max(...obsDepths, ...modelDepths, 100);

    function xFor(v) { return pad.left + ((v - vMin) / (vMax - vMin)) * plotW; }
    function yFor(d) { return pad.top + (d / dMax) * plotH; }

    // Plot background
    ctx.fillStyle = "#040e18";
    ctx.fillRect(pad.left, pad.top, plotW, plotH);

    // gridlines + depth ticks
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.fillStyle = "rgba(223,238,255,0.70)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.lineWidth = 1;
    const depthTicks = [0, 50, 100, 200, 300, 500, 700, 1000].filter((d) => d <= dMax);
    for (const d of depthTicks) {
      const y = yFor(d);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillText(`${d}m`, 6, y + 3);
    }

    // parameter value ticks
    const valTicks = 4;
    for (let i = 0; i <= valTicks; i++) {
      const v = vMin + ((vMax - vMin) * i) / valTicks;
      const x = xFor(v);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
      const txt = v.toFixed(variable === "chlorophyll" ? 2 : 1);
      ctx.fillText(txt, Math.max(pad.left, x - 10), h - pad.bottom + 16);
    }

    // Series curves
    function drawSeries(depths, values, color, dashed) {
      if (!depths.length || !values.length) return;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dashed ? [4, 4] : []);
      ctx.beginPath();
      depths.forEach((d, i) => {
        const x = xFor(values[i]), y = yFor(d);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      depths.forEach((d, i) => {
        const x = xFor(values[i]), y = yFor(d);
        ctx.beginPath();
        ctx.arc(x, y, dashed ? 2.5 : 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    drawSeries(modelDepths, modelValues, "#f59e0b", true);   // model: dashed amber
    drawSeries(obsDepths, obsValues, "#2dd4bf", false);       // observation: solid teal

    // Legend at top
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillStyle = "#2dd4bf";
    ctx.fillText("● In-Situ Obs", pad.left, 14);
    ctx.fillStyle = "#f59e0b";
    ctx.fillText("┄┄ Numerical Model", pad.left + 86, 14);

    ctx.restore();
  }

  const ProfileChart = { drawProfileChart };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = ProfileChart;
  } else {
    global.ProfileChart = ProfileChart;
  }
})(typeof window !== "undefined" ? window : globalThis);

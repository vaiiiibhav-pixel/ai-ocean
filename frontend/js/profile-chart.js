/* Depth-profile chart: draws observation vs. model-column profiles on a
 * plain canvas 2D context. No chart library dependency. */
(function (global) {
  "use strict";

  function drawProfileChart(canvas, { station, modelColumn, variable }) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b1f30";
    ctx.fillRect(0, 0, w, h);

    const pad = { left: 46, right: 16, top: 18, bottom: 34 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const obsDepths = station.depths;
    const obsValues = station[variable];
    const modelDepths = modelColumn.depths;
    const modelValues = modelColumn[variable];

    const allValues = obsValues.concat(modelValues);
    const vMin = Math.min(...allValues) - 0.3;
    const vMax = Math.max(...allValues) + 0.3;
    const dMax = Math.max(...obsDepths, ...modelDepths);

    function xFor(v) { return pad.left + ((v - vMin) / (vMax - vMin)) * plotW; }
    function yFor(d) { return pad.top + (d / dMax) * plotH; }

    // gridlines + axis labels
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.lineWidth = 1;
    const depthTicks = [0, 100, 200, 300, 500, 700, 1000].filter((d) => d <= dMax);
    for (const d of depthTicks) {
      const y = yFor(d);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(`${d}m`, 4, y + 3);
    }
    const valTicks = 4;
    for (let i = 0; i <= valTicks; i++) {
      const v = vMin + ((vMax - vMin) * i) / valTicks;
      const x = xFor(v);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, h - pad.bottom);
      ctx.stroke();
      ctx.fillText(v.toFixed(1), x - 10, h - pad.bottom + 14);
    }

    function drawSeries(depths, values, color, dashed) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dashed ? [5, 4] : []);
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
        ctx.arc(x, y, dashed ? 3 : 2.4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    drawSeries(modelDepths, modelValues, "#f5a623", true);   // model: dashed amber
    drawSeries(obsDepths, obsValues, "#2dd4bf", false);       // observation: solid teal

    // legend
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "#2dd4bf"; ctx.fillText("● observation", pad.left, 12);
    ctx.fillStyle = "#f5a623"; ctx.fillText("┄┄ model (nearest grid pt)", pad.left + 90, 12);
  }

  const ProfileChart = { drawProfileChart };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = ProfileChart;
  } else {
    global.ProfileChart = ProfileChart;
  }
})(typeof window !== "undefined" ? window : globalThis);

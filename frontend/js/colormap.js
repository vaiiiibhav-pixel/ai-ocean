/* Colormap helpers — pure functions, no DOM dependency (unit-testable in Node). */
(function (global) {
  "use strict";

  // Sequential "thermal" colormap for temperature: cold -> warm.
  const THERMAL_STOPS = [
    [0.00, [13, 25, 87]],     // deep cold blue
    [0.20, [24, 90, 169]],
    [0.40, [45, 170, 180]],
    [0.55, [120, 200, 120]],
    [0.70, [240, 220, 90]],
    [0.85, [240, 140, 40]],
    [1.00, [190, 30, 30]],    // hot red
  ];

  // Sequential "haline" colormap for salinity: fresh -> salty.
  const HALINE_STOPS = [
    [0.00, [60, 40, 20]],     // fresh (river-influenced) — dark brown
    [0.25, [50, 90, 60]],
    [0.50, [30, 130, 130]],
    [0.75, [30, 90, 170]],
    [1.00, [30, 40, 150]],    // salty — deep blue/violet
  ];

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function sampleStops(stops, t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, c0] = stops[i];
      const [t1, c1] = stops[i + 1];
      if (t >= t0 && t <= t1) {
        const local = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
        return [
          Math.round(lerp(c0[0], c1[0], local)),
          Math.round(lerp(c0[1], c1[1], local)),
          Math.round(lerp(c0[2], c1[2], local)),
        ];
      }
    }
    return stops[stops.length - 1][1];
  }

  function valueToRGB(value, min, max, variable) {
    const t = max > min ? (value - min) / (max - min) : 0.5;
    const stops = variable === "salinity" ? HALINE_STOPS : THERMAL_STOPS;
    return sampleStops(stops, t);
  }

  function valueToCSS(value, min, max, variable) {
    const [r, g, b] = valueToRGB(value, min, max, variable);
    return `rgb(${r},${g},${b})`;
  }

  function rgbToCSS(rgb) {
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  }

  const ColorMaps = { valueToRGB, valueToCSS, rgbToCSS, THERMAL_STOPS, HALINE_STOPS };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ColorMaps;
  } else {
    global.ColorMaps = ColorMaps;
  }
})(typeof window !== "undefined" ? window : globalThis);

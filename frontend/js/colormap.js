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

  // Sequential "chlorophyll / algae" colormap: oligotrophic blue -> rich emerald -> bloom gold.
  const CHLOROPHYLL_STOPS = [
    [0.00, [10, 25, 60]],     // clear oceanic blue
    [0.18, [15, 60, 90]],
    [0.35, [20, 120, 95]],
    [0.55, [45, 180, 80]],    // emerald green
    [0.75, [160, 215, 50]],   // yellow-green
    [0.90, [235, 200, 40]],   // high bloom gold
    [1.00, [230, 80, 25]],    // hyper-bloom reddish orange
  ];

  // Perceptually uniform "viridis" colormap.
  const VIRIDIS_STOPS = [
    [0.00, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.50, [33, 145, 140]],
    [0.75, [94, 201, 98]],
    [1.00, [253, 231, 37]],
  ];

  // Google "turbo" colormap.
  const TURBO_STOPS = [
    [0.00, [48, 18, 59]],
    [0.15, [70, 134, 251]],
    [0.35, [27, 229, 181]],
    [0.55, [164, 252, 60]],
    [0.75, [251, 185, 56]],
    [0.90, [227, 89, 51]],
    [1.00, [122, 4, 3]],
  ];

  // "plasma" colormap.
  const PLASMA_STOPS = [
    [0.00, [13, 8, 135]],
    [0.25, [126, 3, 168]],
    [0.50, [204, 71, 120]],
    [0.75, [248, 149, 64]],
    [1.00, [240, 249, 33]],
  ];

  const PALETTES = {
    thermal: THERMAL_STOPS,
    haline: HALINE_STOPS,
    chlorophyll: CHLOROPHYLL_STOPS,
    viridis: VIRIDIS_STOPS,
    turbo: TURBO_STOPS,
    plasma: PLASMA_STOPS,
  };

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

  function getStopsFor(variable, palette) {
    if (palette && PALETTES[palette]) return PALETTES[palette];
    if (variable === "salinity") return HALINE_STOPS;
    if (variable === "chlorophyll") return CHLOROPHYLL_STOPS;
    return THERMAL_STOPS;
  }

  function valueToRGB(value, min, max, variable, palette, isLog) {
    let t;
    if (isLog && min > 0 && max > min) {
      const vClamped = Math.max(min, Math.min(max, value));
      t = (Math.log10(vClamped) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
    } else {
      t = max > min ? (value - min) / (max - min) : 0.5;
    }
    const stops = getStopsFor(variable, palette);
    return sampleStops(stops, t);
  }

  function valueToCSS(value, min, max, variable, palette, isLog) {
    const [r, g, b] = valueToRGB(value, min, max, variable, palette, isLog);
    return `rgb(${r},${g},${b})`;
  }

  function rgbToCSS(rgb) {
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  }

  const ColorMaps = {
    valueToRGB,
    valueToCSS,
    rgbToCSS,
    getStopsFor,
    PALETTES,
    THERMAL_STOPS,
    HALINE_STOPS,
    CHLOROPHYLL_STOPS,
    VIRIDIS_STOPS,
    TURBO_STOPS,
    PLASMA_STOPS,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ColorMaps;
  } else {
    global.ColorMaps = ColorMaps;
  }
})(typeof window !== "undefined" ? window : globalThis);

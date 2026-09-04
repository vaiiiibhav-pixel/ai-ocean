// Plain-Node unit tests for the dependency-free math modules (no browser needed).
const assert = require("assert");
const path = require("path");

const ColorMaps = require(path.join(__dirname, "..", "frontend", "js", "colormap.js"));
const { Projector } = require(path.join(__dirname, "..", "frontend", "js", "projector.js"));

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok   - ${name}`);
  } catch (e) {
    console.log(`FAIL - ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

// --- ColorMaps -------------------------------------------------------------
check("valueToRGB clamps to range endpoints", () => {
  const cold = ColorMaps.valueToRGB(0, 0, 30, "temperature");
  const hot = ColorMaps.valueToRGB(30, 0, 30, "temperature");
  assert.deepStrictEqual(cold, ColorMaps.THERMAL_STOPS[0][1]);
  assert.deepStrictEqual(hot, ColorMaps.THERMAL_STOPS[ColorMaps.THERMAL_STOPS.length - 1][1]);
});

check("valueToRGB is monotonic-ish along the red channel for temperature", () => {
  const low = ColorMaps.valueToRGB(5, 0, 30, "temperature");
  const high = ColorMaps.valueToRGB(28, 0, 30, "temperature");
  // Warm end should be redder / less blue than the cold end.
  assert.ok(high[0] >= low[0] - 5, `expected high red >= low red-ish, got ${high} vs ${low}`);
});

check("valueToCSS returns a valid rgb() string", () => {
  const css = ColorMaps.valueToCSS(15, 0, 30, "salinity");
  assert.match(css, /^rgb\(\d+,\d+,\d+\)$/);
});

check("out-of-range values clamp rather than throw", () => {
  assert.doesNotThrow(() => ColorMaps.valueToRGB(-100, 0, 30, "temperature"));
  assert.doesNotThrow(() => ColorMaps.valueToRGB(1000, 0, 30, "temperature"));
});

// --- Projector ---------------------------------------------------------------
check("origin projects near canvas center when camera faces it", () => {
  const p = new Projector({ yaw: 0, pitch: 0, camDist: 5, focal: 5, zoom: 1 });
  const { sx, sy, visible } = p.project(0, 0, 0, 800, 600);
  assert.ok(visible);
  assert.ok(Math.abs(sx - 400) < 1e-6, `sx=${sx}`);
  assert.ok(Math.abs(sy - 300) < 1e-6, `sy=${sy}`);
});

check("a point further along +X projects to the right of center (yaw=0)", () => {
  const p = new Projector({ yaw: 0, pitch: 0, camDist: 5, focal: 5, zoom: 1 });
  const { sx } = p.project(1, 0, 0, 800, 600);
  assert.ok(sx > 400, `expected right of center, got sx=${sx}`);
});

check("90deg yaw rotates which world axis drives screen-X vs depth", () => {
  const p = new Projector({ yaw: Math.PI / 2, pitch: 0, camDist: 5, focal: 5, zoom: 1 });
  const projX = p.project(1, 0, 0, 800, 600); // world +X now rotates into the depth axis
  const projZ = p.project(0, 0, 3, 800, 600); // world +Z now rotates into screen-X
  assert.ok(Math.abs(projX.sx - 400) < 1e-6, `+X should land on-center after 90deg yaw, got sx=${projX.sx}`);
  assert.ok(Math.abs(projZ.sx - 400) > 1, `+Z should move off center after 90deg yaw, got sx=${projZ.sx}`);
});

check("points nearer the camera position get a larger projected scale (perspective)", () => {
  // Camera orbits at +camDist looking toward the origin, so a point with a
  // larger world Z (closer to the camera's side) should appear larger.
  const p = new Projector({ yaw: 0, pitch: 0, camDist: 5, focal: 5, zoom: 1 });
  const nearer = p.project(1, 0, 1, 800, 600);
  const farther = p.project(1, 0, -1, 800, 600);
  assert.ok(nearer.scale > farther.scale, `expected nearer.scale (${nearer.scale}) > farther.scale (${farther.scale})`);
});

check("zoom increases on-screen displacement", () => {
  const base = new Projector({ yaw: 0, pitch: 0, camDist: 5, focal: 5, zoom: 1 });
  const zoomed = new Projector({ yaw: 0, pitch: 0, camDist: 5, focal: 5, zoom: 2 });
  const a = base.project(1, 0, 0, 800, 600);
  const b = zoomed.project(1, 0, 0, 800, 600);
  assert.ok(Math.abs(b.sx - 400) > Math.abs(a.sx - 400));
});

check("a point behind the camera is marked not visible", () => {
  const p = new Projector({ yaw: 0, pitch: 0, camDist: 2, focal: 5, zoom: 1 });
  const behind = p.project(0, 0, 10, 800, 600); // rotated into +Z which after camDist subtraction is > camDist
  assert.strictEqual(behind.visible, false);
});

console.log(`\n${passed} test(s) passed.`);
if (process.exitCode) {
  console.log("SOME TESTS FAILED");
} else {
  console.log("ALL TESTS PASSED");
}

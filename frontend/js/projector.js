/* Minimal hand-rolled 3D camera/projection — no WebGL/Three.js dependency.
 * Pure math, no DOM dependency (unit-testable in Node).
 *
 * World space: X = east/west, Y = up (elevation), Z = north/south.
 * The camera orbits the origin at a fixed distance, controlled by
 * yaw (rotation around Y) and pitch (rotation around X), and can zoom
 * by changing focal length / camera distance.
 */
(function (global) {
  "use strict";

  class Projector {
    constructor({ yaw = 0.6, pitch = 0.55, camDist = 6.5, focal = 5.5, zoom = 1, pixelScale = 170 } = {}) {
      this.yaw = yaw;
      this.pitch = pitch;
      this.camDist = camDist;
      this.focal = focal;
      this.zoom = zoom;
      // World-space units are chosen for readable math (a few units across
      // the whole scene); pixelScale converts those units to on-screen
      // pixels so the scene actually fills a typical canvas.
      this.pixelScale = pixelScale;
    }

    // Rotate a world-space point by yaw then pitch, return camera-space [x,y,z].
    toCameraSpace(x, y, z) {
      const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;

      const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
      const y2 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;

      return [x1, y2, z2];
    }

    // Project a world point to {sx, sy, depth, visible}. depth is used for
    // painter's-algorithm sorting (larger depth = farther from camera).
    project(x, y, z, canvasW, canvasH) {
      const [cx, cy, cz] = this.toCameraSpace(x, y, z);
      const camSpaceZ = cz - this.camDist; // negative = in front of camera
      const denom = -camSpaceZ; // positive when in front
      if (denom <= 0.01) {
        return { sx: 0, sy: 0, depth: Infinity, visible: false };
      }
      const scale = (this.focal / denom) * this.zoom;
      const sx = canvasW / 2 + cx * scale * this.pixelScale;
      const sy = canvasH / 2 - cy * scale * this.pixelScale;
      return { sx, sy, depth: denom, visible: true, scale };
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { Projector };
  } else {
    global.Projector = Projector;
  }
})(typeof window !== "undefined" ? window : globalThis);

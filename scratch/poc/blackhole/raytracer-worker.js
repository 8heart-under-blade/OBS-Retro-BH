'use strict';
importScripts('physics.js?v=4');
let generation = 0;
self.onmessage = event => {
  const task = event.data;
  const current = ++generation;
  const { width, height, inclination, curved, id } = task;
  const scale = Math.min(width / 52, height / 38);
  const cx = width * .49, cy = height * .52;
  const flux = new Float32Array(width * height);
  const radius = new Float32Array(width * height);
  const azimuth = new Float32Array(width * height);
  let row = 0;
  function chunk() {
    if (current !== generation) return;
    const end = Math.min(height, row + 6);
    for (; row < end; row++) {
      for (let col = 0; col < width; col++) {
        const x = (col + .5 - cx) / scale;
        const y = (cy - row - .5) / scale;
        const hit = BlackHolePhysics.traceRay(x, y, inclination, curved);
        if (hit) {
          const index = row * width + col;
          flux[index] = hit.flux;
          radius[index] = hit.radius;
          azimuth[index] = hit.azimuth;
        }
      }
    }
    if (row < height) setTimeout(chunk, 0);
    else self.postMessage({ id, width, height, flux, radius, azimuth }, [flux.buffer, radius.buffer, azimuth.buffer]);
  }
  chunk();
};

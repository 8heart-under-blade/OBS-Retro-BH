/* Schwarzschild thin-disk ray tracer. Geometric units: G = c = M = 1.
 * A null geodesic lies in a plane through the origin. With u = 1/r,
 * its exact orbit equation is u'' + u = 3u², and u'(0) = 1/b at infinity.
 * We integrate backwards from the observer and stop at the FIRST emitting
 * disk intersection, the horizon (r = 2), or escape to infinity.
 */
(function (root) {
  'use strict';
  const INNER_RADIUS = 6; // Schwarzschild ISCO, not the event horizon.
  const OUTER_RADIUS = 22;
  const CRITICAL_IMPACT = Math.sqrt(27); // Apparent shadow at infinity.
  const STEP = .025;

  function advance(s, h) {
    const u = s[0], v = s[1];
    const a1 = 3 * u * u - u;
    const u2 = u + h * v / 2;
    const v2 = v + h * a1 / 2;
    const a2 = 3 * u2 * u2 - u2;
    const u3 = u + h * v2 / 2;
    const v3 = v + h * a2 / 2;
    const a3 = 3 * u3 * u3 - u3;
    const u4 = u + h * v3;
    const v4 = v + h * a3;
    const a4 = 3 * u4 * u4 - u4;
    s[0] = u + h * (v + 2 * v2 + 2 * v3 + v4) / 6;
    s[1] = v + h * (a1 + 2 * a2 + 2 * a3 + a4) / 6;
  }

  function edgeFade(r) {
    // A smooth emissivity window, not a change to the geodesic geometry.
    // The quintic taper has zero first/second derivatives at both ends.
    const t = Math.max(0, Math.min(1, (OUTER_RADIUS - r) / 8));
    return t * t * t * (t * (6 * t - 15) + 10);
  }

  function diskHit(r, azimuth, x, sinInclination, order) {
    // Circular Schwarzschild geodesics: Ω = r^-3/2, u^t = (1 - 3/r)^-1/2.
    // The conserved photon angular momentum is λ = -x sin(i).
    // g = ν_observed / ν_emitted = 1 / [u^t (1 - Ω λ)].
    const shift = Math.sqrt(1 - 3 / r) / (1 + x * sinInclination / Math.pow(r, 1.5));
    // A zero-torque, Newtonian thin-disk emissivity. This is intentionally
    // NOT advertised as a full Novikov–Thorne radiative-transfer calculation.
    const flux = Math.pow(6 / r, 3) * (1 - Math.sqrt(6 / r)) / .0566528;
    return { radius: r, azimuth, shift, flux: flux * edgeFade(r) * Math.pow(shift, 4), order };
  }

  function traceRay(x, y, inclination, curved = true) {
    const sinI = Math.sin(inclination), cosI = Math.cos(inclination);
    const b = Math.hypot(x, y);
    if (b < 1e-8) return null;
    if (!curved) {
      // Explicit flat-space comparison; no artificial shadow or photon ring.
      const diskY = y / cosI;
      const r = Math.hypot(x, diskY);
      return r >= INNER_RADIUS && r <= OUTER_RADIUS
        ? { radius: r, azimuth: Math.atan2(diskY, x), shift: 1,
          flux: Math.pow(6 / r, 3) * (1 - Math.sqrt(6 / r)) / .0566528 * edgeFade(r), order: 0 }
        : null;
    }
    const screenZ = y / b * sinI;
    // In the ray's orbital plane, z(φ)/r = cos(i) cos(φ) + screenZ sin(φ).
    // Consecutive intersections with the equatorial disk are exactly π apart.
    let target = Math.atan2(-cosI, screenZ);
    if (target <= 0) target += Math.PI;
    const s = [0, 1 / b];
    let phi = 0;
    for (let order = 0; order < 4; order++, target += Math.PI) {
      while (phi < target - 1e-10) {
        const h = Math.min(STEP, target - phi);
        advance(s, h);
        phi += h;
        if (s[0] >= .5 || s[0] <= 0) return null;
      }
      const r = 1 / s[0];
      if (r >= INNER_RADIUS && r <= OUTER_RADIUS) {
        const diskX = x / b * Math.sin(phi);
        const diskY = -sinI * Math.cos(phi) + y / b * cosI * Math.sin(phi);
        return diskHit(r, Math.atan2(diskY, diskX), x, sinI, order);
      }
    }
    return null;
  }

  // Diagnostic integration independent of the disk: useful for checking
  // photon capture, the critical impact parameter, and weak-field deflection.
  function orbitOutcome(b, step = STEP) {
    const s = [0, 1 / b];
    let phi = 0, previousU = 0;
    while (phi < 12 * Math.PI) {
      previousU = s[0];
      advance(s, step);
      phi += step;
      if (s[0] >= .5) return { captured: true, phi };
      if (s[0] <= 0) {
        const escapePhi = phi - step + step * previousU / (previousU - s[0]);
        return { captured: false, phi: escapePhi, deflection: escapePhi - Math.PI };
      }
    }
    return { captured: false, orbiting: true, phi };
  }
  const api = { traceRay, orbitOutcome, edgeFade, INNER_RADIUS, OUTER_RADIUS, CRITICAL_IMPACT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlackHolePhysics = api;
})(typeof self !== 'undefined' ? self : globalThis);

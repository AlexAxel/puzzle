/**
 * OrnateCut v1 — geometric generator for ornate interlocking puzzle seams.
 *
 * Standalone, dependency-free module. Each internal edge is defined ONCE and
 * traversed in reverse by its neighbor. This guarantees a common contour.
 *
 * Coordinates are in units of image pixels; the output is independent of
 * Canvas rendering and can be serialized for a future Unity importer.
 *
 * The first procedural style uses small opposing floral/petal-like lobes
 * and slightly offset four-way junctions. It does not yet insert recognizable
 * animal silhouettes ("whimsy" shapes); those require polygon topology.
 */
(function (root) {
  "use strict";
  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeEdge() {
    const sign = Math.random() > .5 ? 1 : -1;
    const n = Math.random() > .6 ? 2 : 3;
    const motifs = [];
    for (let i = 0; i < n; i += 1) {
      const base = (i + .5) / n;
      const width = (n === 3 ? .205 : .268) * rand(.91, 1.08);
      const center = base + rand(-.027, .027);
      motifs.push({
        start: center - width / 2,
        width,
        sign: (i % 2 ? -1 : 1) * sign,
        depth: rand(.15, .20),
        shape: Math.random() > .48 ? "round" : "leaf"
      });
    }
    motifs.sort((a, b) => a.start - b.start);
    return { kind: "ornate", motifs };
  }

  function generate(rows, cols, w, h) {
    const H = Array.from({ length: rows - 1 }, () =>
      Array.from({ length: cols }, makeEdge));
    const V = Array.from({ length: rows }, () =>
      Array.from({ length: cols - 1 }, makeEdge));
    const corners = Array.from({ length: rows + 1 }, (_, r) =>
      Array.from({ length: cols + 1 }, (_, c) => ({
        x: c * w + (c !== 0 && c !== cols ? rand(-.075, .075) * w : 0),
        y: r * h + (r !== 0 && r !== rows ? rand(-.075, .075) * h : 0)
      })));
    return { H, V, corners };
  }

  // The path uses x=progress along a canonical edge and y=normal displacement
  // in units of min(piece width, piece height). The same cubic coordinates
  // are applied with reversed control points to the neighboring piece.
  function trace(path, x0, y0, x1, y1, edge, backward, cellSize) {
    if (!edge) { path.lineTo(x1, y1); return; }

    const sx = backward ? x1 : x0, sy = backward ? y1 : y0;
    const dx = (backward ? x0 : x1) - sx;
    const dy = (backward ? y0 : y1) - sy;
    const len = Math.hypot(dx, dy);
    const nx = dy / len, ny = -dx / len;
    const point = ([u, v]) => [
      sx + u * dx + nx * v * cellSize,
      sy + u * dy + ny * v * cellSize
    ];
    const segments = [];
    let last = [0, 0];

    function line(to) {
      segments.push({ type: "L", start: last, end: to });
      last = to;
    }
    function curve(c1, c2, to) {
      segments.push({ type: "C", start: last, c1, c2, end: to });
      last = to;
    }
    function taperTo(u) {
      const d = Math.max(.001, u - last[0]);
      curve([last[0] + d * .28, last[1] + .008],
            [u - d * .28, -.006], [u, 0]);
    }

    for (const m of edge.motifs) {
      const a = m.start, b = m.start + m.width;
      const t = m.width, d = m.sign * m.depth;
      if (a > last[0]) taperTo(a);
      const profile = m.shape === "leaf" ? 1.12 : 1;
      // Narrow throat, broad top, and asymmetric inset are characteristic
      // of a cut wooden piece. The "leaf" option has a sharper crown.
      curve([a+t*.10, 0], [a+t*.21, d*.045], [a+t*.20, d*.22]);
      curve([a+t*.20, d*.40], [a-t*.055, d*.42], [a+t*.07, d*.76]);
      curve([a+t*.12, d*.99], [a+t*.34, d*(m.shape === "leaf" ? 1.09 : profile)],
            [a+t*.50, d*profile]);
      curve([a+t*.67, d*(m.shape === "leaf" ? 1.08 : profile)],
            [a+t*.89, d*.99], [a+t*.93, d*.76]);
      curve([b+t*.055, d*.42], [b-t*.20, d*.40], [b-t*.20, d*.22]);
      curve([b-t*.21, d*.045], [b-t*.10, 0], [b, 0]);
    }
    if (last[0] < 1) taperTo(1);
    // Include the initial point only when required by Path2D's caller;
    // callers always start their piece contour at the canonical vertex.
    const list = backward ? segments.slice().reverse() : segments;
    for (const s of list) {
      if (s.type === "L") {
        path.lineTo(...point(backward ? s.start : s.end));
      } else {
        path.bezierCurveTo(...point(backward ? s.c2 : s.c1),
                           ...point(backward ? s.c1 : s.c2),
                           ...point(backward ? s.start : s.end));
      }
    }
  }

  root.OrnateCut = Object.freeze({ version: "1.0.0", generate, trace });
})(window);

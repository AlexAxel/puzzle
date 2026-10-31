(() => {
  "use strict";

  const COUNTS = [12, 24, 36, 48, 64, 80, 100, 120, 144, 180, 216];
  const $ = (id) => document.getElementById(id);
  const stage = $("stage");
  const countRange = $("count-range");
  const countValue = $("count-value");
  const gridLabel = $("grid-label");
  const fileInput = $("file-input");
  const dropzone = $("dropzone");
  const cutButton = $("cut-button");
  const resetButton = $("reset-button");
  const statusText = $("board-status-text");
  const message = $("message");
  const hitCanvas = document.createElement("canvas");
  const hitContext = hitCanvas.getContext("2d");

  const state = {
    image: null,
    objectUrl: null,
    pieces: [],
    geometry: null,
    horizontal: [],
    vertical: [],
    count: 48,
    rows: 6,
    cols: 8,
    z: 1,
    dragging: null,
    imageName: "Демонстрационный пейзаж",
    cut: false
  };

  function showError(text) {
    message.textContent = text;
    message.hidden = false;
  }

  function clearError() {
    message.textContent = "";
    message.hidden = true;
  }

  function chooseGrid(count, aspect) {
    let best = null;
    for (let rows = 1; rows <= count; rows += 1) {
      if (count % rows !== 0) continue;
      const cols = count / rows;
      const match = Math.abs(Math.log((cols / rows) / aspect));
      const penalty = Math.min(rows, cols) < 2 ? 10 : 0;
      const score = match + penalty;
      if (!best || score < best.score) best = { rows, cols, score };
    }
    return best;
  }

  function currentCount() {
    return COUNTS[Number(countRange.value)] || 48;
  }

  function updateCountPreview() {
    const value = currentCount();
    state.count = value;
    countValue.textContent = String(value);
    countRange.style.setProperty("--range-progress", String(Number(countRange.value) * 10) + "%");
    const aspect = state.image ? state.image.naturalWidth / state.image.naturalHeight : 1.5;
    const grid = chooseGrid(value, aspect);
    gridLabel.textContent = "Сетка " + grid.cols + " × " + grid.rows + " — все детали уникальны, соседние соединения совпадают.";
  }

  function makeEdge() {
    return {
      sign: Math.random() > 0.5 ? 1 : -1,
      center: 0.465 + Math.random() * 0.07,
      span: 0.31 + Math.random() * 0.085,
      depth: 0.245 + Math.random() * 0.065
    };
  }

  function createEdges(rows, cols) {
    state.horizontal = Array.from({ length: rows - 1 }, () =>
      Array.from({ length: cols }, makeEdge));
    state.vertical = Array.from({ length: rows }, () =>
      Array.from({ length: cols - 1 }, makeEdge));
  }

  // A boundary has one canonical direction. Both adjacent pieces traverse the
  // very same Bezier geometry, in opposite directions, for a perfect fit.
  function addEdge(path, fromX, fromY, toX, toY, edge, reversed, cellW, cellH) {
    if (!edge) {
      path.lineTo(toX, toY);
      return;
    }

    const ax = reversed ? toX : fromX;
    const ay = reversed ? toY : fromY;
    const bx = reversed ? fromX : toX;
    const by = reversed ? fromY : toY;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const normalX = dy / len, normalY = -dx / len;
    const depth = edge.sign * edge.depth * Math.min(cellW, cellH);
    const a = edge.center - edge.span / 2;
    const b = edge.center + edge.span / 2;
    const s = edge.span;

    // Coordinates are expressed as edge progress (0..1) and knob height.
    // A narrow neck and rounded wider crown give the classic jigsaw profile.
    const segments = [
      { type: "line", start: [0, 0], end: [a, 0] },
      { type: "curve", start: [a, 0],
        c1: [a + s * 0.15, 0], c2: [a + s * 0.18, 0.08], end: [a + s * 0.18, 0.22] },
      { type: "curve", start: [a + s * 0.18, 0.22],
        c1: [a + s * 0.17, 0.40], c2: [a - s * 0.10, 0.32], end: [a + s * 0.02, 0.69] },
      { type: "curve", start: [a + s * 0.02, 0.69],
        c1: [a + s * 0.09, 1.05], c2: [a + s * 0.30, 1.02], end: [a + s * 0.50, 1.00] },
      { type: "curve", start: [a + s * 0.50, 1.00],
        c1: [a + s * 0.70, 1.02], c2: [a + s * 0.91, 1.05], end: [a + s * 0.98, 0.69] },
      { type: "curve", start: [a + s * 0.98, 0.69],
        c1: [b + s * 0.10, 0.32], c2: [b - s * 0.17, 0.40], end: [b - s * 0.18, 0.22] },
      { type: "curve", start: [b - s * 0.18, 0.22],
        c1: [b - s * 0.18, 0.08], c2: [b - s * 0.15, 0], end: [b, 0] },
      { type: "line", start: [b, 0], end: [1, 0] }
    ];

    function pos(point) {
      return [
        ax + dx * point[0] + normalX * depth * point[1],
        ay + dy * point[0] + normalY * depth * point[1]
      ];
    }

    const list = reversed ? segments.slice().reverse() : segments;
    for (const segment of list) {
      const endpoint = pos(reversed ? segment.start : segment.end);
      if (segment.type === "line") {
        path.lineTo(endpoint[0], endpoint[1]);
      } else {
        const ctrl1 = pos(reversed ? segment.c2 : segment.c1);
        const ctrl2 = pos(reversed ? segment.c1 : segment.c2);
        path.bezierCurveTo(ctrl1[0], ctrl1[1], ctrl2[0], ctrl2[1], endpoint[0], endpoint[1]);
      }
    }
  }

  function piecePath(row, col, cellW, cellH) {
    const x0 = col * cellW, x1 = (col + 1) * cellW;
    const y0 = row * cellH, y1 = (row + 1) * cellH;
    const p = new Path2D();
    p.moveTo(x0, y0);
    addEdge(p, x0, y0, x1, y0,
      row > 0 ? state.horizontal[row - 1][col] : null, false, cellW, cellH);
    addEdge(p, x1, y0, x1, y1,
      col < state.cols - 1 ? state.vertical[row][col] : null, false, cellW, cellH);
    addEdge(p, x1, y1, x0, y1,
      row < state.rows - 1 ? state.horizontal[row][col] : null, true, cellW, cellH);
    addEdge(p, x0, y1, x0, y0,
      col > 0 ? state.vertical[row][col - 1] : null, true, cellW, cellH);
    p.closePath();
    return p;
  }

  function measureImage() {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    const inset = Math.max(19, Math.min(62, w * 0.075, h * 0.085));
    const aspect = state.image.naturalWidth / state.image.naturalHeight;
    const imageW = Math.min(w - inset * 2, (h - inset * 2) * aspect);
    const imageH = imageW / aspect;
    return {
      x: (w - imageW) / 2,
      y: (h - imageH) / 2,
      w: imageW,
      h: imageH,
      cellW: imageW / state.cols,
      cellH: imageH / state.rows
    };
  }

  function createPieceCanvas(piece) {
    const g = state.geometry;
    const pad = Math.min(g.cellW, g.cellH) * 0.44 + 7;
    const cssW = g.cellW + pad * 2;
    const cssH = g.cellH + pad * 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    canvas.className = "puzzle-piece";
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.style.left = (g.x + piece.col * g.cellW - pad) + "px";
    canvas.style.top = (g.y + piece.row * g.cellH - pad) + "px";
    canvas.style.zIndex = String(piece.z);
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d", { alpha: true });
    ctx.setTransform(canvas.width / cssW, 0, 0, canvas.height / cssH, 0, 0);
    ctx.translate(pad - piece.col * g.cellW, pad - piece.row * g.cellH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Slightly raised paperboard side, with a soft contact shadow.
    ctx.save();
    ctx.translate(0, Math.max(1.3, Math.min(2.6, g.cellW * 0.025)));
    ctx.shadowColor = "rgba(32,19,12,.53)";
    ctx.shadowBlur = Math.max(3, Math.min(8, g.cellW * 0.085));
    ctx.shadowOffsetX = 1.2;
    ctx.shadowOffsetY = 2.4;
    ctx.fillStyle = "#d6b88f";
    ctx.fill(piece.path);
    ctx.restore();

    // Each separate canvas contains only its own clipped image fragment.
    ctx.save();
    ctx.clip(piece.path);
    ctx.drawImage(state.image, 0, 0, g.w, g.h);
    const x0 = piece.col * g.cellW, y0 = piece.row * g.cellH;
    const sheen = ctx.createLinearGradient(x0, y0, x0 + g.cellW, y0 + g.cellH);
    sheen.addColorStop(0, "rgba(255,255,255,.21)");
    sheen.addColorStop(.28, "rgba(255,255,255,.055)");
    sheen.addColorStop(.62, "rgba(255,255,255,0)");
    sheen.addColorStop(1, "rgba(20,10,5,.13)");
    ctx.fillStyle = sheen;
    ctx.fillRect(x0 - pad, y0 - pad, g.cellW + 2 * pad, g.cellH + 2 * pad);
    ctx.restore();

    // Dark cut line and thin catchlight give a subtle 2.5D beveled edge.
    ctx.strokeStyle = "rgba(34,22,15,.55)";
    ctx.lineWidth = Math.max(.8, Math.min(1.35, g.cellW * .014));
    ctx.stroke(piece.path);
    ctx.save();
    ctx.translate(-.45, -.55);
    ctx.strokeStyle = "rgba(255,250,228,.36)";
    ctx.lineWidth = .66;
    ctx.stroke(piece.path);
    ctx.restore();

    piece.canvas = canvas;
    updatePiecePosition(piece);
    return canvas;
  }

  function updatePiecePosition(piece) {
    if (!piece.canvas) return;
    piece.canvas.style.transform = "translate3d(" + piece.dx + "px," + piece.dy + "px,0)";
  }

  function renderPreview() {
    if (!state.image) return;
    state.cut = false;
    state.pieces = [];
    stage.replaceChildren();
    const g = measureImage();
    state.geometry = g;
    const preview = document.createElement("canvas");
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    preview.width = Math.max(1, Math.round(g.w * ratio));
    preview.height = Math.max(1, Math.round(g.h * ratio));
    preview.style.width = g.w + "px";
    preview.style.height = g.h + "px";
    preview.style.left = g.x + "px";
    preview.style.top = g.y + "px";
    preview.className = "puzzle-piece";
    const ctx = preview.getContext("2d");
    ctx.drawImage(state.image, 0, 0, preview.width, preview.height);
    stage.appendChild(preview);
    statusText.textContent = "Изображение загружено · нажмите «Разрезать»";
  }

  function renderPieces(preservePositions) {
    if (!state.image || !state.cut) return;
    const previous = preservePositions && state.geometry
      ? state.pieces.map((p) => ({
          dx: p.dx / state.geometry.cellW,
          dy: p.dy / state.geometry.cellH,
          z: p.z
        }))
      : [];
    state.geometry = measureImage();
    state.dragging = null;
    stage.classList.remove("dragging");
    stage.replaceChildren();
    state.pieces = [];

    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const index = row * state.cols + col;
        const older = previous[index];
        const piece = {
          row, col,
          path: piecePath(row, col, state.geometry.cellW, state.geometry.cellH),
          dx: older ? older.dx * state.geometry.cellW : 0,
          dy: older ? older.dy * state.geometry.cellH : 0,
          z: older ? older.z : index + 1,
          canvas: null
        };
        state.pieces.push(piece);
        stage.appendChild(createPieceCanvas(piece));
      }
    }
    state.z = Math.max(state.z, state.count + 1, ...state.pieces.map((p) => p.z + 1));
    updateStatus();
  }

  function cutPuzzle() {
    if (!state.image) return;
    clearError();
    const g = chooseGrid(currentCount(), state.image.naturalWidth / state.image.naturalHeight);
    state.rows = g.rows;
    state.cols = g.cols;
    state.count = state.rows * state.cols;
    createEdges(state.rows, state.cols);
    state.cut = true;
    renderPieces(false);
  }

  function updateStatus() {
    if (!state.cut) return;
    const outside = state.pieces.filter((p) => Math.hypot(p.dx, p.dy) > 1).length;
    statusText.textContent = outside
      ? "Деталей не на месте: " + outside + " из " + state.count
      : state.count + " деталей · собранный вид";
  }

  function pointerCoordinates(event) {
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function hitPiece(x, y) {
    if (!hitContext || !state.geometry) return null;
    const g = state.geometry;
    const sorted = state.pieces.slice().sort((a, b) => b.z - a.z);
    for (const piece of sorted) {
      const imageX = x - g.x - piece.dx;
      const imageY = y - g.y - piece.dy;
      if (hitContext.isPointInPath(piece.path, imageX, imageY)) return piece;
    }
    return null;
  }

  stage.addEventListener("pointerdown", (event) => {
    if (!state.cut || state.dragging || (event.pointerType === "mouse" && event.button !== 0)) return;
    const at = pointerCoordinates(event);
    const piece = hitPiece(at.x, at.y);
    if (!piece) return;
    piece.z = ++state.z;
    piece.canvas.style.zIndex = String(piece.z);
    state.dragging = { piece, id: event.pointerId, startX: at.x, startY: at.y, dx: piece.dx, dy: piece.dy };
    stage.classList.add("dragging");
    try { stage.setPointerCapture(event.pointerId); } catch (_) { /* ignore */ }
    event.preventDefault();
  });

  stage.addEventListener("pointermove", (event) => {
    const drag = state.dragging;
    if (!drag || drag.id !== event.pointerId) return;
    const at = pointerCoordinates(event);
    drag.piece.dx = drag.dx + at.x - drag.startX;
    drag.piece.dy = drag.dy + at.y - drag.startY;
    updatePiecePosition(drag.piece);
    event.preventDefault();
  });

  function finishDrag(event) {
    const drag = state.dragging;
    if (!drag || drag.id !== event.pointerId) return;
    const piece = drag.piece;
    const snapDistance = Math.max(5, Math.min(18, Math.min(state.geometry.cellW, state.geometry.cellH) * .16));
    if (Math.hypot(piece.dx, piece.dy) < snapDistance) {
      piece.dx = 0;
      piece.dy = 0;
      updatePiecePosition(piece);
    }
    state.dragging = null;
    stage.classList.remove("dragging");
    try { if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId); } catch (_) { /* ignore */ }
    updateStatus();
  }

  stage.addEventListener("pointerup", finishDrag);
  stage.addEventListener("pointercancel", finishDrag);
  stage.addEventListener("lostpointercapture", (event) => {
    if (state.dragging && state.dragging.id === event.pointerId) {
      state.dragging = null;
      stage.classList.remove("dragging");
      updateStatus();
    }
  });

  function resetPieces() {
    if (!state.cut) return;
    for (const piece of state.pieces) {
      piece.dx = 0;
      piece.dy = 0;
      updatePiecePosition(piece);
    }
    state.dragging = null;
    stage.classList.remove("dragging");
    updateStatus();
  }

  function loadFile(file) {
    if (!file) return;
    const isImage = file.type.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(file.name);
    if (!isImage) {
      showError("Выберите изображение в формате JPG, PNG, WEBP, SVG или другом формате, поддерживаемом браузером.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      showError("Файл слишком большой. Максимальный размер — 30 МБ.");
      return;
    }
    clearError();
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        URL.revokeObjectURL(objectUrl);
        showError("У изображения нет подходящих размеров.");
        return;
      }
      const oldUrl = state.objectUrl;
      state.objectUrl = objectUrl;
      state.image = img;
      state.imageName = file.name;
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      $("file-name").textContent = file.name;
      $("file-hint").textContent = img.naturalWidth + " × " + img.naturalHeight + " пикселей";
      $("upload-preview").replaceChildren();
      const thumbnail = document.createElement("img");
      thumbnail.src = objectUrl;
      thumbnail.alt = "";
      $("upload-preview").appendChild(thumbnail);
      updateCountPreview();
      renderPreview();
      fileInput.value = "";
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      showError("Не удалось прочитать изображение. Проверьте формат и содержимое файла.");
      fileInput.value = "";
    };
    img.src = objectUrl;
  }

  fileInput.addEventListener("change", (event) => loadFile(event.target.files[0]));
  ["dragenter", "dragover"].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-over");
  }));
  ["dragleave", "drop"].forEach((name) => dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag-over");
  }));
  dropzone.addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));
  countRange.addEventListener("input", updateCountPreview);
  cutButton.addEventListener("click", cutPuzzle);
  resetButton.addEventListener("click", resetPieces);

  let resizeRequested = false;
  const observer = new ResizeObserver(() => {
    if (resizeRequested) return;
    resizeRequested = true;
    requestAnimationFrame(() => {
      resizeRequested = false;
      if (!state.image || !stage.clientWidth || !stage.clientHeight) return;
      if (state.cut) renderPieces(true);
      else renderPreview();
    });
  });
  observer.observe(stage);

  // Built-in artwork provides a ready-to-drag example before a user uploads a file.
  // This SVG is local and generated by the app; no CDN, server, or account needed.
  const demoSvg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">',
    '<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#608c9c"/><stop offset=".58" stop-color="#bfd0bd"/><stop offset="1" stop-color="#f3d2a0"/></linearGradient>',
    '<linearGradient id="lake" x2="0" y2="1"><stop stop-color="#82aba5"/><stop offset="1" stop-color="#244f58"/></linearGradient>',
    '<linearGradient id="hill" x2="0" y2="1"><stop stop-color="#7e9881"/><stop offset="1" stop-color="#3b645d"/></linearGradient>',
    '<linearGradient id="ground" x2="0" y2="1"><stop stop-color="#9ba47a"/><stop offset="1" stop-color="#3c6759"/></linearGradient></defs>',
    '<rect width="1200" height="800" fill="url(#sky)"/>',
    '<circle cx="854" cy="194" r="77" fill="#fff0bd" opacity=".77"/>',
    '<g fill="#fffbe5" opacity=".45"><ellipse cx="290" cy="166" rx="124" ry="19"/><ellipse cx="349" cy="151" rx="92" ry="26"/><ellipse cx="937" cy="94" rx="115" ry="15"/><ellipse cx="1024" cy="112" rx="91" ry="20"/></g>',
    '<path d="M0 427 140 287 224 353 380 191 525 382 624 264 753 386 900 213 1101 418 1200 321V800H0Z" fill="#799899"/>',
    '<path d="m253 313 127-122 142 188-132-95-53 52-30-27-46 28Z M806 307l94-94 152 179-153-91-56 32Z" fill="#e2dfcf" opacity=".85"/>',
    '<path d="M0 468Q168 343 327 426T645 422T1200 388V800H0Z" fill="#577e78"/>',
    '<path d="M0 536Q241 408 456 489T875 453T1200 484V800H0Z" fill="url(#hill)"/>',
    '<path d="M0 542Q304 485 607 531T1200 508V800H0Z" fill="url(#lake)"/>',
    '<g fill="none" stroke="#f6ddad" opacity=".25" stroke-width="4"><path d="M606 565Q818 548 1052 563"/><path d="M450 596Q752 580 1180 606"/><path d="M333 649Q720 632 1057 650"/><path d="M527 698Q877 689 1190 708"/></g>',
    '<path d="M0 629Q115 594 220 643T474 714T716 737T1200 630V800H0Z" fill="url(#ground)"/>',
    '<path d="M0 721Q195 680 314 752T730 765T1200 689V800H0Z" fill="#315a4d"/>',
    '<g fill="#244c45"><path d="m68 585 32-120 30 120h-16v55H83v-55Z"/><path d="m102 554 34-141 33 141h-18v100h-29V554Z"/><path d="m1088 570 31-141 38 141h-22v97h-29v-97Z"/><path d="m1138 588 26-112 29 112h-16v100h-24v-100Z"/></g>',
    '<g fill="#173b3b" opacity=".9"><path d="m0 565 70-151 65 151h-37v120H39V565Z"/><path d="m48 579 65-181 64 181h-36v128H83V579Z"/><path d="m1120 574 49-144 60 144h-38v146h-46V574Z"/></g>',
    '<g fill="#d9bd83" opacity=".88"><circle cx="247" cy="738" r="5"/><circle cx="271" cy="758" r="4"/><circle cx="438" cy="758" r="6"/><circle cx="995" cy="750" r="5"/><circle cx="1032" cy="732" r="4"/></g>',
    '<g fill="none" stroke="#344c51" stroke-width="4" stroke-linecap="round"><path d="m196 170 15-7 16 8"/><path d="m239 154 14-6 14 7"/><path d="m713 145 13-7 13 6"/></g>',
    '</svg>'
  ].join("");

  const demoImage = new Image();
  demoImage.onload = () => {
    if (state.image) return;
    state.image = demoImage;
    $("file-name").textContent = "Загрузить свою картинку";
    $("file-hint").textContent = "Или перетащите файл сюда";
    const thumb = document.createElement("img");
    thumb.src = demoImage.src;
    thumb.alt = "";
    $("upload-preview").replaceChildren(thumb);
    updateCountPreview();
    cutPuzzle();
  };
  demoImage.onerror = () => showError("Не удалось загрузить демонстрационное изображение.");
  demoImage.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(demoSvg);
  updateCountPreview();
})();

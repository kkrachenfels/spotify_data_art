// vinyl.js
const BUTT_IMAGE = new Image();
BUTT_IMAGE.src = "assets/caterpillar_butt.png";

class Vinyl {
  /**
   * @param {number} x - center x coordinate
   * @param {number} y - center y coordinate
   * @param {number} outerRadius - radius of the record edge
   * @param {number} innerRadius - radius of the label area
   * @param {string} labelColor - CSS color for the label area
   */
  constructor(x, y, outerRadius, innerRadius, labelColor = "#d6a22c") {
    this.position = { x, y };
    this.outerRadius = outerRadius;
    this.innerRadius = innerRadius;
    this.rotation = 0; // radians
    this.labelColor = labelColor;
    this.innerSwirlColors = [labelColor, labelColor];

    // Motion
    this.velocity = { x: 0, y: 0 };
    this.angularVelocity = 0; // radians per second

    // Track meta
    this.trackName = "";
    this.artist = "";
    this.album = "";
    this.bpm = 0;
    this.hoverBpm = null;
    this.hoverLinesOverride = null;
    this.previewUrl = null;

    // Hover state
    this._hovered = false;
  }

  /**
   * Update the vinyl's motion.
   * @param {number} deltaSeconds
   */
  update(deltaSeconds) {
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.rotation += this.angularVelocity * deltaSeconds;
  }

  /**
   * Hit-test in screen coordinates.
   * @param {number} px
   * @param {number} py
   */
  isPointInside(px, py) {
    const dx = px - this.position.x;
    const dy = py - this.position.y;
    return dx * dx + dy * dy <= this.outerRadius * this.outerRadius;
  }

  /**
   * Update hover state based on mouse position.
   * @param {number} px
   * @param {number} py
   */
  updateHover(px, py) {
    this._hovered = this.isPointInside(px, py);
    return this._hovered;
  }

  /**
   * Draws the vinyl onto a 2D rendering context.
   * Pass p5's drawingContext when using p5.
   * @param {CanvasRenderingContext2D} ctx
   */
  setSwirlColors(colors) {
    if (Array.isArray(colors) && colors.length) {
      this.innerSwirlColors = colors;
    }
  }

  draw(ctx, options = {}) {
    const { showHud = true } = options;
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(this.rotation);

    if (BUTT_IMAGE.complete) {
      const size = this.outerRadius * 2.5;
      ctx.drawImage(BUTT_IMAGE, -size / 2, -size / 2, size, size);
    }

    // Outer ring (vinyl edge)
    ctx.fillStyle = "#0f0f0f";
    ctx.beginPath();
    ctx.arc(0, 0, this.outerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Grooves (subtle rings)
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let r = this.innerRadius + 6; r < this.outerRadius - 4; r += 6) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Inner swirl (lollipop-style spiral)
    const swirlRadius = this.innerRadius * 0.9;
    const colors =
      this.innerSwirlColors.length > 0
        ? this.innerSwirlColors
        : [this.labelColor, this.labelColor];
    const spiralTurns = 4;
    const totalSteps = 160;
    const lineWidth = Math.max(4, this.innerRadius * 0.08);
    colors.forEach((color, offsetIndex) => {
      ctx.beginPath();
      for (let step = offsetIndex; step <= totalSteps; step += colors.length) {
        const t = step / totalSteps;
        const radius = swirlRadius * t;
        const angle = -Math.PI / 2 + t * spiralTurns * 2 * Math.PI;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        if (step === offsetIndex) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.stroke();
    });

    // Inner label
    const labelRadius = this.innerRadius * 0.6;
    ctx.fillStyle = this.labelColor;
    ctx.beginPath();
    ctx.arc(0, 0, labelRadius, 0, Math.PI * 2);
    ctx.fill();

    // Center dot
    ctx.fillStyle = "#f0f0f0";
    ctx.beginPath();
    ctx.arc(0, 0, this.innerRadius * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Track title around the ring
    this._drawTrackNameOnRing(ctx);

    // Hover HUD (counter-rotated to stay horizontal)
    if (showHud && this._hovered) this._drawHoverHud(ctx);

    ctx.restore();
  }

  drawHoverHud(ctx) {
    if (!this._hovered) return;
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(this.rotation);
    this._drawHoverHud(ctx);
    ctx.restore();
  }

  /**
   * Draw the track name along a circular arc, left-to-right and readable.
   * Assumes (0,0) is already at the center of the vinyl and rotated.
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */
  _drawTrackNameOnRing(ctx) {
    if (!this.trackName) return;

    const truncated = String(this.trackName).slice(0, 45);
    const text = truncated.toUpperCase();

    // Radius where the text sits: between label and outer edge
    const radius = (this.outerRadius + this.innerRadius) / 2;

    ctx.save();

    // Text style
    const fontSize = this.outerRadius * 0.16;
    ctx.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Total arc length of text (in pixels)
    let totalWidth = 0;
    for (const ch of text) totalWidth += ctx.measureText(ch).width;

    // s = r * theta => theta = s / r
    const totalAngle = totalWidth / radius;

    // Center the text at the top of the record (angle = -π/2)
    let currentAngle = -Math.PI / 2 - totalAngle / 2;

    for (const ch of text) {
      const charWidth = ctx.measureText(ch).width;
      const charAngle = charWidth / radius;
      const angle = currentAngle + charAngle / 2;

      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);

      ctx.save();
      ctx.translate(x, y);
      // Rotate so the baseline is tangent and the text is left-to-right
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();

      currentAngle += charAngle;
    }

    ctx.restore();
  }

  /**
   * Hover info panel (title / artist / BPM), counter-rotated so it reads horizontally.
   * Assumes we're already translated+rotated to the vinyl space.
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */
  /**
   * Hover info panel (title / artist / BPM), shown to the SIDE of the record.
   * Assumes we're already translated+rotated to the vinyl space.
   * Counter-rotates so it reads horizontally.
   */
  _drawHoverHud(ctx) {
    if (this.hoverLinesOverride && this.hoverLinesOverride.length) {
      this._drawCustomHoverLines(ctx, this.hoverLinesOverride);
      return;
    }
    const hoverBpm = this.hoverBpm ?? (this.bpm ? Math.round(this.bpm) : null);
    const lines = [
      this.trackName || "",
      this.artist ? `by ${this.artist}` : "",
      this.album ? `Album: ${this.album}` : "",
      hoverBpm ? `${hoverBpm} BPM` : "",
    ].filter(Boolean);
    if (!lines.length) return;

    ctx.save();
    // keep HUD horizontal
    ctx.rotate(-this.rotation);

    const pad = 10;
    const fontSize = Math.max(12, Math.floor(this.outerRadius * 0.12));
    ctx.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textBaseline = "top";

    // measure
    let w = 0;
    for (const s of lines) w = Math.max(w, ctx.measureText(s).width);
    const lh = fontSize * 1.2;
    const h = lh * lines.length;

    const boxW = w + pad * 2;
    const boxH = h + pad * 2;

    // default: to the RIGHT of the record
    const margin = 16;
    let x = this.outerRadius + margin; // left edge of box
    let y = -boxH / 2; // vertically centered

    // --- optional auto-flip if near right canvas edge ---
    // We can peek at canvas width from ctx.canvas; if placing at right would
    // overflow, flip to the LEFT.
    const canvas = ctx.canvas;
    if (canvas && typeof canvas.width === "number") {
      // transform our local (x + boxW, 0) back to canvas coords to check overflow
      // Since we counter-rotated, local X axis aligns with canvas X axis.
      const rightCanvasX = this.position.x + (x + boxW) * 1; // scale=1 in our usage
      if (rightCanvasX + 8 > canvas.width) {
        x = -(this.outerRadius + margin) - boxW; // flip to left
      }
    }

    // panel
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    this._roundedRect(ctx, x, y, boxW, boxH, 8);
    ctx.fill();

    // text
    ctx.fillStyle = "#fff";
    let ty = y + pad;
    for (const s of lines) {
      ctx.fillText(s, x + pad, ty);
      ty += lh;
    }

    ctx.restore();
  }

  /**
   * Utility: draw a rounded rectangle path.
   * @private
   */
  _roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  _drawCustomHoverLines(ctx, lines) {
    ctx.save();
    ctx.rotate(-this.rotation);

    const pad = 10;
    const fontSize = Math.max(12, Math.floor(this.outerRadius * 0.12));
    ctx.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textBaseline = "top";

    let w = 0;
    for (const s of lines) w = Math.max(w, ctx.measureText(s).width);
    const lh = fontSize * 1.2;
    const h = lh * lines.length;

    const boxW = w + pad * 2;
    const boxH = h + pad * 2;

    const margin = 16;
    let x = this.outerRadius + margin;
    let y = -boxH / 2;

    const canvas = ctx.canvas;
    if (canvas && typeof canvas.width === "number") {
      const rightCanvasX = this.position.x + (x + boxW);
      if (rightCanvasX + 8 > canvas.width) {
        x = -(this.outerRadius + margin) - boxW;
      }
    }

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    this._roundedRect(ctx, x, y, boxW, boxH, 8);
    ctx.fill();

    ctx.fillStyle = "#fff";
    let ty = y + pad;
    for (const s of lines) {
      ctx.fillText(s, x + pad, ty);
      ty += lh;
    }

    ctx.restore();
  }

  /**
   * Sets the drift velocity.
   * @param {number} vx
   * @param {number} vy
   */
  setVelocity(vx, vy) {
    this.velocity.x = vx;
    this.velocity.y = vy;
  }

  /**
   * Sets rotational speed directly (radians per second).
   * @param {number} omega
   */
  setAngularVelocity(omega) {
    this.angularVelocity = omega || 0;
  }

  /**
   * Set BPM and derive angular velocity from it.
   * @param {number} bpm
   * @param {number} spinsPerBeat - rotations per beat (default 0.05 = 1 rotation every 20 beats)
   */
  setBpm(bpm, spinsPerBeat = 0.05) {
    this.bpm = bpm || 0;
    const beatsPerSecond = this.bpm / 60;
    const rotationsPerSecond = beatsPerSecond * spinsPerBeat;
    this.angularVelocity = rotationsPerSecond * 2 * Math.PI;
  }

  /**
   * Set the track name to display along the ring.
   * @param {string} name
   */
  setTrackName(name) {
    this.trackName = name || "";
  }

  /**
   * Set title/artist/bpm (and optional spinsPerBeat) in one call.
   * @param {{title?: string, artist?: string, album?: string, bpm?: number, spinsPerBeat?: number, hoverBpm?: number, previewUrl?: string}} meta
   */
  setTrackMeta({
    title,
    artist,
    album,
    bpm,
    spinsPerBeat = 0.05,
    hoverBpm,
    previewUrl,
  } = {}) {
    if (title != null) this.trackName = title;
    if (artist != null) this.artist = artist;
    if (album != null) this.album = album;
    if (bpm != null) this.setBpm(bpm, spinsPerBeat);
    if (hoverBpm != null) {
      this.hoverBpm = hoverBpm;
    } else if (bpm != null) {
      this.hoverBpm = Math.round(bpm);
    }
    if (previewUrl != null) {
      console.log("Setting previewUrl:", previewUrl);
      this.previewUrl = previewUrl;
    }
  }

  /**
   * Convenience: set both track name and bpm at once.
   * @param {string} name
   * @param {number} bpm
   * @param {number} spinsPerBeat
   */
  setTrackInfo(name, bpm, spinsPerBeat = 0.05) {
    this.setTrackMeta({ title: name, bpm, spinsPerBeat });
  }

  setHoverLinesOverride(lines) {
    this.hoverLinesOverride = Array.isArray(lines) ? lines : null;
  }
}

if (typeof window !== "undefined") {
  window.Vinyl = Vinyl;
}

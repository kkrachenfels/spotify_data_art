// vinyl.js
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

    // Motion
    this.velocity = { x: 0, y: 0 };
    this.angularVelocity = 0; // radians per second

    // Track meta
    this.trackName = "";
    this.artist = "";
    this.bpm = 0;

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
  draw(ctx) {
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(this.rotation);

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

    // Inner label
    ctx.fillStyle = this.labelColor;
    ctx.beginPath();
    ctx.arc(0, 0, this.innerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Center dot
    ctx.fillStyle = "#f0f0f0";
    ctx.beginPath();
    ctx.arc(0, 0, this.innerRadius * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Track title around the ring
    this._drawTrackNameOnRing(ctx);

    // Hover HUD (counter-rotated to stay horizontal)
    if (this._hovered) this._drawHoverHud(ctx);

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

    const text = this.trackName.toUpperCase();

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
  _drawHoverHud(ctx) {
    const lines = [
      this.trackName || "",
      this.artist ? `by ${this.artist}` : "",
      this.bpm ? `${Math.round(this.bpm)} BPM` : "",
    ].filter(Boolean);

    if (!lines.length) return;

    ctx.save();
    // Undo disc rotation so HUD is horizontal
    ctx.rotate(-this.rotation);

    const pad = 10;
    const fontSize = Math.max(12, Math.floor(this.outerRadius * 0.12));
    ctx.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textBaseline = "top";

    // Measure widest line
    let w = 0;
    for (const s of lines) w = Math.max(w, ctx.measureText(s).width);
    const lh = fontSize * 1.2;
    const h = lh * lines.length;

    const boxW = w + pad * 2;
    const boxH = h + pad * 2;

    // Place just above the record
    const x = -boxW / 2;
    const y = -(this.outerRadius + 16) - boxH;

    // Panel
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    this._roundedRect(ctx, x, y, boxW, boxH, 8);
    ctx.fill();

    // Text
    ctx.fillStyle = "#ffffff";
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
   * @param {{title?: string, artist?: string, bpm?: number, spinsPerBeat?: number}} meta
   */
  setTrackMeta({ title, artist, bpm, spinsPerBeat = 0.05 } = {}) {
    if (title != null) this.trackName = title;
    if (artist != null) this.artist = artist;
    if (bpm != null) this.setBpm(bpm, spinsPerBeat);
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
}

if (typeof window !== "undefined") {
  window.Vinyl = Vinyl;
}

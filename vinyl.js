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

    // Velocity for drifting the vinyl
    this.velocity = { x: 0, y: 0 };
    this.angularVelocity = 0; // radians per second

    // Track info
    this.trackName = "";
    this.bpm = 0;
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
   * Draws the vinyl onto a 2D rendering context.
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

    // ⬇︎ text uses the same transform (center at 0,0)
    this._drawTrackNameOnRing(ctx);

    ctx.restore();
  }

  /**
   * Draw the track name along a circular arc.
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */
  /**
   * Draw the track name along a circular arc, left-to-right and readable.
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */
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
    const fontSize = this.outerRadius * 0.12;
    ctx.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Total arc length of text in pixels
    let totalWidth = 0;
    for (const ch of text) {
      totalWidth += ctx.measureText(ch).width;
    }

    // Arc length s = r * theta => theta = s / r
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

      // Rotate so the baseline is tangent and text is left-to-right
      ctx.rotate(angle + Math.PI / 2);

      ctx.fillText(ch, 0, 0);
      ctx.restore();

      currentAngle += charAngle;
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
    this.angularVelocity = omega;
  }

  /**
   * Set BPM and derive angular velocity from it.
   * @param {number} bpm
   * @param {number} spinsPerBeat - how many full rotations per beat (default 0.25 = 1 rotation every 4 beats)
   */
  setBpm(bpm, spinsPerBeat = 0.05) {
    this.bpm = bpm;

    const beatsPerSecond = bpm / 60;
    // omega = 2π * (rotations per second)
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
   * Convenience: set both track name and bpm at once.
   * @param {string} name
   * @param {number} bpm
   * @param {number} spinsPerBeat
   */
  setTrackInfo(name, bpm, spinsPerBeat = 0.05) {
    this.setTrackName(name);
    if (bpm != null) {
      this.setBpm(bpm, spinsPerBeat);
    }
  }
}

if (typeof window !== "undefined") {
  window.Vinyl = Vinyl;
}

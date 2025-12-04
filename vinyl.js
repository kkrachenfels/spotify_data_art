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
   * Sets rotational speed.
   * @param {number} omega
   */
  setAngularVelocity(omega) {
    this.angularVelocity = omega;
  }
}

export default Vinyl;


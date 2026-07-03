import { Particle } from './Particle.js';
import { StretchConstraint, ShearConstraint, BendConstraint } from './Constraint.js';
import { Vector3 } from '../math/Vector3.js';

/**
 * Cloth - Manages a particle-based cloth mesh with triangular topology
 */
export class Cloth {
  constructor(width = 10, height = 10, segments = 10) {
    this.width = width;
    this.height = height;
    this.segments = segments;

    this.particles = [];
    this.constraints = [];
    this.triangles = [];

    // Simulation parameters
    this.gravity = new Vector3(0, -9.8, 0);
    this.damping = 0.99;

    // Wind is now a *persistent* field (set once, applied every frame in
    // update()) rather than a one-off force. Previously setWind() called
    // particle.addForce() a single time, and Particle.integrate() reset
    // acceleration to gravity every frame, so the wind's effect vanished
    // after a single frame. See Particle.integrate() for the other half
    // of this fix.
    this.windForce = new Vector3(0, 0, 0);

    // Initialize cloth mesh
    this._generateGrid();
    this._generateTriangles();
    this._generateConstraints();
  }

  /**
   * Generate grid of particles
   * Particles arranged in a 2D grid hanging from the top
   */
  _generateGrid() {
    const segmentWidth = this.width / this.segments;
    const segmentHeight = this.height / this.segments;

    // Remember original positions so reset() has something to restore to
    this.initialPositions = [];

    for (let y = 0; y <= this.segments; y++) {
      for (let x = 0; x <= this.segments; x++) {
        const px = x * segmentWidth;
        const py = this.height - (y * segmentHeight); // Hang from top (height) down to 0
        const pz = y * segmentHeight;

        const particle = new Particle(px, py, pz);
        this.particles.push(particle);
        this.initialPositions.push({ x: px, y: py, z: pz });

        // Pin top corners
        if (y === 0 && (x === 0 || x === this.segments)) {
          particle.pin();
        }
      }
    }
  }

  /**
   * Generate triangular mesh from grid
   *
   * Winding fix: given how the grid is laid out (y increases downward AND
   * away from the camera, see _generateGrid), the original winding
   * order [a,b,c] / [b,d,c] produced triangles whose face normal pointed
   * AWAY from the default camera position. With gl.enable(CULL_FACE) +
   * gl.cullFace(BACK) + WebGL's default front-face = CCW, every triangle
   * was being culled as a back face — this was the root cause of the
   * "nothing renders" / solid-black-canvas bug. Swapping the last two
   * indices of each triangle ([a,c,b] / [b,c,d]) flips the winding so the
   * computed normal faces toward the camera instead, without touching any
   * GL state (cull mode stays BACK, which is still correct and still
   * culls the cloth's rear face as expected).
   */
  _generateTriangles() {
    const cols = this.segments + 1;

    for (let y = 0; y < this.segments; y++) {
      for (let x = 0; x < this.segments; x++) {
        // Get four corners of current quad
        const a = y * cols + x;
        const b = y * cols + (x + 1);
        const c = (y + 1) * cols + x;
        const d = (y + 1) * cols + (x + 1);

        // Two triangles per quad — winding reversed vs. the original
        // (a,b,c)/(b,d,c) so normals face the camera. See comment above.
        this.triangles.push([a, c, b]);
        this.triangles.push([b, c, d]);
      }
    }
  }

  /**
   * Generate structural, shear, and bend constraints
   */
  _generateConstraints() {
    const cols = this.segments + 1;

    for (let y = 0; y <= this.segments; y++) {
      for (let x = 0; x <= this.segments; x++) {
        const idx = y * cols + x;
        const p = this.particles[idx];

        // Right neighbor (stretch)
        if (x < this.segments) {
          const right = this.particles[idx + 1];
          this.constraints.push(
            new StretchConstraint(p, right, 0.95)
          );
        }

        // Bottom neighbor (stretch)
        if (y < this.segments) {
          const bottom = this.particles[idx + cols];
          this.constraints.push(
            new StretchConstraint(p, bottom, 0.95)
          );
        }

        // Diagonal bottom-right (shear)
        if (x < this.segments && y < this.segments) {
          const diagonal = this.particles[idx + cols + 1];
          this.constraints.push(
            new ShearConstraint(p, diagonal, 0.85)
          );
        }

        // Diagonal bottom-left (shear)
        if (x > 0 && y < this.segments) {
          const diagonal = this.particles[idx + cols - 1];
          this.constraints.push(
            new ShearConstraint(p, diagonal, 0.85)
          );
        }

        // Skip one step right (bend)
        if (x + 2 <= this.segments) {
          const skip = this.particles[idx + 2];
          this.constraints.push(
            new BendConstraint(p, skip, 0.5)
          );
        }

        // Skip one step down (bend)
        if (y + 2 <= this.segments) {
          const skip = this.particles[idx + 2 * cols];
          this.constraints.push(
            new BendConstraint(p, skip, 0.5)
          );
        }
      }
    }
  }

  /**
   * Update cloth simulation
   * @param {number} deltaTime - Time step in seconds
   * @param {number} iterations - Number of constraint solving iterations
   */
  update(deltaTime, iterations = 3) {
    const windActive = this.windForce.length() > 0;

    // Step 1: accumulate forces for this frame, then integrate.
    for (const particle of this.particles) {
      particle.clearAcceleration();

      if (!particle.pinned) {
        // Gravity is an acceleration (not a force), applies uniformly
        // regardless of mass — matches real-world free-fall behavior.
        particle.acceleration.add(this.gravity);

        // Wind IS a force, so it goes through addForce() (F = m*a),
        // scaled by the particle's material-driven windResponse.
        if (windActive) {
          const scaledWind = Vector3.mul(this.windForce, particle.windResponse);
          particle.addForce(scaledWind);
        }
      }

      particle.integrate(deltaTime, this.damping);
    }

    // Step 2: Solve constraints multiple times for stability
    for (let iter = 0; iter < iterations; iter++) {
      for (const constraint of this.constraints) {
        constraint.solve();
      }
    }
  }

  /**
   * Set persistent wind force. Applied every frame in update() until
   * changed back to (0,0,0).
   */
  setWind(x, y, z) {
    this.windForce.set(x, y, z);
  }

  /**
   * Apply a uniform mass to all unpinned particles. Driven by material
   * presets (silk is light, leather is heavy) so different fabrics
   * actually carry different inertia.
   */
  setMass(mass) {
    for (const particle of this.particles) {
      if (!particle.pinned) {
        particle.mass = mass;
      }
    }
  }

  /**
   * Apply a uniform wind-response multiplier to all particles. Driven by
   * material presets (silk flutters, denim barely moves in wind).
   */
  setWindResponse(value) {
    for (const particle of this.particles) {
      particle.windResponse = value;
    }
  }

  /**
   * Reset cloth to initial state
   * Restores every particle to its original grid position/velocity,
   * regardless of pinned state (pinned flags themselves are untouched).
   */
  reset() {
    this.particles.forEach((particle, i) => {
      const initPos = this.initialPositions[i];
      particle.reset(initPos.x, initPos.y, initPos.z);
    });
  }

  /**
   * Get all particles
   */
  getParticles() {
    return this.particles;
  }

  /**
   * Get all constraints
   */
  getConstraints() {
    return this.constraints;
  }

  /**
   * Get all triangles (as indices into particles array)
   */
  getTriangles() {
    return this.triangles;
  }

  /**
   * Get constraints of specific type
   */
  getConstraintsByType(type) {
    return this.constraints.filter(c => c.type === type);
  }
}

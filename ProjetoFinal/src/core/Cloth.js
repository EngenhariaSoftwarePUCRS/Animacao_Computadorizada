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

    for (let y = 0; y <= this.segments; y++) {
      for (let x = 0; x <= this.segments; x++) {
        const px = x * segmentWidth;
        const py = this.height - (y * segmentHeight); // Hang from top (height) down to 0
        const pz = y * segmentHeight;

        const particle = new Particle(px, py, pz);
        this.particles.push(particle);

        // Pin top corners
        if (y === 0 && (x === 0 || x === this.segments)) {
          particle.pin();
        }
      }
    }
  }

  /**
   * Generate triangular mesh from grid
   */
  _generateTriangles() {
    const cols = this.segments + 1;

    for (let y = 0; y < this.segments; y++) {
      for (let x = 0; x < this.segments; x++) {
        const a = y * cols + x;
        const b = y * cols + (x + 1);
        const c = (y + 1) * cols + x;
        const d = (y + 1) * cols + (x + 1);

        // Swapped winding order to face the camera
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
    // Step 1: Integrate particles using Verlet
    for (const particle of this.particles) {
      particle.integrate(deltaTime, this.gravity, this.damping);
    }

    // Step 2: Solve constraints multiple times for stability
    for (let iter = 0; iter < iterations; iter++) {
      for (const constraint of this.constraints) {
        constraint.solve();
      }
    }
  }

  /**
   * Apply external wind force
   */
  setWind(x, y, z) {
    this.windForce.set(x, y, z);
    for (const particle of this.particles) {
      if (!particle.pinned) {
        particle.addForce(this.windForce);
      }
    }
  }

  /**
   * Reset cloth to initial state
   */
  reset() {
    for (const particle of this.particles) {
      // Re-initialize grid position
    }
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

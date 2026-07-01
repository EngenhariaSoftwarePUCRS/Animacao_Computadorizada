import { Vector3 } from '../math/Vector3.js';

/**
 * Constraint base class
 * Represents a constraint between two particles
 */
export class Constraint {
  constructor(p1, p2, stiffness = 0.95, damping = 0.01) {
    this.p1 = p1;
    this.p2 = p2;
    this.stiffness = stiffness; // Resistance to deformation (0-1)
    this.damping = damping;
    this.restLength = Vector3.distance(p1.position, p2.position);
    this.currentForce = 0; // Magnitude of current constraint force
    this.type = 'base'; // 'stretch', 'shear', 'bend'
  }

  /**
   * Solve the constraint using Hooke's law
   * F = -k * x, where x is displacement from rest length
   */
  solve() {
    const delta = Vector3.sub(this.p2.position, this.p1.position);
    const distance = Vector3.length(delta);

    if (distance === 0) return;

    const difference = distance - this.restLength;
    const correction = Vector3.normalize(delta);
    correction.mul((difference / 2) * this.stiffness);

    if (!this.p1.pinned) {
      this.p1.position.add(correction);
    }

    if (!this.p2.pinned) {
      const negCorr = Vector3.mul(correction, -1);
      this.p2.position.add(negCorr);
    }

    // Store current force magnitude
    this.currentForce = Math.abs(difference) * this.stiffness;
  }

  /**
   * Get current constraint force vector
   * @returns {Vector3}
   */
  getForceVector() {
    const delta = Vector3.sub(this.p2.position, this.p1.position);
    const distance = Vector3.length(delta);

    if (distance === 0) return new Vector3(0, 0, 0);

    const difference = distance - this.restLength;
    const forceDir = Vector3.normalize(delta);
    forceDir.mul(difference * this.stiffness);

    return forceDir;
  }
}

/**
 * Stretch constraint - prevents elongation between adjacent particles
 */
export class StretchConstraint extends Constraint {
  constructor(p1, p2, stiffness = 0.95) {
    super(p1, p2, stiffness, 0.01);
    this.type = 'stretch';
  }
}

/**
 * Shear constraint - prevents diagonal deformation within triangles
 */
export class ShearConstraint extends Constraint {
  constructor(p1, p2, stiffness = 0.85) {
    super(p1, p2, stiffness, 0.01);
    this.type = 'shear';
  }
}

/**
 * Bend constraint - prevents folding between adjacent triangles
 */
export class BendConstraint extends Constraint {
  constructor(p1, p2, stiffness = 0.5) {
    super(p1, p2, stiffness, 0.01);
    this.type = 'bend';
  }
}

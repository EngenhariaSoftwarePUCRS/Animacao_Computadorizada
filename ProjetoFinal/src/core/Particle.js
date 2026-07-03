import { Vector3 } from '../math/Vector3.js';

/**
 * Particle - Represents a single cloth particle
 * Stores position, velocity, acceleration, and mass
 */
export class Particle {
  constructor(x, y, z, mass = 1.0) {
    this.position = new Vector3(x, y, z);
    this.oldPosition = new Vector3(x, y, z);
    this.velocity = new Vector3(0, 0, 0);
    this.acceleration = new Vector3(0, 0, 0);
    this.mass = mass;
    this.pinned = false;
    this.id = Particle.nextId++;

    // How strongly this particle responds to wind force. Driven by
    // material presets (SimulationCore) — e.g. silk flutters more than leather.
    this.windResponse = 1.0;
  }

  static nextId = 0;

  /**
   * Zero out accumulated acceleration. Must be called once per frame
   * (by Cloth.update) BEFORE gravity/wind/other forces are added, and
   * BEFORE integrate() is called.
   */
  clearAcceleration() {
    this.acceleration.set(0, 0, 0);
  }

  /**
   * Apply Verlet integration: x(t+dt) = 2*x(t) - x(t-dt) + a*dt^2
   *
   * NOTE: this no longer takes `gravity` as a parameter. Whatever forces
   * apply to this particle this frame (gravity, wind, ...) must already be
   * summed into `this.acceleration` via addForce()/direct accumulation
   * before integrate() runs. Previously this method did
   * `this.acceleration.copy(gravity)`, which silently threw away any
   * addForce() calls (e.g. wind) that happened earlier in the frame.
   *
   * @param {number} deltaTime - Time step
   * @param {number} damping - Damping factor (0-1), reduces velocity
   */
  integrate(deltaTime, damping = 0.99) {
    if (this.pinned) return;

    // Verlet step: new velocity is computed implicitly
    // v(t+dt) = (x(t+dt) - x(t-dt)) / (2*dt)
    const vel = Vector3.sub(this.position, this.oldPosition);
    vel.mul(damping); // Apply damping

    // Store old position for next iteration
    const tempOld = this.oldPosition.clone();
    this.oldPosition.copy(this.position);

    // x(t+dt) = x(t) + v(t+dt) + a*dt^2
    const accelTerm = Vector3.mul(this.acceleration, deltaTime * deltaTime);
    this.position.add(vel);
    this.position.add(accelTerm);

    // Update velocity for reference
    const newVel = Vector3.sub(this.position, tempOld);
    newVel.mul(1 / (2 * deltaTime));
    this.velocity.copy(newVel);
  }

  /**
   * Pin or unpin this particle (prevent movement)
   */
  pin() {
    this.pinned = true;
  }

  unpin() {
    this.pinned = false;
  }

  /**
   * Reset to initial state
   */
  reset(x, y, z) {
    this.position.set(x, y, z);
    this.oldPosition.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.acceleration.set(0, 0, 0);
  }

  /**
   * Add a force to this particle for the current frame.
   * Converts force -> acceleration via F = m*a, so heavier particles
   * (denim, leather) respond less than light ones (silk) to the same force.
   * @param {Vector3} force
   */
  addForce(force) {
    const forceAccel = Vector3.mul(force, 1 / this.mass);
    this.acceleration.add(forceAccel);
  }

  toString() {
    return `Particle(id=${this.id}, pos=${this.position.toString()}, pinned=${this.pinned})`;
  }
}

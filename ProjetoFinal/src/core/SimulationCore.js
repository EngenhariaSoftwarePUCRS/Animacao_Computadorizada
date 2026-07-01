import { Cloth } from './Cloth.js';
import { Vector3 } from '../math/Vector3.js';

/**
 * SimulationCore - Main simulation engine
 * Manages the cloth simulation state and update loop
 */
export class SimulationCore {
  constructor(options = {}) {
    this.cloth = new Cloth(
      options.clothWidth ?? 10,
      options.clothHeight ?? 10,
      options.segments ?? 10
    );

    // Simulation parameters
    this.deltaTime = options.deltaTime ?? 0.016; // ~60fps
    this.constraintIterations = options.constraintIterations ?? 3;
    this.gravity = options.gravity ?? new Vector3(0, -9.8, 0);
    this.damping = options.damping ?? 0.99;

    // State
    this.running = false;
    this.frameCount = 0;
    this.totalTime = 0;

    // Material presets
    this.materialPresets = this._initializeMaterialPresets();
  }

  /**
   * Initialize material parameter presets
   */
  _initializeMaterialPresets() {
    return {
      silk: {
        stretchStiffness: 0.9,
        shearStiffness: 0.7,
        bendStiffness: 0.3,
        damping: 0.98,
        mass: 0.5,
      },
      cotton: {
        stretchStiffness: 0.92,
        shearStiffness: 0.8,
        bendStiffness: 0.5,
        damping: 0.97,
        mass: 0.7,
      },
      denim: {
        stretchStiffness: 0.95,
        shearStiffness: 0.85,
        bendStiffness: 0.6,
        damping: 0.96,
        mass: 0.9,
      },
      leather: {
        stretchStiffness: 0.96,
        shearStiffness: 0.88,
        bendStiffness: 0.7,
        damping: 0.95,
        mass: 1.0,
      },
      elastic: {
        stretchStiffness: 0.85,
        shearStiffness: 0.75,
        bendStiffness: 0.4,
        damping: 0.98,
        mass: 0.4,
      },
    };
  }

  /**
   * Apply material preset
   */
  setMaterialPreset(presetName) {
    const preset = this.materialPresets[presetName.toLowerCase()];
    if (!preset) {
      console.warn(`Material preset "${presetName}" not found`);
      return;
    }

    this.applyMaterialParameters(preset);
  }

  /**
   * Apply material parameters to constraints
   */
  applyMaterialParameters(params) {
    // Update stretch constraints
    this.cloth.getConstraintsByType('stretch').forEach(c => {
      c.stiffness = params.stretchStiffness ?? 0.92;
    });

    // Update shear constraints
    this.cloth.getConstraintsByType('shear').forEach(c => {
      c.stiffness = params.shearStiffness ?? 0.8;
    });

    // Update bend constraints
    this.cloth.getConstraintsByType('bend').forEach(c => {
      c.stiffness = params.bendStiffness ?? 0.5;
    });

    // Update cloth-level parameters
    this.damping = params.damping ?? 0.97;
    this.cloth.damping = this.damping;
  }

  /**
   * Start simulation
   */
  start() {
    this.running = true;
  }

  /**
   * Stop simulation
   */
  stop() {
    this.running = false;
  }

  /**
   * Reset simulation
   */
  reset() {
    this.cloth.reset();
    this.frameCount = 0;
    this.totalTime = 0;
  }

  /**
   * Single simulation step
   */
  step() {
    if (!this.running) return;

    this.cloth.update(this.deltaTime, this.constraintIterations);
    this.totalTime += this.deltaTime;
    this.frameCount++;
  }

  /**
   * Run multiple steps
   */
  runSteps(count) {
    for (let i = 0; i < count; i++) {
      this.step();
    }
  }

  /**
   * Set wind force
   */
  setWind(x, y, z) {
    this.cloth.setWind(x, y, z);
  }

  /**
   * Set gravity
   */
  setGravity(x, y, z) {
    this.gravity.set(x, y, z);
    this.cloth.gravity.copy(this.gravity);
  }

  /**
   * Pin/unpin a particle
   */
  pinParticle(index) {
    if (this.cloth.particles[index]) {
      this.cloth.particles[index].pin();
    }
  }

  unpinParticle(index) {
    if (this.cloth.particles[index]) {
      this.cloth.particles[index].unpin();
    }
  }

  /**
   * Get simulation state
   */
  getState() {
    return {
      running: this.running,
      frameCount: this.frameCount,
      totalTime: this.totalTime,
      particleCount: this.cloth.particles.length,
      constraintCount: this.cloth.constraints.length,
      gravity: this.gravity.clone(),
      damping: this.damping,
    };
  }

  /**
   * Get force information for a constraint
   */
  getConstraintForce(constraintIndex) {
    const constraint = this.cloth.constraints[constraintIndex];
    if (!constraint) return null;

    return {
      magnitude: constraint.currentForce,
      vector: constraint.getForceVector(),
      type: constraint.type,
    };
  }

  /**
   * Get forces on specific particles
   */
  getForcesOnParticles(particleIndices) {
    const forces = {};

    particleIndices.forEach(pIdx => {
      forces[pIdx] = {
        stretch: new Vector3(0, 0, 0),
        shear: new Vector3(0, 0, 0),
        bend: new Vector3(0, 0, 0),
      };

      // Sum forces from all constraints involving this particle
      this.cloth.constraints.forEach(constraint => {
        if (constraint.p1.id === this.cloth.particles[pIdx].id ||
            constraint.p2.id === this.cloth.particles[pIdx].id) {
          const forceVec = constraint.getForceVector();
          forces[pIdx][constraint.type].add(forceVec);
        }
      });
    });

    return forces;
  }
}

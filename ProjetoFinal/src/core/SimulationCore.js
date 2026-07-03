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

    // Apply the default preset's mass/windResponse immediately so the
    // cloth isn't left with Particle's hardcoded defaults (mass=1,
    // windResponse=1) before the user ever touches a preset button.
    this.applyMaterialParameters(this.materialPresets.cotton);
  }

  /**
   * Initialize material parameter presets
   *
   * windResponse: relative multiplier on how strongly the wind force
   * (Cloth.windForce) affects each particle. >1 = flutters more,
   * <1 = resists wind. Mirrors the intuitive fabric weight/stiffness:
   * silk billows, leather barely moves.
   */
  _initializeMaterialPresets() {
    return {
      silk: {
        stretchStiffness: 0.9,
        shearStiffness: 0.7,
        bendStiffness: 0.3,
        damping: 0.98,
        mass: 0.5,
        windResponse: 1.4,
      },
      cotton: {
        stretchStiffness: 0.92,
        shearStiffness: 0.8,
        bendStiffness: 0.5,
        damping: 0.97,
        mass: 0.7,
        windResponse: 1.0,
      },
      denim: {
        stretchStiffness: 0.95,
        shearStiffness: 0.85,
        bendStiffness: 0.6,
        damping: 0.96,
        mass: 0.9,
        windResponse: 0.6,
      },
      leather: {
        stretchStiffness: 0.96,
        shearStiffness: 0.88,
        bendStiffness: 0.7,
        damping: 0.95,
        mass: 1.0,
        windResponse: 0.4,
      },
      elastic: {
        stretchStiffness: 0.85,
        shearStiffness: 0.75,
        bendStiffness: 0.4,
        damping: 0.98,
        mass: 0.4,
        windResponse: 1.2,
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
   * Apply material parameters to constraints, and to particle mass /
   * wind response. `mass` and `windResponse` are optional so this can
   * still be called with just slider values (stretch/shear/bend/damping)
   * without wiping out whatever mass/windResponse a preset last set.
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

    // Mass and wind response were previously defined in preset data but
    // never read anywhere — silk and leather had identical inertia.
    if (params.mass !== undefined) {
      this.cloth.setMass(params.mass);
    }
    if (params.windResponse !== undefined) {
      this.cloth.setWindResponse(params.windResponse);
    }
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
   * Note: intentionally NOT gated on `this.running` — Step must work
   * whether the sim is playing or paused. The animation loop (in
   * TecimulatorApp) is what decides whether step() gets called every frame.
   */
  step() {
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
   * Set wind force (persistent — applied every frame until changed)
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
   * Get forces on specific particles, decomposed by constraint type.
   * Used by Focus Mode to render separate stretch/shear/bend vectors.
   * @param {number[]} particleIndices
   * @returns {Object} map of particle index -> { stretch, shear, bend } Vector3 sums
   */
  getForcesOnParticles(particleIndices) {
    const forces = {};

    particleIndices.forEach(pIdx => {
      forces[pIdx] = {
        stretch: new Vector3(0, 0, 0),
        shear: new Vector3(0, 0, 0),
        bend: new Vector3(0, 0, 0),
      };
    });

    const targetIds = new Set(
      particleIndices.map(pIdx => this.cloth.particles[pIdx].id)
    );
    const idToIndex = new Map(
      particleIndices.map(pIdx => [this.cloth.particles[pIdx].id, pIdx])
    );

    // Single pass over constraints (rather than one pass per particle)
    // so this stays cheap even as particleIndices grows.
    this.cloth.constraints.forEach(constraint => {
      const forceVec = constraint.getForceVector();

      if (targetIds.has(constraint.p1.id)) {
        const pIdx = idToIndex.get(constraint.p1.id);
        // Force on p1 points along -delta (delta = p2 - p1), i.e. opposite
        // of getForceVector()'s convention which is oriented p1->p2.
        forces[pIdx][constraint.type].add(Vector3.mul(forceVec, -1));
      }
      if (targetIds.has(constraint.p2.id)) {
        const pIdx = idToIndex.get(constraint.p2.id);
        forces[pIdx][constraint.type].add(forceVec);
      }
    });

    return forces;
  }
}

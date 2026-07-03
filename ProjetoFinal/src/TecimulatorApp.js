import { SimulationCore } from './core/SimulationCore.js';
import { WebGLRenderer } from './rendering/WebGLRenderer.js';
import { Vector3 } from './math/Vector3.js';

const MAX_FOCUS_SELECTION = 7;
const MIN_FOCUS_SELECTION = 3;
const CLICK_MOVE_THRESHOLD_PX = 4; // below this, mouseup counts as a click, not a drag

/**
 * TecimulatorApp - Main application controller
 * Orchestrates simulation, rendering, and UI
 */
export class TecimulatorApp {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas with id "${canvasId}" not found`);
    }

    // Initialize core systems
    this.simulation = new SimulationCore({
      clothWidth: 10,
      clothHeight: 10,
      segments: 15,
      deltaTime: 0.016, // 60 FPS
      constraintIterations: 3,
    });

    this.renderer = new WebGLRenderer(this.canvas);

    // State
    this.animationId = null;
    this.isPlaying = false;

    // Selection / Focus Mode
    this.selectedParticles = [];
    this.focusModeEnabled = false;

    // Drag-interaction state (moving a particle in 3D)
    this.draggedParticle = null;
    this.dragOriginalPinned = false;
    this.dragPlaneNormal = null;
    this.dragPlanePoint = null;
    this.pickRadiusPx = 25; // how close (in canvas pixels) the mouse must be to grab/select a particle

    // Left-button pointer state, used to distinguish a click (select)
    // from a drag (move particle) — see _onCanvasMouseDown.
    this._pointerDownParticle = null;
    this._pointerDownPos = null;
    this._pointerMoved = false;

    // Right-button orbit state
    this._orbiting = false;
    this._lastOrbitPos = null;

    // Middle-button pan state
    this._panning = false;
    this._lastPanPos = null;

    // Material presets mirrored here so the UI (sliders/labels) can sync
    // without reaching into SimulationCore internals.
    // NOTE: keep in lockstep with SimulationCore._initializeMaterialPresets().
    this.materialPresets = {
      silk:    { stretchStiffness: 0.90, shearStiffness: 0.70, bendStiffness: 0.30, damping: 0.98, mass: 0.5, windResponse: 1.4 },
      cotton:  { stretchStiffness: 0.92, shearStiffness: 0.80, bendStiffness: 0.50, damping: 0.97, mass: 0.7, windResponse: 1.0 },
      denim:   { stretchStiffness: 0.95, shearStiffness: 0.85, bendStiffness: 0.60, damping: 0.96, mass: 0.9, windResponse: 0.6 },
      leather: { stretchStiffness: 0.96, shearStiffness: 0.88, bendStiffness: 0.70, damping: 0.95, mass: 1.0, windResponse: 0.4 },
      elastic: { stretchStiffness: 0.85, shearStiffness: 0.75, bendStiffness: 0.40, damping: 0.98, mass: 0.4, windResponse: 1.2 },
    };

    // Tracks the live parameter values shown in the slider UI.
    // Starts matching the default slider values in index.html (cotton-like).
    this.currentParams = {
      stretchStiffness: 0.92,
      shearStiffness: 0.80,
      bendStiffness: 0.50,
      damping: 0.97,
    };

    // Handle canvas resize
    window.addEventListener('resize', () => this._resizeCanvas());
  }

  /**
   * Initialize UI event listeners
   */
  setupUI() {
    // Simulation controls
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resetBtn = document.getElementById('reset-btn');
    const stepBtn = document.getElementById('step-btn');

    if (playBtn) playBtn.addEventListener('click', () => this.play());
    if (pauseBtn) pauseBtn.addEventListener('click', () => this.pause());
    if (resetBtn) resetBtn.addEventListener('click', () => this.reset());
    if (stepBtn) stepBtn.addEventListener('click', () => this.step());

    // Material presets
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setMaterialPreset(e.target.dataset.preset);
      });
    });

    // Render mode buttons
    document.querySelectorAll('[data-render-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setRenderMode(e.target.dataset.renderMode);
      });
    });

    // Focus mode toggle + clear selection
    const focusToggle = document.getElementById('focus-mode-toggle');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');
    if (focusToggle) focusToggle.addEventListener('click', () => this.toggleFocusMode());
    if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', () => this.clearSelection());

    // Parameter sliders
    this._setupParameterSliders();

    // Canvas interaction
    this.canvas.addEventListener('mousedown', (e) => this._onCanvasMouseDown(e));
    window.addEventListener('mousemove', (e) => this._onWindowMouseMove(e));
    window.addEventListener('mouseup', () => this._onWindowMouseUp());
    this.canvas.addEventListener('wheel', (e) => this._onCanvasWheel(e), { passive: false });
    // Right-drag orbits the camera, so suppress the browser's context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this._updateFocusUI();
  }

  /**
   * Setup parameter sliders
   * Reads/writes this.currentParams so slider edits and preset
   * selections never fight over stale values.
   */
  _setupParameterSliders() {
    const sliders = document.querySelectorAll('[data-param]');
    sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        const param = e.target.dataset.param;
        const value = parseFloat(e.target.value);

        this.currentParams[param] = value;
        this.simulation.applyMaterialParameters(this.currentParams);

        const valueLabel = e.target.parentElement.querySelector('.value');
        if (valueLabel) valueLabel.textContent = value.toFixed(2);
      });
    });
  }

  /**
   * Push this.currentParams into the slider inputs + their value labels.
   * Called after a preset is applied so the UI reflects what's running.
   */
  _syncSlidersToParams() {
    const sliders = document.querySelectorAll('[data-param]');
    sliders.forEach(slider => {
      const param = slider.dataset.param;
      if (!(param in this.currentParams)) return;

      const value = this.currentParams[param];
      slider.value = value;

      const valueLabel = slider.parentElement.querySelector('.value');
      if (valueLabel) valueLabel.textContent = value.toFixed(2);
    });
  }

  /**
   * Start animation loop
   */
  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.simulation.start();
    this._animate();
  }

  /**
   * Pause animation
   */
  pause() {
    this.isPlaying = false;
    this.simulation.stop();
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  /**
   * Single step
   */
  step() {
    this.simulation.step();
    this._renderFrame();
    this._updateUI();
  }

  /**
   * Reset simulation
   */
  reset() {
    this.pause();
    this.simulation.reset();
    this.clearSelection();
    this._renderFrame();
    this._updateUI();
  }

  /**
   * Set material preset
   * Updates the simulation AND syncs the slider UI so displayed values
   * match what's actually running.
   */
  setMaterialPreset(name) {
    const preset = this.materialPresets[name.toLowerCase()];
    if (!preset) {
      console.warn(`Unknown preset: ${name}`);
      return;
    }

    this.simulation.setMaterialPreset(name);
    this.currentParams = {
      stretchStiffness: preset.stretchStiffness,
      shearStiffness: preset.shearStiffness,
      bendStiffness: preset.bendStiffness,
      damping: preset.damping,
    };
    this._syncSlidersToParams();

    // Preset buttons get a visual "active" state
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === name);
    });
  }

  /**
   * Set the WebGL render mode ('cloth' | 'wireframe' | 'particles') and
   * sync the button active-states.
   */
  setRenderMode(mode) {
    this.renderer.setRenderMode(mode);
    document.querySelectorAll('[data-render-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.renderMode === mode);
    });
    if (!this.isPlaying) this._renderFrame();
  }

  // -------------------------------------------------------------------
  // Selection / Focus Mode
  // -------------------------------------------------------------------

  /**
   * Toggle a particle's selection state (click without drag).
   * Selection is capped at MAX_FOCUS_SELECTION; clicking a 8th particle
   * is a no-op until one is deselected.
   */
  _toggleParticleSelection(index) {
    const pos = this.selectedParticles.indexOf(index);
    if (pos !== -1) {
      this.selectedParticles.splice(pos, 1);
    } else {
      if (this.selectedParticles.length >= MAX_FOCUS_SELECTION) {
        console.warn(`Selection capped at ${MAX_FOCUS_SELECTION} particles`);
        return;
      }
      this.selectedParticles.push(index);
    }

    this.renderer.setFocusParticles(this.selectedParticles);
    if (this.focusModeEnabled) this._updateFocusCamera();
    this._updateFocusUI();
    if (!this.isPlaying) this._renderFrame();
  }

  clearSelection() {
    this.selectedParticles = [];
    this.renderer.setFocusParticles([]);
    if (this.focusModeEnabled) this._updateFocusCamera();
    this._updateFocusUI();
    if (!this.isPlaying) this._renderFrame();
  }

  /**
   * Enable/disable Focus Mode. Requires 3-7 selected particles to
   * actually engage the camera zoom + force vectors; otherwise it just
   * arms the toggle so the next selections take effect once the count
   * is in range.
   */
  toggleFocusMode() {
    this.focusModeEnabled = !this.focusModeEnabled;
    this._updateFocusCamera();
    this._updateFocusUI();
    if (!this.isPlaying) this._renderFrame();
  }

  _updateFocusCamera() {
    const inRange =
      this.selectedParticles.length >= MIN_FOCUS_SELECTION &&
      this.selectedParticles.length <= MAX_FOCUS_SELECTION;

    if (this.focusModeEnabled && inRange) {
      const positions = this.selectedParticles.map(
        i => this.simulation.cloth.particles[i].position
      );
      this.renderer.focusOnPositions(positions);
    } else {
      this.renderer.focusOnPositions([]);
    }
  }

  _updateFocusUI() {
    const toggle = document.getElementById('focus-mode-toggle');
    const info = document.getElementById('focus-mode-info');
    if (toggle) {
      toggle.classList.toggle('active', this.focusModeEnabled);
      toggle.textContent = this.focusModeEnabled ? 'Focus Mode: On' : 'Focus Mode: Off';
    }
    if (info) {
      const n = this.selectedParticles.length;
      if (n === 0) {
        info.textContent = `Click particles to select (${MIN_FOCUS_SELECTION}-${MAX_FOCUS_SELECTION} needed for Focus Mode)`;
      } else if (n < MIN_FOCUS_SELECTION) {
        info.textContent = `${n} selected — select at least ${MIN_FOCUS_SELECTION} for Focus Mode`;
      } else {
        info.textContent = `${n} particle${n === 1 ? '' : 's'} selected`;
      }
    }
  }

  /**
   * Animation loop
   */
  _animate() {
    if (!this.isPlaying) return;

    this.simulation.step();
    this._renderFrame();
    this._updateUI();

    this.animationId = requestAnimationFrame(() => this._animate());
  }

  /**
   * Render one frame, computing decomposed forces for the current
   * selection whenever Focus Mode is active so the renderer can draw
   * color-coded stretch/shear/bend vectors.
   */
  _renderFrame() {
    let focusForces = null;
    if (this.focusModeEnabled && this.selectedParticles.length > 0) {
      focusForces = this.simulation.getForcesOnParticles(this.selectedParticles);
    }
    this.renderer.render(this.simulation.cloth, focusForces);
  }

  /**
   * Update UI display
   */
  _updateUI() {
    const state = this.simulation.getState();
    const stateDisplay = document.getElementById('state-display');

    if (stateDisplay) {
      stateDisplay.innerHTML = `
        <div>Frame: ${state.frameCount}</div>
        <div>Time: ${state.totalTime.toFixed(2)}s</div>
        <div>Particles: ${state.particleCount}</div>
        <div>Constraints: ${state.constraintCount}</div>
      `;
    }
  }

  /**
   * Convert a mouse event's client coordinates to canvas pixel coordinates,
   * accounting for the canvas being CSS-scaled to fill its container while
   * having a fixed internal resolution (width/height attributes).
   */
  _getCanvasMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  /**
   * Find the particle whose projected screen position is closest to the
   * given canvas pixel coordinates, within this.pickRadiusPx.
   */
  _findNearestParticle(mouseX, mouseY) {
    const particles = this.simulation.cloth.getParticles();
    let closest = null;
    let closestDist = this.pickRadiusPx;

    particles.forEach((particle, index) => {
      const screenPos = this.renderer.worldToScreen(particle.position);
      if (!screenPos) return; // behind camera

      const dx = screenPos.x - mouseX;
      const dy = screenPos.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < closestDist) {
        closestDist = dist;
        closest = { particle, index };
      }
    });

    return closest;
  }

  /**
   * Mouse down: dispatches to particle-interaction, orbit, or pan based
   * on which button was pressed.
   *  - Left (0): candidate for click-to-select OR drag-to-move, resolved
   *    on mouseup / first sufficient mousemove (see _onWindowMouseMove).
   *  - Middle (1): begin camera pan.
   *  - Right (2): begin camera orbit.
   */
  _onCanvasMouseDown(e) {
    const { x, y } = this._getCanvasMousePos(e);

    if (e.button === 2) {
      e.preventDefault();
      this._orbiting = true;
      this._lastOrbitPos = { x: e.clientX, y: e.clientY };
      return;
    }

    if (e.button === 1) {
      e.preventDefault();
      this._panning = true;
      this._lastPanPos = { x: e.clientX, y: e.clientY };
      return;
    }

    if (e.button !== 0) return;

    const found = this._findNearestParticle(x, y);
    this._pointerDownParticle = found;
    this._pointerDownPos = { x: e.clientX, y: e.clientY };
    this._pointerMoved = false;
  }

  _onWindowMouseMove(e) {
    if (this._orbiting) {
      const dx = e.clientX - this._lastOrbitPos.x;
      const dy = e.clientY - this._lastOrbitPos.y;
      this._lastOrbitPos = { x: e.clientX, y: e.clientY };
      this.renderer.orbit(dx, dy);
      if (!this.isPlaying) this._renderFrame();
      return;
    }

    if (this._panning) {
      const dx = e.clientX - this._lastPanPos.x;
      const dy = e.clientY - this._lastPanPos.y;
      this._lastPanPos = { x: e.clientX, y: e.clientY };
      this.renderer.pan(dx, dy);
      if (!this.isPlaying) this._renderFrame();
      return;
    }

    if (this.draggedParticle) {
      this._dragActiveParticle(e);
      return;
    }

    if (this._pointerDownParticle && this._pointerDownPos) {
      const dx = e.clientX - this._pointerDownPos.x;
      const dy = e.clientY - this._pointerDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_MOVE_THRESHOLD_PX) {
        this._pointerMoved = true;
        this._beginParticleDrag(this._pointerDownParticle);
      }
    }
  }

  /**
   * Promote the pending left-button candidate into an actual drag: pin
   * the particle and set up the drag plane, matching the previous
   * always-drag behavior — but now only once real movement is detected.
   */
  _beginParticleDrag(found) {
    this.draggedParticle = found.particle;
    this.dragOriginalPinned = found.particle.pinned;
    this.draggedParticle.pinned = true;

    const { forward } = this.renderer._getCameraBasis();
    this.dragPlaneNormal = forward;
    this.dragPlanePoint = this.draggedParticle.position.clone();
  }

  /**
   * While dragging, move the grabbed particle to wherever the mouse ray
   * intersects the drag plane. Forces a render even while paused, so
   * dragging remains responsive with the simulation stopped.
   */
  _dragActiveParticle(e) {
    const { x, y } = this._getCanvasMousePos(e);
    const ray = this.renderer.screenToRay(x, y);

    const denom = Vector3.dot(this.dragPlaneNormal, ray.direction);
    if (Math.abs(denom) < 1e-6) return; // ray parallel to drag plane, ignore

    const toPlane = Vector3.sub(this.dragPlanePoint, ray.origin);
    const t = Vector3.dot(this.dragPlaneNormal, toPlane) / denom;
    if (t < 0) return; // intersection is behind the camera

    const worldPos = Vector3.add(ray.origin, Vector3.mul(ray.direction, t));

    // Set both position and oldPosition to avoid a velocity spike from
    // Verlet integration once the particle is unpinned again
    this.draggedParticle.position.set(worldPos.x, worldPos.y, worldPos.z);
    this.draggedParticle.oldPosition.set(worldPos.x, worldPos.y, worldPos.z);

    this._renderFrame();
    this._updateUI();
  }

  /**
   * Resolve whatever interaction was in progress:
   *  - Orbiting/panning just stop.
   *  - An active particle drag releases the particle (restoring its
   *    original pinned state).
   *  - A left-button press that never exceeded the movement threshold is
   *    a click: toggle that particle's selection.
   */
  _onWindowMouseUp() {
    if (this._orbiting) {
      this._orbiting = false;
      this._lastOrbitPos = null;
    }

    if (this._panning) {
      this._panning = false;
      this._lastPanPos = null;
    }

    if (this.draggedParticle) {
      this.draggedParticle.pinned = this.dragOriginalPinned;
      this.draggedParticle = null;
      this.dragPlaneNormal = null;
      this.dragPlanePoint = null;
    } else if (this._pointerDownParticle && !this._pointerMoved) {
      this._toggleParticleSelection(this._pointerDownParticle.index);
    }

    this._pointerDownParticle = null;
    this._pointerDownPos = null;
    this._pointerMoved = false;
  }

  _onCanvasWheel(e) {
    e.preventDefault();
    this.renderer.zoom(e.deltaY);
    if (!this.isPlaying) this._renderFrame();
  }

  /**
   * Resize canvas to fit window
   */
  _resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;

    // Update renderer viewport
    this.renderer.width = this.canvas.width;
    this.renderer.height = this.canvas.height;
    this.renderer.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (!this.isPlaying) this._renderFrame();
  }
}

// Initialize app on load
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.app = new TecimulatorApp('canvas');
    window.app.setupUI();
    window.app._renderFrame();
  } catch (error) {
    console.error('Failed to initialize Tecimulator:', error);
    const canvas = document.getElementById('canvas');
    if (canvas) {
      canvas.parentElement.innerHTML = '<div style="color: red; padding: 20px;">Error: ' + error.message + '</div>';
    }
  }
});

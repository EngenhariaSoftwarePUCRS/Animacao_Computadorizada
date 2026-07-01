import { SimulationCore } from './core/SimulationCore.js';
import { WebGLRenderer } from './rendering/WebGLRenderer.js';

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

    console.log('Initializing TecimulatorApp...');
    console.log('Canvas element:', this.canvas);
    console.log('Canvas size:', this.canvas.width, 'x', this.canvas.height);

    // Initialize core systems
    try {
      this.simulation = new SimulationCore({
        clothWidth: 10,
        clothHeight: 10,
        segments: 15,
        deltaTime: 0.016, // 60 FPS
        constraintIterations: 3,
      });

      this.renderer = new WebGLRenderer(this.canvas);
      console.log('Simulation and renderer initialized successfully');
    } catch (error) {
      console.error('Failed to initialize simulation or renderer:', error);
      throw error;
    }

    // State
    this.animationId = null;
    this.isPlaying = false;
    this.selectedParticles = [];

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
    const presetButtons = document.querySelectorAll('[data-preset]');
    presetButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = e.target.dataset.preset;
        this.setMaterialPreset(preset);
      });
    });

    // Parameter sliders
    this._setupParameterSliders();

    // Canvas interaction
    this.canvas.addEventListener('click', (e) => this._onCanvasClick(e));
  }

  /**
   * Setup parameter sliders
   */
  _setupParameterSliders() {
    const sliders = document.querySelectorAll('[data-param]');
    sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        const param = e.target.dataset.param;
        const value = parseFloat(e.target.value);
        // TODO: Update simulation parameter
      });
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
    this.renderer.render(this.simulation.cloth);
    this._updateUI();
  }

  /**
   * Reset simulation
   */
  reset() {
    this.pause();
    this.simulation.reset();
    this.selectedParticles = [];
    this.renderer.render(this.simulation.cloth);
    this._updateUI();
  }

  /**
   * Set material preset
   */
  setMaterialPreset(name) {
    this.simulation.setMaterialPreset(name);
    console.log(`Applied material preset: ${name}`);
  }

  /**
   * Animation loop
   */
  _animate() {
    if (!this.isPlaying) return;

    this.simulation.step();
    this.renderer.render(this.simulation.cloth);
    this._updateUI();

    this.animationId = requestAnimationFrame(() => this._animate());
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
   * Handle canvas click for particle selection
   */
  _onCanvasClick(event) {
    // TODO: Implement picking/selection
    // For now, just show a message
    console.log('Canvas clicked at', event.clientX, event.clientY);
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
  }
}

// Initialize app on load
window.addEventListener('DOMContentLoaded', () => {
  try {
    console.log('DOM Content Loaded - Initializing Tecimulator');
    window.app = new TecimulatorApp('canvas');
    window.app.setupUI();
    
    // Initial render
    console.log('Rendering initial frame...');
    window.app.renderer.render(window.app.simulation.cloth);
    console.log('Tecimulator ready! Click Play to start simulation.');
  } catch (error) {
    console.error('Failed to initialize Tecimulator:', error);
    console.error('Stack trace:', error.stack);
    const canvas = document.getElementById('canvas');
    if (canvas) {
      canvas.parentElement.innerHTML = '<div style="color: red; padding: 20px;">Error: ' + error.message + '</div>';
    }
  }
});

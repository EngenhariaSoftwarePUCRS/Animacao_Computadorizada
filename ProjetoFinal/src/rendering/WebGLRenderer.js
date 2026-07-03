import { Vector3 } from '../math/Vector3.js';

// Force-vector colors, color-coded by constraint type (Focus Mode).
const FORCE_COLORS = {
  stretch: [0.95, 0.35, 0.25], // red-orange
  shear: [0.95, 0.85, 0.2],    // yellow
  bend: [0.3, 0.75, 0.95],     // cyan-blue
};

const FORCE_VECTOR_SCALE = 0.6; // world-units per unit of force magnitude, tuned for visibility

/**
 * WebGLRenderer - Manages WebGL rendering of cloth and forces
 */
export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2');

    if (!this.gl) {
      throw new Error('WebGL2 not supported');
    }

    this.width = canvas.width;
    this.height = canvas.height;

    // --- Camera ---
    // Orbit camera: cameraPos is derived every frame from
    // (cameraTarget + spherical offset), so orbit/pan/zoom never fight
    // each other or drift out of sync.
    this.cameraTarget = new Vector3(5, 0, 5);
    this.cameraUp = new Vector3(0, 1, 0);
    this.orbitYaw = Math.atan2(0, 10);     // recomputed properly below
    this.orbitPitch = 0.35;
    this.orbitRadius = 15;
    this.minOrbitRadius = 2;
    this.maxOrbitRadius = 60;
    this.maxOrbitPitch = Math.PI / 2 - 0.05;
    this.cameraPos = new Vector3(5, 5, 15);
    this._initOrbitFromCameraPos();

    // Remembered so Focus Mode can ease back out to the original framing.
    this.defaultCameraTarget = this.cameraTarget.clone();
    this.defaultOrbitRadius = this.orbitRadius;

    // Focus Mode camera easing target (null when not focusing)
    this._focusGoal = null; // { target: Vector3, radius: number }
    this.focusEaseSpeed = 0.12; // fraction of remaining distance closed per render() call

    // Rendering mode: 'cloth' | 'wireframe' | 'particles'
    this.renderMode = 'cloth';
    this.focusParticles = []; // indices of particles to highlight / show forces for

    // Directional light for basic Lambertian shading (makes the computed
    // per-vertex normals actually visible instead of flat-shaded).
    this.lightDir = new Vector3(0.4, -1.0, 0.3).normalize();

    // Camera projection params, kept as properties so picking/dragging math
    // (worldToScreen / screenToRay) always matches what render() actually draws
    this.fov = Math.PI / 4;
    this.near = 0.1;
    this.far = 1000;

    this._initGL();
    this._initShaders();
    this._initBuffers();
  }

  /**
   * Derive orbitYaw/orbitPitch/orbitRadius from the initial hardcoded
   * cameraPos/cameraTarget so the orbit camera starts exactly where the
   * old fixed camera used to sit.
   */
  _initOrbitFromCameraPos() {
    const offset = Vector3.sub(this.cameraPos, this.cameraTarget);
    this.orbitRadius = Vector3.length(offset) || 15;
    this.orbitPitch = Math.asin(offset.y / this.orbitRadius);
    this.orbitYaw = Math.atan2(offset.x, offset.z);
  }

  /**
   * Initialize WebGL context
   */
  _initGL() {
    const gl = this.gl;

    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0.1, 0.1, 0.15, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
  }

  /**
   * Initialize shaders. Three small programs:
   *  - meshProgram: lit triangles (cloth fill mode)
   *  - lineProgram: flat-colored lines (wireframe + force vectors)
   *  - pointProgram: flat-colored points (particle mode)
   */
  _initShaders() {
    const meshVS = `#version 300 es
      precision highp float;
      in vec3 position;
      in vec3 normal;
      in vec3 color;
      uniform mat4 projection;
      uniform mat4 view;
      uniform mat4 model;
      out vec3 fragNormal;
      out vec3 fragColor;
      void main() {
        vec4 worldPos = model * vec4(position, 1.0);
        gl_Position = projection * view * worldPos;
        fragNormal = normalize((model * vec4(normal, 0.0)).xyz);
        fragColor = color;
      }
    `;

    const meshFS = `#version 300 es
      precision highp float;
      in vec3 fragNormal;
      in vec3 fragColor;
      uniform vec3 lightDir;
      out vec4 outColor;
      void main() {
        vec3 N = normalize(fragNormal);
        // abs() so the shaded side still reads well even if a normal
        // ends up pointing slightly away from the light due to per-vertex
        // averaging at mesh edges.
        float diff = abs(dot(N, -lightDir));
        float ambient = 0.35;
        vec3 lit = fragColor * (ambient + diff * 0.65);
        outColor = vec4(lit, 1.0);
      }
    `;

    const flatVS = `#version 300 es
      precision highp float;
      in vec3 position;
      in vec3 color;
      uniform mat4 projection;
      uniform mat4 view;
      uniform mat4 model;
      uniform float pointSize;
      out vec3 fragColor;
      void main() {
        vec4 worldPos = model * vec4(position, 1.0);
        gl_Position = projection * view * worldPos;
        gl_PointSize = pointSize;
        fragColor = color;
      }
    `;

    const flatFS = `#version 300 es
      precision highp float;
      in vec3 fragColor;
      out vec4 outColor;
      void main() {
        outColor = vec4(fragColor, 1.0);
      }
    `;

    this.meshProgram = this._createShaderProgram(meshVS, meshFS);
    this.flatProgram = this._createShaderProgram(flatVS, flatFS);
  }

  _createShaderProgram(vsSource, fsSource) {
    const gl = this.gl;
    const vertexShader = this._compileShader(vsSource, gl.VERTEX_SHADER);
    const fragmentShader = this._compileShader(fsSource, gl.FRAGMENT_SHADER);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const linkError = gl.getProgramInfoLog(program);
      throw new Error('Shader program failed to link: ' + linkError);
    }

    return program;
  }

  _compileShader(source, type) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      const typeName = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';
      throw new Error(`Shader compilation failed (${typeName}): ${error}`);
    }

    return shader;
  }

  _checkGLError(label) {
    const gl = this.gl;
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      console.error(`WebGL Error [${label}]:`, error);
      return false;
    }
    return true;
  }

  _initBuffers() {
    const gl = this.gl;

    // Mesh (triangle fill) buffers
    this.positionBuffer = gl.createBuffer();
    this.normalBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();

    // Wireframe (line) buffers — reuses positions/colors above, separate index buffer
    this.wireframeIndexBuffer = gl.createBuffer();

    // Particle-point buffers — reuses positions/colors above, no indices needed

    // Force-vector line buffers (rebuilt every frame focus mode is active)
    this.forceLinePositionBuffer = gl.createBuffer();
    this.forceLineColorBuffer = gl.createBuffer();
  }

  /**
   * Render cloth. `focusForces`, if provided, is the return value of
   * SimulationCore.getForcesOnParticles(focusParticles) and drives the
   * color-coded stretch/shear/bend vectors drawn in Focus Mode.
   */
  render(cloth, focusForces = null) {
    const gl = this.gl;

    this._advanceFocusEasing();

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const particles = cloth.getParticles();
    const triangles = cloth.getTriangles();

    const positions = new Float32Array(particles.length * 3);
    const colors = new Float32Array(particles.length * 3);

    particles.forEach((p, i) => {
      positions[i * 3] = p.position.x;
      positions[i * 3 + 1] = p.position.y;
      positions[i * 3 + 2] = p.position.z;

      if (this.focusParticles.includes(i)) {
        colors[i * 3] = 1.0;     // Red for focus
        colors[i * 3 + 1] = 0.2;
        colors[i * 3 + 2] = 0.2;
      } else if (p.pinned) {
        colors[i * 3] = 0.5;     // Gray for pinned
        colors[i * 3 + 1] = 0.5;
        colors[i * 3 + 2] = 0.5;
      } else {
        colors[i * 3] = 0.3;     // Blue for regular
        colors[i * 3 + 1] = 0.6;
        colors[i * 3 + 2] = 0.9;
      }
    });

    const normals = this._computeNormals(particles, triangles);

    // Upload shared position/normal/color buffers (used by all three modes)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);

    const projection = this._perspectiveMatrix(this.fov, this.width / this.height, this.near, this.far);
    const view = this._lookAtMatrix(this.cameraPos, this.cameraTarget, this.cameraUp);
    const model = this._identityMatrix();

    if (this.renderMode === 'wireframe') {
      this._drawWireframe(triangles, projection, view, model);
    } else if (this.renderMode === 'particles') {
      this._drawPoints(particles.length, projection, view, model);
    } else {
      this._drawMesh(triangles, projection, view, model);
    }

    // Focus Mode: color-coded force vectors, drawn on top regardless of render mode
    if (this.focusParticles.length > 0 && focusForces) {
      this._drawForceVectors(particles, focusForces, projection, view, model);
    }
  }

  _drawMesh(triangles, projection, view, model) {
    const gl = this.gl;

    const indices = new Uint32Array(triangles.length * 3);
    triangles.forEach((tri, i) => {
      indices[i * 3] = tri[0];
      indices[i * 3 + 1] = tri[1];
      indices[i * 3 + 2] = tri[2];
    });

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

    gl.useProgram(this.meshProgram);

    const posAttr = gl.getAttribLocation(this.meshProgram, 'position');
    const normAttr = gl.getAttribLocation(this.meshProgram, 'normal');
    const colAttr = gl.getAttribLocation(this.meshProgram, 'color');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posAttr);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.vertexAttribPointer(normAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(normAttr);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.vertexAttribPointer(colAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(colAttr);

    gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProgram, 'projection'), false, projection);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProgram, 'view'), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProgram, 'model'), false, model);
    gl.uniform3f(gl.getUniformLocation(this.meshProgram, 'lightDir'), this.lightDir.x, this.lightDir.y, this.lightDir.z);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
  }

  /**
   * Wireframe mode: draw one line per unique mesh edge (deduped so shared
   * triangle edges aren't drawn twice).
   */
  _drawWireframe(triangles, projection, view, model) {
    const gl = this.gl;

    const edgeSet = new Set();
    const edgeIndices = [];
    const addEdge = (i0, i1) => {
      const key = i0 < i1 ? `${i0}_${i1}` : `${i1}_${i0}`;
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      edgeIndices.push(i0, i1);
    };

    triangles.forEach(tri => {
      addEdge(tri[0], tri[1]);
      addEdge(tri[1], tri[2]);
      addEdge(tri[2], tri[0]);
    });

    const indices = new Uint32Array(edgeIndices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

    gl.useProgram(this.flatProgram);

    const posAttr = gl.getAttribLocation(this.flatProgram, 'position');
    const colAttr = gl.getAttribLocation(this.flatProgram, 'color');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posAttr);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.vertexAttribPointer(colAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(colAttr);

    this._setFlatUniforms(projection, view, model, 1.0);

    // Wireframe is easier to read without backface culling hiding the far side
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireframeIndexBuffer);
    gl.drawElements(gl.LINES, indices.length, gl.UNSIGNED_INT, 0);
    gl.enable(gl.CULL_FACE);
  }

  /**
   * Particle-point mode: draw every particle as a point, no mesh at all.
   */
  _drawPoints(particleCount, projection, view, model) {
    const gl = this.gl;

    gl.useProgram(this.flatProgram);

    const posAttr = gl.getAttribLocation(this.flatProgram, 'position');
    const colAttr = gl.getAttribLocation(this.flatProgram, 'color');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posAttr);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.vertexAttribPointer(colAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(colAttr);

    this._setFlatUniforms(projection, view, model, 7.0);

    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.POINTS, 0, particleCount);
    gl.enable(gl.CULL_FACE);
  }

  /**
   * Focus Mode: draw one colored line per (particle, constraint-type)
   * pair with a non-zero force, starting at the particle and extending
   * along the force direction, scaled by magnitude for visibility.
   */
  _drawForceVectors(particles, focusForces, projection, view, model) {
    const gl = this.gl;

    const linePositions = [];
    const lineColors = [];

    this.focusParticles.forEach(pIdx => {
      const particle = particles[pIdx];
      const forces = focusForces[pIdx];
      if (!particle || !forces) return;

      ['stretch', 'shear', 'bend'].forEach(type => {
        const f = forces[type];
        const mag = Vector3.length(f);
        if (mag < 1e-4) return;

        const dir = Vector3.normalize(f);
        const tip = Vector3.add(
          particle.position,
          Vector3.mul(dir, mag * FORCE_VECTOR_SCALE)
        );

        linePositions.push(
          particle.position.x, particle.position.y, particle.position.z,
          tip.x, tip.y, tip.z
        );

        const [r, g, b] = FORCE_COLORS[type];
        lineColors.push(r, g, b, r, g, b);
      });
    });

    if (linePositions.length === 0) return;

    const posArray = new Float32Array(linePositions);
    const colArray = new Float32Array(lineColors);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.forceLinePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, posArray, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.forceLineColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colArray, gl.DYNAMIC_DRAW);

    gl.useProgram(this.flatProgram);

    const posAttr = gl.getAttribLocation(this.flatProgram, 'position');
    const colAttr = gl.getAttribLocation(this.flatProgram, 'color');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.forceLinePositionBuffer);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posAttr);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.forceLineColorBuffer);
    gl.vertexAttribPointer(colAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(colAttr);

    this._setFlatUniforms(projection, view, model, 1.0);

    // Force vectors should read on top of the mesh
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.LINES, 0, posArray.length / 3);
    gl.enable(gl.DEPTH_TEST);
  }

  _setFlatUniforms(projection, view, model, pointSize) {
    const gl = this.gl;
    gl.uniformMatrix4fv(gl.getUniformLocation(this.flatProgram, 'projection'), false, projection);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.flatProgram, 'view'), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.flatProgram, 'model'), false, model);
    gl.uniform1f(gl.getUniformLocation(this.flatProgram, 'pointSize'), pointSize);
  }

  _computeNormals(particles, triangles) {
    const normals = new Float32Array(particles.length * 3);

    for (const tri of triangles) {
      const p0 = particles[tri[0]].position;
      const p1 = particles[tri[1]].position;
      const p2 = particles[tri[2]].position;

      const v1 = new Vector3(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
      const v2 = new Vector3(p2.x - p0.x, p2.y - p0.y, p2.z - p0.z);
      const normal = Vector3.cross(v1, v2);

      tri.forEach(idx => {
        normals[idx * 3] += normal.x;
        normals[idx * 3 + 1] += normal.y;
        normals[idx * 3 + 2] += normal.z;
      });
    }

    for (let i = 0; i < normals.length; i += 3) {
      const len = Math.sqrt(
        normals[i] * normals[i] +
        normals[i + 1] * normals[i + 1] +
        normals[i + 2] * normals[i + 2]
      );
      if (len > 0) {
        normals[i] /= len;
        normals[i + 1] /= len;
        normals[i + 2] /= len;
      }
    }

    return normals;
  }

  /**
   * Set focus particles (for highlighting + force-vector rendering)
   */
  setFocusParticles(indices) {
    this.focusParticles = indices;
  }

  /**
   * Set render mode: 'cloth' | 'wireframe' | 'particles'
   */
  setRenderMode(mode) {
    this.renderMode = mode;
  }

  // ---------------------------------------------------------------------
  // Camera: orbit / pan / zoom
  // ---------------------------------------------------------------------

  /**
   * Recompute cameraPos from (cameraTarget, orbitYaw, orbitPitch, orbitRadius).
   * Call after changing any of those.
   */
  _updateCameraFromOrbit() {
    const cosP = Math.cos(this.orbitPitch);
    const x = this.orbitRadius * cosP * Math.sin(this.orbitYaw);
    const y = this.orbitRadius * Math.sin(this.orbitPitch);
    const z = this.orbitRadius * cosP * Math.cos(this.orbitYaw);

    this.cameraPos.set(
      this.cameraTarget.x + x,
      this.cameraTarget.y + y,
      this.cameraTarget.z + z
    );
  }

  /**
   * Orbit the camera around cameraTarget. dx/dy are mouse-movement deltas
   * in pixels (right-drag).
   */
  orbit(dx, dy) {
    const ORBIT_SPEED = 0.005;
    this.orbitYaw -= dx * ORBIT_SPEED;
    this.orbitPitch = Math.max(
      -this.maxOrbitPitch,
      Math.min(this.maxOrbitPitch, this.orbitPitch - dy * ORBIT_SPEED)
    );
    this._updateCameraFromOrbit();
  }

  /**
   * Pan the camera target (and camera) sideways/vertically in screen
   * space. dx/dy are mouse-movement deltas in pixels (middle-drag).
   */
  pan(dx, dy) {
    const { right, up } = this._getCameraBasis();
    const panScale = this.orbitRadius * 0.0015;

    const offset = Vector3.add(
      Vector3.mul(right, -dx * panScale),
      Vector3.mul(up, dy * panScale)
    );
    this.cameraTarget.add(offset);
    this._updateCameraFromOrbit();
  }

  /**
   * Zoom in/out by scaling orbit radius. deltaY follows the browser
   * wheel-event convention (positive = scroll down = zoom out).
   */
  zoom(deltaY) {
    const ZOOM_SPEED = 0.001;
    const factor = 1 + deltaY * ZOOM_SPEED;
    this.orbitRadius = Math.max(
      this.minOrbitRadius,
      Math.min(this.maxOrbitRadius, this.orbitRadius * factor)
    );
    this._updateCameraFromOrbit();
  }

  /**
   * Focus Mode camera: smoothly ease the camera target to the centroid
   * of the given world-space positions, and the orbit radius to frame
   * them with some padding. Call with an empty/null array to ease back
   * out to the full-cloth default framing.
   * @param {Vector3[]} positions
   */
  focusOnPositions(positions) {
    if (!positions || positions.length === 0) {
      this._focusGoal = {
        target: this.defaultCameraTarget.clone(),
        radius: this.defaultOrbitRadius,
      };
      return;
    }

    const centroid = positions.reduce(
      (acc, p) => acc.add(p.clone()),
      new Vector3(0, 0, 0)
    );
    centroid.mul(1 / positions.length);

    let maxDist = 0.5; // floor, avoids zooming absurdly close for near-coincident particles
    positions.forEach(p => {
      maxDist = Math.max(maxDist, Vector3.distance(p, centroid));
    });

    // Frame the bounding radius with padding, respecting the tan(fov/2)
    // relationship so the selection reliably fits on screen.
    const padding = 2.2;
    const radius = Math.max(this.minOrbitRadius, maxDist * padding / Math.tan(this.fov / 2));

    this._focusGoal = { target: centroid, radius };
  }

  /** Advance the Focus Mode camera easing by one render-frame step. */
  _advanceFocusEasing() {
    if (!this._focusGoal) return;

    const t = this.focusEaseSpeed;
    this.cameraTarget = Vector3.lerp(this.cameraTarget, this._focusGoal.target, t);
    this.orbitRadius += (this._focusGoal.radius - this.orbitRadius) * t;
    this._updateCameraFromOrbit();

    const closeEnough =
      Vector3.distance(this.cameraTarget, this._focusGoal.target) < 0.02 &&
      Math.abs(this.orbitRadius - this._focusGoal.radius) < 0.02;
    if (closeEnough) this._focusGoal = null;
  }

  /**
   * Compute orthonormal camera basis vectors (right, up, forward),
   * matching the convention used in _lookAtMatrix. Used by picking/dragging
   * so ray math always agrees with what's actually rendered.
   */
  _getCameraBasis() {
    const forward = Vector3.normalize(Vector3.sub(this.cameraTarget, this.cameraPos));
    const right = Vector3.normalize(Vector3.cross(forward, this.cameraUp));
    const up = Vector3.normalize(Vector3.cross(right, forward));
    return { right, up, forward };
  }

  /**
   * Project a world-space position to canvas pixel coordinates.
   * Returns null if the point is behind (or too near) the camera.
   */
  worldToScreen(worldPos) {
    const { right, up, forward } = this._getCameraBasis();

    const rel = Vector3.sub(worldPos, this.cameraPos);
    const viewX = Vector3.dot(rel, right);
    const viewY = Vector3.dot(rel, up);
    const viewZ = -Vector3.dot(rel, forward); // camera looks down -Z in view space

    if (viewZ >= -this.near) return null;

    const tanFov = Math.tan(this.fov / 2);
    const aspect = this.width / this.height;

    const ndcX = viewX / (-viewZ * tanFov * aspect);
    const ndcY = viewY / (-viewZ * tanFov);

    return {
      x: (ndcX * 0.5 + 0.5) * this.width,
      y: (1 - (ndcY * 0.5 + 0.5)) * this.height,
    };
  }

  /**
   * Convert canvas pixel coordinates into a world-space picking ray.
   * @returns {{origin: Vector3, direction: Vector3}}
   */
  screenToRay(screenX, screenY) {
    const { right, up, forward } = this._getCameraBasis();

    const ndcX = (screenX / this.width) * 2 - 1;
    const ndcY = 1 - (screenY / this.height) * 2;

    const tanFov = Math.tan(this.fov / 2);
    const aspect = this.width / this.height;

    const dirX = ndcX * aspect * tanFov;
    const dirY = ndcY * tanFov;

    const direction = new Vector3(
      right.x * dirX + up.x * dirY + forward.x,
      right.y * dirX + up.y * dirY + forward.y,
      right.z * dirX + up.z * dirY + forward.z
    );
    direction.normalize();

    return { origin: this.cameraPos.clone(), direction };
  }

  // Matrix helpers
  _identityMatrix() {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  }

  _perspectiveMatrix(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    const result = new Float32Array(16);

    result[0] = f / aspect;
    result[5] = f;
    result[10] = (far + near) * nf;
    result[11] = -1;
    result[14] = 2 * far * near * nf;
    result[15] = 0;

    return result;
  }

  _lookAtMatrix(eye, target, up) {
    let fwdX = target.x - eye.x;
    let fwdY = target.y - eye.y;
    let fwdZ = target.z - eye.z;

    let fwdLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ);
    if (fwdLen === 0) fwdLen = 1;
    fwdX /= fwdLen;
    fwdY /= fwdLen;
    fwdZ /= fwdLen;

    let rightX = fwdY * up.z - fwdZ * up.y;
    let rightY = fwdZ * up.x - fwdX * up.z;
    let rightZ = fwdX * up.y - fwdY * up.x;

    let rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
    if (rightLen === 0) rightLen = 1;
    rightX /= rightLen;
    rightY /= rightLen;
    rightZ /= rightLen;

    let upX = rightY * fwdZ - rightZ * fwdY;
    let upY = rightZ * fwdX - rightX * fwdZ;
    let upZ = rightX * fwdY - rightY * fwdX;

    let upLen = Math.sqrt(upX * upX + upY * upY + upZ * upZ);
    if (upLen === 0) upLen = 1;
    upX /= upLen;
    upY /= upLen;
    upZ /= upLen;

    const result = new Float32Array(16);

    result[0] = rightX;
    result[4] = rightY;
    result[8] = rightZ;
    result[12] = -rightX * eye.x - rightY * eye.y - rightZ * eye.z;

    result[1] = upX;
    result[5] = upY;
    result[9] = upZ;
    result[13] = -upX * eye.x - upY * eye.y - upZ * eye.z;

    result[2] = -fwdX;
    result[6] = -fwdY;
    result[10] = -fwdZ;
    result[14] = fwdX * eye.x + fwdY * eye.y + fwdZ * eye.z;

    result[3] = 0;
    result[7] = 0;
    result[11] = 0;
    result[15] = 1;

    return result;
  }
}

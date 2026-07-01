import { Vector3 } from '../math/Vector3.js';

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

    // Camera
    this.cameraPos = new Vector3(5, 5, 15);
    this.cameraTarget = new Vector3(5, 0, 5);
    this.cameraUp = new Vector3(0, 1, 0);

    // Rendering mode
    this.renderMode = 'cloth'; // 'cloth', 'wireframe', 'particles', 'forces'
    this.focusParticles = []; // Particles to highlight

    this._initGL();
    this._initShaders();
    this._initBuffers();
  }

  /**
   * Initialize WebGL context
   */
  _initGL() {
    const gl = this.gl;

    if (!gl) {
      throw new Error('Failed to get WebGL2 context');
    }

    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0.1, 0.1, 0.15, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    console.log('WebGL initialized successfully');
    console.log('Canvas size:', this.width, 'x', this.height);
  }

  /**
   * Initialize shaders
   */
  _initShaders() {
    const gl = this.gl;

    // Vertex shader
    const vsSource = `#version 300 es
      precision highp float;

      in vec3 position;
      in vec3 normal;
      in vec3 color;

      uniform mat4 projection;
      uniform mat4 view;
      uniform mat4 model;

      out vec3 fragNormal;
      out vec3 fragColor;
      out vec3 fragPos;

      void main() {
        vec4 worldPos = model * vec4(position, 1.0);
        gl_Position = projection * view * worldPos;
        fragNormal = normalize((model * vec4(normal, 0.0)).xyz);
        fragColor = color;
        fragPos = worldPos.xyz;
      }
    `;

    // Fragment shader - simplified for debugging
    const fsSource = `#version 300 es
      precision highp float;

      in vec3 fragNormal;
      in vec3 fragColor;
      in vec3 fragPos;

      out vec4 outColor;

      void main() {
        // Output color directly - if cloth is visible, shader is working
        outColor = vec4(fragColor, 1.0);
      }
    `;

    this.shaderProgram = this._createShaderProgram(vsSource, fsSource);
  }

  /**
   * Create shader program from source
   */
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
      console.error('Shader program failed to link:', linkError);
      throw new Error('Shader program failed to link: ' + linkError);
    }

    console.log('Shader program linked successfully');
    
    // Log attribute locations
    const posLoc = gl.getAttribLocation(program, 'position');
    const normLoc = gl.getAttribLocation(program, 'normal');
    const colLoc = gl.getAttribLocation(program, 'color');
    console.log('Attribute locations - position:', posLoc, 'normal:', normLoc, 'color:', colLoc);

    return program;
  }

  /**
   * Compile a single shader
   */
  _compileShader(source, type) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      console.error('Shader compilation failed:', error);
      console.error('Shader type:', type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT');
      throw new Error('Shader compilation failed: ' + error);
    }

    return shader;
  }

  /**
   * Check for WebGL errors
   */
  _checkGLError(label) {
    const gl = this.gl;
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      const errorName = {
        [gl.INVALID_ENUM]: 'INVALID_ENUM',
        [gl.INVALID_VALUE]: 'INVALID_VALUE',
        [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
        [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION',
        [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
        [gl.CONTEXT_LOST_WEBGL]: 'CONTEXT_LOST_WEBGL',
      }[error] || 'UNKNOWN';
      console.error(`WebGL Error [${label}]:`, errorName, error);
      return false;
    }
    return true;
  }

  /**
   * Initialize buffers
   */
  _initBuffers() {
    const gl = this.gl;

    this.positionBuffer = gl.createBuffer();
    this.normalBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();
  }

  /**
   * Render cloth
   */
  render(cloth) {
    const gl = this.gl;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const particles = cloth.getParticles();
    const triangles = cloth.getTriangles();

    if (!this._loggedRenderInfo) {
      console.log(`Rendering: ${particles.length} particles, ${triangles.length} triangles`);
      console.log('Shader program:', this.shaderProgram);
      this._loggedRenderInfo = true;
    }

    // Prepare vertex data
    const positions = new Float32Array(particles.length * 3);
    const colors = new Float32Array(particles.length * 3);

    particles.forEach((p, i) => {
      positions[i * 3] = p.position.x;
      positions[i * 3 + 1] = p.position.y;
      positions[i * 3 + 2] = p.position.z;

      // Color based on pinned state or focus
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

    // Log vertex position bounds
    if (!this._loggedVertexBounds) {
      let minX = positions[0], maxX = positions[0];
      let minY = positions[1], maxY = positions[1];
      let minZ = positions[2], maxZ = positions[2];
      for (let i = 0; i < positions.length; i += 3) {
        minX = Math.min(minX, positions[i]);
        maxX = Math.max(maxX, positions[i]);
        minY = Math.min(minY, positions[i + 1]);
        maxY = Math.max(maxY, positions[i + 1]);
        minZ = Math.min(minZ, positions[i + 2]);
        maxZ = Math.max(maxZ, positions[i + 2]);
      }
      console.log('Vertex bounds - X:', minX.toFixed(2), 'to', maxX.toFixed(2), 'Y:', minY.toFixed(2), 'to', maxY.toFixed(2), 'Z:', minZ.toFixed(2), 'to', maxZ.toFixed(2));
      this._loggedVertexBounds = true;
    }

    // Compute normals
    const normals = new Float32Array(particles.length * 3);
    for (let i = 0; i < particles.length; i++) {
      normals[i * 3] = 0;
      normals[i * 3 + 1] = 0;
      normals[i * 3 + 2] = 0;
    }

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

    // Normalize normals
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

    // Setup index buffer
    const indices = new Uint32Array(triangles.length * 3);
    triangles.forEach((tri, i) => {
      indices[i * 3] = tri[0];
      indices[i * 3 + 1] = tri[1];
      indices[i * 3 + 2] = tri[2];
    });

    // Setup buffers
    console.log('Setting up buffers...');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    this._checkGLError('position buffer');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.DYNAMIC_DRAW);
    this._checkGLError('normal buffer');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    this._checkGLError('color buffer');

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);
    this._checkGLError('index buffer');

    console.log('Using shader program...');
    // Use shader program
    gl.useProgram(this.shaderProgram);
    this._checkGLError('useProgram');

    // Setup vertex attributes
    const posAttr = gl.getAttribLocation(this.shaderProgram, 'position');
    const normAttr = gl.getAttribLocation(this.shaderProgram, 'normal');
    const colAttr = gl.getAttribLocation(this.shaderProgram, 'color');

    console.log('Vertex attributes - position:', posAttr, 'normal:', normAttr, 'color:', colAttr);

    console.log('Setting up vertex attributes...');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posAttr);
    this._checkGLError('position attribute');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.vertexAttribPointer(normAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(normAttr);
    this._checkGLError('normal attribute');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.vertexAttribPointer(colAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(colAttr);
    this._checkGLError('color attribute');

    console.log('Setting up matrices...');
    console.log('Camera position:', this.cameraPos.x, this.cameraPos.y, this.cameraPos.z);
    console.log('Camera target:', this.cameraTarget.x, this.cameraTarget.y, this.cameraTarget.z);
    console.log('Camera up:', this.cameraUp.x, this.cameraUp.y, this.cameraUp.z);
    
    // Setup matrices
    const projection = this._perspectiveMatrix(Math.PI / 4, this.width / this.height, 0.1, 1000);
    const view = this._lookAtMatrix(this.cameraPos, this.cameraTarget, this.cameraUp);
    const model = this._identityMatrix();

    // Verify matrices contain valid numbers
    let projValid = true, viewValid = true, modelValid = true;
    for (let i = 0; i < 16; i++) {
      if (!isFinite(projection[i])) { projValid = false; console.error('Projection matrix invalid at', i, projection[i]); }
      if (!isFinite(view[i])) { viewValid = false; console.error('View matrix invalid at', i, view[i]); }
      if (!isFinite(model[i])) { modelValid = false; console.error('Model matrix invalid at', i, model[i]); }
    }
    console.log('Matrix validity - projection:', projValid, 'view:', viewValid, 'model:', modelValid);

    const projLoc = gl.getUniformLocation(this.shaderProgram, 'projection');
    const viewLoc = gl.getUniformLocation(this.shaderProgram, 'view');
    const modelLoc = gl.getUniformLocation(this.shaderProgram, 'model');

    console.log('Uniform locations - projection:', projLoc, 'view:', viewLoc, 'model:', modelLoc);

    gl.uniformMatrix4fv(projLoc, false, projection);
    gl.uniformMatrix4fv(viewLoc, false, view);
    gl.uniformMatrix4fv(modelLoc, false, model);
    this._checkGLError('uniforms');

    console.log('Drawing elements:', indices.length);
    // Draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
    this._checkGLError('drawElements');
    
    console.log('Frame rendered');
  }

  /**
   * Set focus particles (for highlighting)
   */
  setFocusParticles(indices) {
    this.focusParticles = indices;
  }

  /**
   * Set render mode
   */
  setRenderMode(mode) {
    this.renderMode = mode;
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
    // Forward vector (from eye to target)
    let fwdX = target.x - eye.x;
    let fwdY = target.y - eye.y;
    let fwdZ = target.z - eye.z;

    // Normalize forward
    let fwdLen = Math.sqrt(fwdX * fwdX + fwdY * fwdY + fwdZ * fwdZ);
    if (fwdLen === 0) fwdLen = 1;
    fwdX /= fwdLen;
    fwdY /= fwdLen;
    fwdZ /= fwdLen;

    // Right = cross(forward, up)
    let rightX = fwdY * up.z - fwdZ * up.y;
    let rightY = fwdZ * up.x - fwdX * up.z;
    let rightZ = fwdX * up.y - fwdY * up.x;

    // Normalize right
    let rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
    if (rightLen === 0) rightLen = 1;
    rightX /= rightLen;
    rightY /= rightLen;
    rightZ /= rightLen;

    // New up = cross(right, forward)
    let upX = rightY * fwdZ - rightZ * fwdY;
    let upY = rightZ * fwdX - rightX * fwdZ;
    let upZ = rightX * fwdY - rightY * fwdX;

    // Normalize new up
    let upLen = Math.sqrt(upX * upX + upY * upY + upZ * upZ);
    if (upLen === 0) upLen = 1;
    upX /= upLen;
    upY /= upLen;
    upZ /= upLen;

    // Build matrix: rotation part (transpose because OpenGL uses column-major)
    // and translation part
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

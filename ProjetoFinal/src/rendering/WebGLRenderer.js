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

    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0.1, 0.1, 0.15, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
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

      void main() {
        gl_Position = projection * view * model * vec4(position, 1.0);
        fragNormal = normalize((model * vec4(normal, 0.0)).xyz);
        fragColor = color;
      }
    `;

    // Fragment shader
    const fsSource = `#version 300 es
      precision highp float;

      in vec3 fragNormal;
      in vec3 fragColor;

      out vec4 outColor;

      void main() {
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        float diffuse = max(dot(fragNormal, lightDir), 0.3);
        outColor = vec4(fragColor * diffuse, 1.0);
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
      console.error('Shader program failed to link:', gl.getProgramInfoLog(program));
    }

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
      console.error('Shader compilation failed:', gl.getShaderInfoLog(shader));
    }

    return shader;
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

    // Setup buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);

    // Setup index buffer
    const indices = new Uint32Array(triangles.length * 3);
    triangles.forEach((tri, i) => {
      indices[i * 3] = tri[0];
      indices[i * 3 + 1] = tri[1];
      indices[i * 3 + 2] = tri[2];
    });

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

    // Use shader program
    gl.useProgram(this.shaderProgram);

    // Setup vertex attributes
    const posAttr = gl.getAttribLocation(this.shaderProgram, 'position');
    const normAttr = gl.getAttribLocation(this.shaderProgram, 'normal');
    const colAttr = gl.getAttribLocation(this.shaderProgram, 'color');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posAttr);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.vertexAttribPointer(normAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(normAttr);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.vertexAttribPointer(colAttr, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(colAttr);

    // Setup matrices
    const projection = this._perspectiveMatrix(Math.PI / 4, this.width / this.height, 0.1, 1000);
    const view = this._lookAtMatrix(this.cameraPos, this.cameraTarget, this.cameraUp);
    const model = this._identityMatrix();

    const projLoc = gl.getUniformLocation(this.shaderProgram, 'projection');
    const viewLoc = gl.getUniformLocation(this.shaderProgram, 'view');
    const modelLoc = gl.getUniformLocation(this.shaderProgram, 'model');

    gl.uniformMatrix4fv(projLoc, false, projection);
    gl.uniformMatrix4fv(viewLoc, false, view);
    gl.uniformMatrix4fv(modelLoc, false, model);

    // Draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
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
    const nf = near - far;
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / nf, -1,
      0, 0, (2 * far * near) / nf, 0,
    ]);
  }

  _lookAtMatrix(eye, target, up) {
    const z = Vector3.normalize(Vector3.sub(eye, target));
    const x = Vector3.normalize(Vector3.cross(up, z));
    const y = Vector3.cross(z, x);

    return new Float32Array([
      x.x, y.x, z.x, 0,
      x.y, y.y, z.y, 0,
      x.z, y.z, z.z, 0,
      -Vector3.dot(x, eye), -Vector3.dot(y, eye), -Vector3.dot(z, eye), 1,
    ]);
  }
}

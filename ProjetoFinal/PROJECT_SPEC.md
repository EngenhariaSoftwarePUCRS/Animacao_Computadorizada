# Tecimulator Project Specification

I am building a project called **Tecimulator**, a web-based cloth simulation system focused on **education and parameter visualization**, not just realism.

## Core idea

Tecimulator simulates cloth using a **particle-based triangular mesh**, where each particle is connected through constraints representing:

- Stretch
- Shear
- Bend

The goal is to help users understand how cloth works physically and how different parameter values approximate different fabric types.

Examples:

- Silk → low bend stiffness, low stretch resistance
- Cotton → medium stretch/bend
- Denim → high stretch stiffness
- Leather → high bend stiffness, low elasticity
- Elastic fabric → low stretch stiffness, high deformation tolerance

---

## Technical constraints

**Use:**

- HTML
- CSS
- JavaScript
- WebGL

**Allowed:**

- lightweight math helpers (vector/matrix utilities)

**Avoid:**

- React
- Vue
- Angular
- Three.js
- physics engines
- high-level rendering frameworks

I want full control over the implementation.

---

## Main system modules

### 1. Simulation Core

Responsible for:

- particle generation (cloth grid)
- triangular mesh topology
- Verlet integration
- force accumulation
- constraint solving
- gravity
- wind
- damping
- pinned particles

Internal constraints:

- structural/stretch
- shear (diagonal)
- bend

Each constraint should expose its current force magnitude.

---

### 2. Rendering Module

Responsible for:

- WebGL rendering
- wireframe mode
- particle mode
- textured cloth mode
- normals generation
- force vector rendering

Must support:

- zoom
- pan
- orbit
- particle highlighting

---

### 3. UI Module

Must have:

- live parameter editing
- material presets
- simulation controls (pause/play/reset)
- frame stepping
- particle selection
- focus mode

---

## Core feature: Focus Mode

This is the most important feature.

The user can select **3–7 particles**.

The camera zooms into them.

For these particles I want:

- force vectors rendered
- stretch forces shown separately
- shear forces shown separately
- bend forces shown separately
- color-coded visualization
- per-frame updates
- optional freeze-frame stepping

This is the educational/scientific core.

---

## Material preset system

Presets should configure:

- stretch stiffness
- shear stiffness
- bend stiffness
- damping
- mass
- wind response

Initial presets:

- Silk
- Cotton
- Denim
- Leather
- Elastic

---

## MVP priority order

Build in this order:

1. Particle system
2. Grid generation
3. Triangulation
4. Verlet integration
5. Stretch constraints
6. Shear constraints
7. Bend constraints
8. Rendering
9. UI controls
10. Presets
11. Focus mode
12. Force visualization

---

## Final goal

Tecimulator should function as:

1. A cloth simulator
2. A material behavior sandbox
3. A force visualization tool
4. An educational platform for understanding cloth physics

Prioritize clean architecture, readability, and modularity over optimization.

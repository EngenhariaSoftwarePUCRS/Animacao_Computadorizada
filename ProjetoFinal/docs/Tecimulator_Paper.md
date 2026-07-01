# **Tecimulator: An Interactive Web-Based Cloth Simulation System for Educational Visualization**

## **Abstract**

Cloth simulation is a fundamental topic in computer animation and physically-based modeling, widely used in films, video games, virtual humans, and digital fashion. Despite its relevance, understanding cloth behavior remains challenging due to the complexity of internal forces, numerical stability, and dynamic interactions over time. This work presents **Tecimulator**, an interactive web-based cloth simulation system built using WebGL, designed as an educational and exploratory tool. The system models cloth as a particle-based triangular mesh and exposes key simulation parameters such as stretch, shear, bend stiffness, damping, and external forces, allowing the reproduction of different material behaviors such as silk, cotton, denim, leather, and elastic fabrics. Unlike traditional cloth simulators focused primarily on realism, Tecimulator emphasizes visualization and understanding of the physical behavior of cloth through real-time interaction, parameter manipulation, and force inspection. Preliminary results demonstrate the viability of the proposed system as both a simulation playground and an educational resource.

**Keywords:** cloth simulation, computer animation, physically-based animation, WebGL, interactive visualization.

# **1\. Introduction**

Cloth simulation is an important subfield of computer animation, responsible for reproducing the dynamic behavior of deformable materials such as clothing, curtains, and flags. Realistic cloth behavior contributes significantly to visual immersion in applications including film production, games, architecture visualization, and virtual try-on systems.

Despite appearing visually simple, cloth is computationally complex. A piece of fabric consists of thousands of interacting points subject to multiple internal and external forces, continuous collisions, self-collision, and strict numerical stability requirements.

Historically, cloth simulation has been approached through physically-based methods, such as the pioneering work of Baraff and Witkin (1998), which introduced stable large-step integration methods for cloth dynamics. More recently, the field has expanded toward data-driven and AI-assisted approaches, especially in virtual try-on systems.

Although many simulation systems exist, most operate as black-box tools, providing little insight into the underlying mechanics. This work proposes **Tecimulator**, an interactive web-based cloth simulator designed not only to simulate cloth, but also to expose and visualize its internal physical behavior.

The main objective of this work is to develop an educational cloth simulation environment where users can manipulate parameters and inspect how internal forces affect cloth motion over time.

A secondary objective is to investigate how different combinations of physical parameters can approximate distinct fabric categories. By adjusting stiffness, damping, and bending resistance, users can observe how soft fabrics such as silk differ from rigid materials such as denim or leather, reinforcing the relationship between simulation parameters and perceptual material properties.

# **2\. Related Work**

Cloth simulation has been extensively studied in computer graphics.

One of the most influential works is **Large Steps in Cloth Simulation** by Baraff and Witkin (1998), which introduced implicit integration methods capable of maintaining stability under large time steps. This work established several core concepts still used in modern simulation.

In production environments, studios such as Pixar have extended cloth simulation pipelines to support artistic control and production scalability. Kutt (2018) describes industrial workflows where cloth behavior is directed through parameter tuning and simulation constraints.

More recently, research has shifted toward data-driven methods. Wu, Shen, and Igarashi (2025) propose a real-time virtual try-on framework for loose-fitting garments using recurrent neural networks and temporal consistency mechanisms.

Existing web-based cloth simulators, such as public WebGL demonstrations, provide interactive cloth visualization but often lack explicit educational tools for force inspection and parameter analysis.

The main difference of the proposed system lies in its focus on **didactic visualization**, allowing direct inspection of stretch, shear, and bend forces.

# **3\. Theoretical Foundation**

## **3.1 Particle-Based Cloth Representation**

Cloth can be modeled as a network of particles connected by constraints. Each particle stores:

* position  
* velocity  
* acceleration  
* mass

The cloth surface is discretized into triangular meshes, which offer geometric stability and efficient deformation handling.

## **3.2 Newton's Second Law**

The motion of each particle follows Newton's second law:

$$F = ma$$

where force generates acceleration over time.

## **3.3 Hooke's Law**

Elastic behavior between connected particles is modeled using Hooke's law:

$$F = -kx$$

where the restoring force grows proportionally to displacement.

## **3.4 Internal Cloth Forces**

Three main internal forces define cloth behavior:

### **Stretch**

Controls resistance to elongation.

### **Shear**

Controls diagonal deformation inside triangular elements.

Shear prevents triangles from collapsing sideways.

### **Bend**

Controls resistance to folding between adjacent triangles.

Bend directly affects wrinkles and folds.

## **3.5 Numerical Integration**

To compute particle motion over time, numerical integration methods are required.

This work adopts **Verlet Integration** due to its simplicity and stability for constraint-based simulations.

## **3.6 Material Parametrization**

Different cloth materials can be approximated by varying internal simulation parameters.

For example:

* **Silk** tends to have low bend stiffness and low stretch resistance, producing soft folds and fluid motion.  
* **Cotton** presents moderate stretch and bend resistance, resulting in stable but flexible behavior.  
* **Denim** has high stretch stiffness and medium bend resistance, making it more rigid and resistant to deformation.  
* **Leather** exhibits high bend resistance and low elasticity, generating heavier folds and stronger structural preservation.  
* **Elastic fabrics** have low stretch stiffness and high deformation tolerance.

This relationship between parameter values and perceived material properties is one of the central educational goals of Tecimulator.

# **4\. Methodology**

The proposed system is structured into three main modules:

## **Simulation Core**

Responsible for:

* particle generation  
* force accumulation  
* integration  
* constraint solving

## **Rendering Module**

Responsible for:

* WebGL rendering  
* cloth mesh visualization  
* particle visualization  
* force vector overlays

## **User Interface Module**

Responsible for:

* parameter editing  
* preset selection  
* simulation controls  
* particle focus mode  
* particle selection and focus inspection  
* force decomposition visualization

## **System Flow**

User Input  
   ↓  
Parameter System  
   ↓  
Simulation Core  
   ↓  
Constraint Solver  
   ↓  
Renderer  
   ↓  
Visualization

# **5\. Partial Results**

The current prototype includes:

* cloth mesh generation  
* real-time rendering  
* parameter adjustment  
* gravity simulation  
* pinned particles  
* force visualization prototypes

Initial tests demonstrate stable cloth motion under varying stiffness and damping values.

Different parameter configurations produce visibly distinct material behaviors, allowing approximation of fabrics such as silk, cotton, denim, leather, and elastic textiles. Preliminary observations indicate that variations in bend and stretch stiffness strongly influence perceived material realism.

# **6\. Future Work**

Future improvements include:

* self-collision support  
* expanded material libraries  
* force magnitude graphs  
* cloth tearing  
* texture mapping  
* recording/playback tools  
* GPU optimization

# **7\. Final Considerations**

This work presents Tecimulator as an educational approach to cloth simulation, combining physically-based animation with interactive visualization.

The system seeks to reduce the abstraction barrier commonly found in cloth simulators by making internal mechanics visible and manipulable.

By emphasizing understanding rather than only realism, Tecimulator contributes as both a technical and pedagogical tool in computer animation.

# **References**

BARAFF, D.; WITKIN, A. Large Steps in Cloth Simulation. SIGGRAPH, 1998\.

KUTT, A. Art-Directed Costumes at Pixar: Design, Tailoring, and Simulation in Production. SIGGRAPH Asia Courses, 2018\.

WU, Z.; SHEN, I.-C.; IGARASHI, T. Real-Time Per-Garment Virtual Try-On with Temporal Consistency for Loose-Fitting Garments. Pacific Graphics, 2025\.

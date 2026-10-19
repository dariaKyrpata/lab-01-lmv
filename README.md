# Space Dogfight — JavaScript Game

A 2D space shooter developed with JavaScript, Vite, and the Canvas 2D API.

This project contains Lab 01 and Lab 02 for the Human-Computer Interaction course.

## Installation and Running

```bash
npm install
npm run dev
```

Open the local address provided by Vite in your browser.

## Game Controls

| Key                | Action                |
| ------------------ | --------------------- |
| Arrow Up           | Accelerate            |
| Arrow Left / Right | Rotate the spaceship  |
| Space              | Shoot continuously    |
| F                  | Fire a single shot    |
| H                  | Toggle homing bullets |

## Game Features

- Pink and white spaceship with animated engines
- Starfield background and animated stars
- Asteroids with craters and rotation
- Collision detection and damage
- Health and score tracking
- Shield pickups
- Homing bullets and asteroids
- Explosions with particles
- Respawning after two seconds
- HUD showing HP, score, shield, homing, FPS, UPS, and frame time

---

# Lab 01 — The Event Loop Is the Game Loop

## Objective

Understand JavaScript's event loop, asynchronous execution, `requestAnimationFrame`, ES modules, closures, and the Canvas API.

Create a controllable spaceship with a fixed-timestep game loop and smooth rendering.

## Implementation

The game uses `requestAnimationFrame` for rendering and a fixed simulation timestep of 1/60 second.

The accumulator separates simulation updates from rendering, allowing the game to run consistently on displays with different refresh rates.

Keyboard input is implemented using closures, while rendering uses the Canvas 2D API.

## Experiment 1 — Synchronous Blocking

**What the player sees:** The game freezes for a fraction of a second every second. Movement becomes less smooth.

**HUD behavior:** FPS decreases because the browser cannot render new frames during a synchronous blocking operation.

**Explanation:** JavaScript executes the blocking code on the main thread. During this operation, the event loop cannot process other callbacks or rendering steps.

A synchronous operation cannot be interrupted by another JavaScript callback on the same thread.

## Experiment 2 — setInterval vs requestAnimationFrame

**Observations:**

- `setInterval` does not synchronize with the display refresh rate.
- Animation may become less smooth because of frame-time jitter.
- Background-tab behavior differs from normal foreground rendering.

**Explanation:** `requestAnimationFrame` is designed for browser animation and is synchronized with rendering opportunities.

Unlike a timer, it does not attempt to render at an arbitrary fixed interval.

## Experiment 3 — Variable Timestep

**Observations:** CPU throttling decreases the frame rate and can change the simulated trajectory when variable time steps are used.

**Explanation:** The accumulator-based fixed timestep updates physics using constant time intervals.

This provides more predictable and reproducible simulation behavior, which is important for future multiplayer functionality.

---

# Lab 02 — Objects, Prototypes, and this: The Entity Model

## Objective

Learn to organize game objects using JavaScript classes, inheritance, private fields, `this`, prototypes, `Map`, generators, and composition.

Extend the first laboratory with bullets, asteroids, collisions, pickups, explosions, and respawning.

## 1. Vector2 and Entity

The `Vector2` class implements mathematical operations:

- `add()` and `sub()` — vector addition and subtraction
- `scale()` — scalar multiplication
- `length()` — vector magnitude
- `normalize()` — unit vector
- `rotate()` — vector rotation
- `dot()` — dot product
- `fromAngle()` — direction vector from an angle

These methods return new vectors instead of modifying their arguments.

The `Entity` class provides common properties:

`id`, `pos`, `vel`, `angle`, `radius`, `kind`, and `alive`.

Each entity receives a unique ID generated using a private static counter.

The spaceship is implemented using:

```javascript
class Ship extends Entity
```

Only one level of inheritance is used.

The ship also contains a private `#hp` field and a public `get hp()` accessor.

## 2. World and Map

The `World` class stores game entities in a private `Map`, using their unique IDs as keys.

It provides:

- `spawn()` — register a new entity
- `despawn()` — mark an entity for removal
- `get()` — find an entity by ID
- `step()` — update the simulation
- `ofKind()` — iterate over entities of a specific type

Dead entities are removed during a sweep at the end of the simulation step.

A `Map` was selected because it supports numeric keys, preserves insertion order, provides `.size`, and offers convenient methods for adding, finding, and deleting entities.

The `ofKind()` method is a generator, allowing matching entities to be processed without first creating a separate result array.

## 3. The this Binding Experiment

The following experiment demonstrates a common JavaScript problem:

```javascript
class TestShip {
  constructor() {
    this.name = "Player";
  }

  fire() {
    console.log(`${this.name} fires!`);
  }
}

const ship = new TestShip();

ship.fire();

const fire = ship.fire;

try {
  fire();
} catch (error) {
  console.log("Error:", error.message);
}

const fixedFire = ship.fire.bind(ship);

fixedFire();
```

**Console result:**

```text
Player fires!
Error: can't access property "name", this is undefined
Player fires!
```

**Explanation:**

`ship.fire()` works because the method is called through the object, so `this` refers to `ship`.

When the method is assigned to another variable and called as `fire()`, its original object binding is lost. In strict mode, `this` is `undefined`.

The problem is fixed using `.bind(ship)`.

For keyboard or event listeners, the same issue can occur when passing `ship.fire` directly as a callback.

### Alternative solutions

**1. Arrow function wrapper**

```javascript
target.addEventListener("keydown", () => ship.fire());
```

The wrapper calls the method through the object. It also creates a new callback function.

**2. bind()**

```javascript
target.addEventListener("keydown", ship.fire.bind(ship));
```

The method permanently receives the correct `this` value. However, `bind()` creates another function, which must be retained if the listener needs to be removed later.

**3. Arrow function class field**

```javascript
fire = () => {
  console.log(this);
};
```

Arrow functions capture `this` from their surrounding context. However, class-field arrow methods create a separate function for every instance instead of sharing one prototype method.

**Chosen approach:** The game uses `world.step()` to check input and calls `this.player.fire()` directly, preserving the correct method binding.

## 4. Prototype Chain Experiment

The following code was executed in the browser console:

```javascript
const parent = {
  hello() {
    return "Hello from parent!";
  },
};

const child = Object.create(parent);

console.log(child.hello());

console.log(Object.getPrototypeOf(child) === parent);

parent.hello = function () {
  return "Updated hello!";
};

console.log(child.hello());

console.log(child.hasOwnProperty("hello"));
```

**Expected and observed result:**

```text
Hello from parent!
true
Updated hello!
false
```

**Explanation:**

`Object.create(parent)` creates an object whose prototype is `parent`.

When `child.hello()` is called, JavaScript searches for the method on `child`, then follows the prototype chain.

Changing the method on `parent` changes the behavior observed through `child`.

The final `false` confirms that `hello` is inherited rather than stored directly on `child`.

## 5. Collision System

Collisions are implemented in the separate `collision.js` module.

Two circular entities collide when the distance between their centers is less than or equal to the sum of their radii.

The current implementation uses a simple O(n²) pairwise algorithm.

This design is sufficient for a small game and allows the collision detection system to be replaced with a more efficient algorithm in future laboratories.

Bullets damage asteroids and ships, while pickups activate a temporary protective shield.

Destroyed entities are removed from the world. Explosions are represented by short-lived particles.

A destroyed ship is scheduled to respawn after two seconds. The game searches for a random position with sufficient distance from asteroids and chooses the best available candidate if necessary.

## 6. Composition Over Inheritance

A deep inheritance hierarchy could look like this:

```text
Entity
  |
MovingEntity
  |
HomingEntity
  |-- HomingBullet
  |-- HomingAsteroid
```

This approach becomes difficult to maintain because different game objects may need the same behavior without sharing the same inheritance structure.

For example, both bullets and asteroids can use homing, but they have different movement and damage rules.

Instead, the game uses composition:

```javascript
bullet.homing = new Homing({
  targetId: target.id,
  turnSpeed: 5,
  speed: 500,
});
```

The same `Homing` behavior can be attached to an asteroid:

```javascript
asteroid.homing = new Homing({
  targetId: ship.id,
  turnSpeed: 0.6,
  speed: 40,
});
```

The `Homing` component changes the velocity of the entity without requiring additional inheritance levels.

The shield pickup is implemented as a separate collidable entity with its own effect. It does not need to inherit from `Ship`.

This architecture provides reusable behaviors, reduces coupling, and makes new game mechanics easier to add.

## 7. Game Design

The spaceship is drawn using Canvas 2D with a white and pink body, blue cockpit, wide wings, and animated engine flames.

Asteroids use shaded polygons, surface details, and craters. Homing asteroids are distinguished by pink visual effects.

The background includes animated stars and a subtle grid.

The HUD uses a dark translucent panel with icons for health, shield, score, and homing status.

These visual improvements make the game easier to understand while preserving the simulation architecture.і

## Conclusion

During Lab 02, the original game was extended with an entity-based architecture.

The project demonstrates JavaScript classes, private fields, inheritance, prototypes, `this` binding, `Map`, generators, collision detection, and composition.

The resulting architecture supports further development of the space shooter in future laboratories.

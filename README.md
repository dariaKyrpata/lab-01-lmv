
# Space Dogfight

A browser-based space shooter built with JavaScript,
Canvas, Vite, and Node.js.

## Lab 6 — TypeScript

The shared simulation, codecs, WebSocket server, and browser game run from TypeScript source. Use Node.js 22.18 or newer for native type stripping on the server. Vite handles the browser build. Earlier standalone exercises and server integration test drivers remain in JavaScript.

```powershell
npm ci
npm run typecheck
npm run typecheck --workspaces
npm test
npm run build
```

TypeScript checks code before it runs. The server still validates untrusted inputs at runtime. Zod schemas check JSON messages and the server environment. Binary readers check packet length, version, flags, and numeric fields. The snapshot schema validates the decoded result.

### What TypeScript found

- Asteroid collisions wrote directly into vector coordinates. The collision code now replaces the vector, which lets the shared vector type protect its coordinates with `readonly`.
- A roster entry could arrive before its ship appeared in the current snapshot. Ship lookup now checks that the ID exists and belongs to a ship before reading its color or score.
- DOM queries can return `null` or the wrong element type. The lobby, chat, and netgraph now check required elements when constructing their UI.
- The connection queue could yield an undefined entry under indexed access. The send loop now checks the entry before sending it.

### Three types

- **`EntityId`, `Tick`, and `Seq`** are branded numbers. They are ordinary numbers on the wire, but TypeScript rejects passing a tick where an entity ID is expected.
- **`EntitySnapshot`** is a union of snapshots distinguished by `kind`. Checking for `"ship"` makes its health and color available. The exhaustive rendering and restoration switches reject a new kind at typecheck time until it has a handler.
- **`Bus<Events>`** links each event name to its payload. A listener for `fired` can read `shipId` without guessing which event it received.

A local comparison against Lab 5 produced identical simulation snapshots over 1,000 ticks with four players and the same seed and inputs.

The lobby and HUD keep the existing DOM and Canvas code. Their UI is small, so a framework would add a new build and rendering layer without simplifying this migration.

## Lab 5 — Real-Time Networking

Run `npm run dev:server` and `npm run dev:client` in separate terminals. Open two browser windows and join the same room with different player names.

- Binary mode: http://127.0.0.1:5173/?format=binary
- JSON mode: http://127.0.0.1:5173/?format=json

### Networking design

**Latency.** The server runs the simulation and sends snapshots at 30 Hz. When the client draws its own ship from snapshots alone, it must wait for the input to reach the server and for the resulting snapshot to arrive. Client-side prediction applies the same movement formula locally, so the ship responds immediately. The client also displays its own shots as soon as they are fired and replaces them with the server’s bullets when the corresponding input is acknowledged.

**Consistency.** Each input carries a sequence number (`seq`). Each snapshot includes `lastProcessedSeq`, which tells the client which inputs it can discard. The client starts from the ship state in the snapshot and replays the remaining inputs. The visual correction fades over roughly 100 ms. The shared simulation uses a fixed time step and a seeded random number generator so that the same starting state and inputs produce the same result.

**Cheating.** The server accepts control inputs and validates their format and sequence. It determines positions, hits, health, and scores. A player who changes their ship’s coordinates in the browser cannot use those coordinates to teleport on the server or on other players’ screens.

**Interpolation.** Remote ships and bullets are drawn between server snapshots. The default interpolation delay is 100 ms, about three server ticks. A shorter buffer displays more recent positions but is more likely to run out of snapshots when packets arrive unevenly. A longer buffer makes motion smoother at the cost of showing an older view of the match.

**Determinism experiment.** A controlled test ran 900 reconciliations with six unacknowledged inputs. The original movement formula produced zero positional correction. Adding `Math.random()` to the horizontal velocity in a temporary copy of the client formula increased the mean correction to 4.44 world units and the maximum to 16.18. The game files kept the deterministic formula.

The netgraph shows round-trip time, snapshot age, incoming and outgoing bytes per second, the number of unacknowledged inputs, and the latest correction magnitude. The network simulator can add delay, jitter, and message loss. The demonstration settings are 100 ms of delay per direction, 30 ms of jitter, and 2% loss.

### Binary protocol

Each binary message starts with a version byte (`1`) and a message type byte (`1` for input, `2` for snapshot). Multi-byte values are written with `DataView` in little-endian order.

- An input packet is 12 bytes. After the header, it contains `seq` and `tick` as `Uint32`, turn as `Int8`, and one byte of flags for thrust, fire, and homing.
- A snapshot contains `tick`, `sentAt`, `lastProcessedSeq`, and the world state. The [snapshot schema](shared/src/codec/binarySnapshot.js) defines the field order. Angles are stored as `Int16` with a step of approximately 0.0055°. Positions and velocities are stored as `Float64`.
- Room joins, chat, and other control messages use JSON in both modes.

### JSON and binary measurements

| Codec | Bytes per snapshot | Download per client, KB/s | Upload per client, KB/s | Encode + decode, µs |
|---|---:|---:|---:|---:|
| JSON | 10,575.7 | 317.27 | 3.01 | 173.3 |
| Binary (`DataView`) | 3,217.9 | 96.54 | 0.36 | 369.8 |

The benchmark ran in Node.js on 300 snapshots from a four-player simulation. Bandwidth figures are payload estimates at 30 snapshots and 30 inputs per second per client. In this benchmark, the binary format reduced snapshot size by about 70% and took longer to encode and decode.

Run the simulation and codec tests:

```powershell
node --test shared/test/simulation.test.ts shared/test/codec.test.ts
```

## Lab 4 — Node.js, WebSocket and Streams

This laboratory extends the single-player browser game
with a Node.js server, real-time communication, rooms,
chat, streaming match logs, and replay functionality.

## Technologies

- JavaScript (ES Modules)
- Node.js
- Vite
- WebSocket (`ws`)
- EventEmitter
- Node.js Streams
- Transform streams
- NDJSON
- Node.js built-in test runner

## Project structure

```text
dogfight/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── main.js
│   │   ├── connection.js
│   │   ├── online.js
│   │   ├── lobby.js
│   │   └── ...
│   └── vite.config.js
├── server/
│   ├── src/
│   │   ├── index.js
│   │   ├── config.js
│   │   ├── rooms.js
│   │   ├── protocol.js
│   │   ├── ws.js
│   │   ├── matchLogger.js
│   │   ├── replay.js
│   │   └── *.test.js
│   └── logs/
├── package.json
└── README.md
```

## Installation

Requirements:
- Node.js
- npm

Install dependencies from the project root:

```bash
npm install
```

## Development

Start the Node.js server:

```bash
npm run dev:server
```

In another terminal, start the Vite client:

```bash
npm run dev:client
```

Open:

http://127.0.0.1:5173/

Vite proxies `/api` and `/ws` requests to
the Node.js server.

## Production build

Build the client:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

Open:

http://127.0.0.1:3000/

The Node.js server serves the built client
from `client/dist`.

## Environment configuration

Supported environment variables:

- `PORT` — HTTP server port (default: 3000)
- `HOST` — HTTP server host (default: 127.0.0.1)
- `LOG_DIR` — directory for NDJSON logs

Example (PowerShell):

```powershell
$env:PORT = "3000"
$env:HOST = "127.0.0.1"
$env:LOG_DIR = "./server/logs"

npm start
```

## HTTP API

### Health check

GET `/health`

Returns the server health status.

### List rooms

GET `/api/rooms`

Returns available rooms and player counts.

### Create room

POST `/api/rooms`

Request:

```json
{
  "name": "My Room"
}
```

### List replays

GET `/api/replays`

Returns available NDJSON match recordings.

### Stream a replay

GET `/api/replays/:fileName`

Streams recorded events as NDJSON.

## WebSocket

Endpoint:

`ws://127.0.0.1:3000/ws`

All client messages contain protocol version 1.

### Join room

```json
{
  "version": 1,
  "type": "join",
  "room": "room-id",
  "name": "Player"
}
```

### Send chat

```json
{
  "version": 1,
  "type": "chat",
  "text": "Hello!"
}
```

### Leave room

```json
{
  "version": 1,
  "type": "leave"
}
```

## WebSocket reliability

The server provides:

- Message validation
- Maximum message size
- Chat length restrictions
- Join timeout
- Rate limiting
- Ping/pong heartbeat
- Slow-client buffer protection
- Graceful shutdown

The browser client provides:

- Automatic reconnection
- Exponential backoff
- Outgoing message queue
- Event-based message handling

## Match logging

Room events are recorded in NDJSON format.

Recorded events include:

- `join`
- `chat`
- `leave`

Each record contains a timestamp and room ID.

The implementation uses a Transform stream
and a streaming pipeline.

## Replay

Replay files are read incrementally using
file streams and async iteration.

The server streams NDJSON events to HTTP clients
without loading the entire recording into memory.

## Testing

Run all server tests:

```bash
node --test server/src/*.test.js
```

The HTTP API and WebSocket integration tests
require a running server.

The test suite currently contains 37 tests
covering protocol validation, rooms, API,
WebSocket communication, logging, and replay.

## Manual verification

1. Start the server and client.
2. Open the game in two browser windows.
3. Join the same room using different names.
4. Check that both names appear in the roster.
5. Send messages between the two clients.
6. Close both windows.
7. Check NDJSON files in the log directory.
8. Open `/api/replays`.
9. Stream one replay through its HTTP endpoint.

## Scope

Lab 4 implements room membership, chat,
network communication, and event logging.

Game-state synchronization and multiplayer
ship movement are outside the scope of Lab 4.

## Performance and reliability tests

### Streaming memory test

Run:

    node server/src/memoryTest.js

The test streamed 100,000 NDJSON events.

Measured results:
- Initial RSS: 60.61 MB
- RSS after 100,000 events: 70.66 MB
- Peak RSS: 71.98 MB
- Events processed: 100,000

The test demonstrates incremental processing without
loading the entire log file into memory.

### Slow WebSocket client test

Run:

    node server/src/slowClientTest.js

Measured results:
- Messages sent: 200
- Messages received: 200
- Sender disconnected during test: no
- Client bufferedAmount after resuming: 0

The receiver was temporarily paused during transmission.
All messages were received after reading resumed.

This test does not prove that the server's buffer limit
was reached. It verifies basic behavior under a
temporarily slow receiver.



# Space Dogfight

A browser-based space shooter built with JavaScript,
Canvas, Vite, and Node.js.

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

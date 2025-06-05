# j-queue-sdk-web

A TypeScript package to check WebSocket connection status and control web access by displaying a customizable full-screen popup when access is denied.

## Installation

Install the package via npm:

```bash
npm install j-queue-sdk-web
```

Ensure you have Socket.IO client included in your project:

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
```

## Usage

1. Import and initialize the package:

```typescript
import ConnectionChecker from 'j-queue-sdk-web';

ConnectionChecker.init({
  url: 'wss://demo-websocket.example.com',
  socketConfig: {
    transports: ['websocket'],
    reconnectionAttempts: 3
  },
  popupConfig: {
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      z-index: 10000;
      display: flex;
      justify-content: center;
      align-items: center;
      color: #fff;
      font-family: Helvetica, sans-serif;
      font-size: 28px;
    `,
    content: (position: number | undefined) => `
      <div>
        <h1>Access Restricted</h1>
        <p>Position: ${position ?? 'N/A'}</p>
        <p>Please wait...</p>
      </div>
    `
  },
  customEvents: {
    'custom-event': (data, { createPopup, removePopup }) => {
      console.log('Custom event received:', data);
      if (data.message) {
        createPopup(data.message);
      }
    }
  }
});
```

Or, in a browser environment:

```html
<script src="node_modules/j-queue-sdk-web/dist/j-queue-sdk-web.js"></script>
<script>
  ConnectionChecker.init({
    url: 'wss://demo-websocket.example.com',
    popupConfig: {
      style: 'background: rgba(0, 0, 0, 0.7); ...',
      content: (position) => `<div>Position: ${position}</div>`
    }
  });
</script>
```

## Configuration Options

- `url` (string): WebSocket server URL (default: `wss://demo-websocket.example.com`).
- `socketConfig` (object): Socket.IO configuration options (default: `{ transports: ['websocket'], reconnectionAttempts: 3 }`).
- `popupConfig` (object):
  - `style` (string): Custom CSS for the popup.
  - `content` (string or function): Custom HTML content for the popup. Can be a string or a function that takes `position` as an argument and returns HTML.
- `customEvents` (object): Key-value pairs where the key is the event name and the value is a handler function. The handler receives the event `data` and an object with utilities `{ createPopup, removePopup, preventNavigation, allowNavigation }`.

## Features

- Connects to a specified WebSocket server.
- Receives `{uuid: string, position: number, allow: boolean}` from the server.
- If `allow === true`, allows normal web access.
- If `allow === false`, displays a customizable full-screen popup with the current `position` and prevents navigation.
- Listens for real-time `position-update` events to update the popup or restore access.
- Handles custom WebSocket events via `customEvents`.
- Handles connection errors and disconnections gracefully.

## Development

### Build

```bash
npm run build
```

This will compile TypeScript to JavaScript and bundle the package into `dist/j-queue-sdk-web.js` using Webpack.

### Test

```bash
npm test
```

Tests are written using Jest and run in a jsdom environment.

## License

MIT
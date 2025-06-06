# @joi.nguyen/j-queue-sdk-web

A TypeScript package to check WebSocket connection status and control web access by displaying a customizable full-screen popup when access is denied.

## Installation

Install the package via npm:

```bash
npm install @joi.nguyen/j-queue-sdk-web
```

Ensure you have Socket.IO client included in your project:

```bash
npm install socket.io-client
```

For browser environments, include the Socket.IO client script:

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
```

## Usage

### Usage in JavaScript/TypeScript

1. Import and initialize the package:

```typescript
import ConnectionJQueueSdkWeb from '@joi.nguyen/j-queue-sdk-web';

ConnectionJQueueSdkWeb.init({
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
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script src="node_modules/@joi.nguyen/j-queue-sdk-web/dist/connection-checker.js"></script>
<script>
  ConnectionJQueueSdkWeb.init({
    url: 'wss://demo-websocket.example.com',
    popupConfig: {
      style: 'background: rgba(0, 0, 0, 0.7); ...',
      content: (position) => `<div>Position: ${position}</div>`
    }
  });
</script>
```

### Usage in ReactJS

To use `@joi.nguyen/j-queue-sdk-web` in a ReactJS application, initialize the WebSocket connection in a component using the `useEffect` hook to manage the connection lifecycle. Below is an example:

1. Install the package and dependencies in your React project:

```bash
npm install @joi.nguyen/j-queue-sdk-web socket.io-client
```

2. Create a component to initialize the WebSocket connection:

```tsx
import { useEffect } from 'react';
import ConnectionJQueueSdkWeb from '@joi.nguyen/j-queue-sdk-web';

const WebSocketComponent = () => {
  useEffect(() => {
    // Initialize WebSocket connection
    const connection = ConnectionJQueueSdkWeb.init({
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
        'custom-event': (data, { createPopup }) => {
          console.log('Custom event received:', data);
          if (data.message) {
            createPopup(data.message);
          }
        }
      }
    });

    // Cleanup on component unmount
    return () => {
      connection.disconnect();
    };
  }, []);

  return <div>Your React App Content</div>;
};

export default WebSocketComponent;
```

3. Use the component in your app:

```tsx
import WebSocketComponent from './WebSocketComponent';

function App() {
  return (
    <div>
      <h1>My React App</h1>
      <WebSocketComponent />
    </div>
  );
}

export default App;
```

#### Notes for ReactJS Usage:
- The `useEffect` hook ensures the WebSocket connection is initialized when the component mounts and disconnected when it unmounts, preventing memory leaks.
- Customize the `popupConfig` and `customEvents` as needed to fit your application's UI and requirements.
- Ensure the WebSocket server at `wss://demo-websocket.example.com` supports the required events (`connection-status`, `position-update`) and data format `{uuid: string, position: number, allow: boolean}`.

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

This will compile TypeScript to JavaScript and bundle the package into `dist/connection-checker.js` using Webpack.

### Test

```bash
npm test
```

Tests are written using Jest and run in a jsdom environment.

## License

MIT
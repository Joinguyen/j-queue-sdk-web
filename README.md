
Run this command in your project directory, and it will create a `README.md` file with the exact content.

#### Option 3: Command Line (Windows PowerShell)
For Windows users, you can use the following PowerShell command:

```powershell
@"
# @joi.nguyen/j-queue-sdk-web

A TypeScript package for managing WebSocket connections and controlling web access by displaying a customizable full-screen popup when users are in a queue. It integrates with a WebSocket server to handle queue status updates and navigation restrictions.

## Installation

Install the package via npm:

\`\`\`bash
npm install @joi.nguyen/j-queue-sdk-web
\`\`\`

Ensure you have the Socket.IO client included in your project:

\`\`\`bash
npm install socket.io-client
\`\`\`

For browser environments, include the Socket.IO client script:

\`\`\`html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
\`\`\`

## Usage

### Usage in JavaScript/TypeScript

1. Import and initialize the package:

\`\`\`typescript
import ConnectionJQueueSdkWeb from '@joi.nguyen/j-queue-sdk-web';

const connection = ConnectionJQueueSdkWeb.init({
  url: 'wss://queue-server.example.com',
  socketConfig: {
    transports: ['websocket'],
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
    query: {
      app_id: '1',
      service_name: 'news',
      ip_address: '192.168.1.1',
    },
  },
  popupConfig: {
    language: 'en', // or 'ko' for Korean
    style: \`
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.9);
      z-index: 10000;
      display: flex;
      justify-content: center;
      align-items: center;
      color: #fff;
      font-family: Arial, sans-serif;
      font-size: 28px;
    \`,
    content: (position: number) => \`
      <div style="text-align: center;">
        <h1>Waiting in Queue</h1>
        <p>Position: \${position}</p>
        <p>Please wait...</p>
      </div>
    \`,
  },
  customEvents: {
    'custom-event': (data, { createPopup, removePopup }) => {
      console.log('Custom event received:', data);
      if (data?.message) {
        createPopup(\`<div>\${data.message}</div>\`);
      }
    },
  },
  pollInterval: 2000,
});

// Disconnect when done
connection.disconnect();
\`\`\`

Or, in a browser environment:

\`\`\`html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script src="node_modules/@joi.nguyen/j-queue-sdk-web/dist/j-queue-sdk-web.js"></script>
<script>
  ConnectionJQueueSdkWeb.init({
    url: 'wss://queue-server.example.com',
    popupConfig: {
      language: 'en',
      content: (position) => \`<div>Queue Position: \${position}</div>\`,
    },
  });
</script>
\`\`\`

### Usage in React

To use `@joi.nguyen/j-queue-sdk-web` in a React application, initialize the WebSocket connection in a component using the `useEffect` hook to manage the connection lifecycle. Below is an example:

1. Install the package and dependencies in your React project:

\`\`\`bash
npm install @joi.nguyen/j-queue-sdk-web socket.io-client
\`\`\`

2. Create a component to initialize the WebSocket connection:

\`\`\`tsx
import { useEffect, useState } from 'react';
import ConnectionJQueueSdkWeb from '@joi.nguyen/j-queue-sdk-web';

const WebSocketComponent = () => {
  const [ipAddress, setIpAddress] = useState('');

  useEffect(() => {
    const fetchIpAddress = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        setIpAddress(data.ip);
      } catch (error) {
        console.error('Error fetching IP address:', error);
        setIpAddress('unknown');
      }
    };
    fetchIpAddress();
  }, []);

  useEffect(() => {
    if (!ipAddress) return;

    const connection = ConnectionJQueueSdkWeb.init({
      url: 'wss://queue-server.example.com',
      socketConfig: {
        transports: ['websocket'],
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        query: {
          app_id: '1',
          service_name: 'news',
          ip_address: ipAddress,
        },
      },
      popupConfig: {
        language: 'en',
        content: (position: number) => \`
          <div style="text-align: center;">
            <h1>Waiting in Queue</h1>
            <p>Position: \${position}</p>
            <p>Please wait...</p>
          </div>
        \`,
      },
      customEvents: {
        'custom-event': (data, { createPopup }) => {
          console.log('Custom event received:', data);
          if (data?.message) {
            createPopup(\`<div>\${data.message}</div>\`);
          }
        },
      },
    });

    return () => {
      connection.disconnect();
    };
  }, [ipAddress]);

  return null;
};

export default WebSocketComponent;
\`\`\`

3. Use the component in your app:

\`\`\`tsx
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
\`\`\`

#### Notes for React Usage:
- The `useEffect` hook ensures the WebSocket connection is initialized on mount and disconnected on unmount, preventing memory leaks.
- The `ipAddress` state is used to pass client information to the WebSocket server via `socketConfig.query`.
- Customize `popupConfig` and `customEvents` to match your application's UI and requirements.
- Ensure the WebSocket server supports the `online-queue:status` event with the data format `{ data: { uuid: string, position: number, status: number } }`.

## Configuration Options

- `url` (string, required): WebSocket server URL (e.g., `wss://queue-server.example.com`).
- `socketConfig` (object, optional): Socket.IO configuration options.
  - `transports` (string[]): Transport methods (default: `['websocket']`).
  - `reconnectionAttempts` (number): Number of reconnection attempts (default: `3`).
  - `reconnectionDelay` (number): Delay between reconnection attempts in milliseconds (default: `1000`).
  - `query` (object): Additional query parameters sent to the server (e.g., `{ app_id: '1', service_name: 'news' }`).
- `popupConfig` (object, optional):
  - `language` ('en' | 'ko'): Language for default popup content (default: `'ko'`).
  - `style` (string): Custom CSS for the popup.
  - `content` (string | (position: number) => string): Custom HTML content for the popup, either as a static string or a function that takes `position` and returns HTML.
- `customEvents` (object, optional): Key-value pairs where the key is the event name and the value is a handler function. The handler receives event `data` and utilities `{ createPopup, removePopup, preventNavigation, allowNavigation }`.
- `pollInterval` (number, optional): Interval for polling queue status in milliseconds (default: `2000`).

## Features

- Connects to a WebSocket server to monitor queue status.
- Receives `{ data: { uuid: string, position: number, status: number } }` from the server via the `online-queue:status` event.
- If `status === 2` (ACTIVE), removes the popup and allows navigation.
- If `status === 1` (WAITING), displays a customizable full-screen popup with the queue `position` and prevents navigation.
- Supports custom WebSocket events via `customEvents`.
- Provides utilities (`createPopup`, `removePopup`, `preventNavigation`, `allowNavigation`) for custom event handlers.
- Handles connection errors and disconnections gracefully.
- Includes default popup styling with a loading animation and multilingual support (English and Korean).

## Development

### Build

Compile TypeScript and bundle the package using Webpack:

\`\`\`bash
npm run build
\`\`\`

This generates `dist/j-queue-sdk-web.js`.

### Test

Run tests using Jest in a jsdom environment:

\`\`\`bash
npm test
\`\`\`

Tests are located in the `tests` directory and cover initialization, event handling, and disconnection logic.

## Security Note

The default popup content uses direct HTML injection (`innerHTML`). For production use, consider integrating a library like `DOMPurify` to sanitize HTML and prevent XSS attacks.

## License

MIT

## Repository

- **GitHub**: [https://github.com/Joinguyen/j-queue-sdk-web](https://github.com/Joinguyen/j-queue-sdk-web)
- **Issues**: [https://github.com/Joinguyen/j-queue-sdk-web/issues](https://github.com/Joinguyen/j-queue-sdk-web/issues)
"@ | Out-File -FilePath README.md -Encoding utf8
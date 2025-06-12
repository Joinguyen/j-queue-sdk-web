# j-queue-sdk-web

A TypeScript package for managing Socket.IO connections and controlling web access by displaying a customizable full-screen popup when users are in a queue. It integrates with a Socket.IO server to handle queue status updates and navigation restrictions.

## Installation

Install the package and `socket.io-client` via npm:

```bash
npm install j-queue-sdk-web socket.io-client
```

For browser usage, include the Socket.IO client and the `j-queue-sdk-web` scripts:

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script src="https://unpkg.com/j-queue-sdk-web@latest/dist/j-queue-sdk-web.js"></script>
```

## Usage

### Usage in Browser with `<script>`

Initialize the SDK after including the scripts:

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script src="https://unpkg.com/j-queue-sdk-web@latest/dist/j-queue-sdk-web.js"></script>
<script>
  try {
    // Handle default export
    const JQueueSdk = window.ConnectionJQueueSdkWeb.default || window.ConnectionJQueueSdkWeb;
    const connection = JQueueSdk.init({
      wsUrl: 'wss://queue-server.example.com', // Socket.IO server URL
      apiUrl: 'https://api.example.com', // API server URL (optional)
      option: {
        storageTokenKey: 'queue_token',
        storageConnectKey: 'connect_key'
      },
      socketConfig: {
        query: {
          connect_key: 'CONNECT_KEY' // Replace with actual connect key
        },
        transports: ['websocket'],
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
      },
      popupConfig: {
        language: 'en', // 'en' or 'ko'
        textColor: '#276bff',
        loaderGradientStart: '#276bff',
        loaderGradientEnd: 'rgba(39,107,255,0.05)',
      },
      customEvents: {
        'online-queue:status': (data, utils) => {
          console.log('Queue status:', data);
        },
      },
    });

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      connection.disconnect();
    });
  } catch (error) {
    console.error('Error initializing j-queue-sdk-web:', error);
  }
</script>
```

### Notes
- **Default Export**: The script exports `ConnectionJQueueSdkWeb` as `ConnectionJQueueSdkWeb.default`. The code handles both cases for compatibility.
- **Error Handling**: Use `onerror` on the script tag and try-catch to handle initialization errors.
- **Leave Request**: If `apiUrl` is provided, the SDK sends a `navigator.sendBeacon` request to the `/leave` endpoint with a JSON payload (`{"uuid": "..."}`) on disconnect or navigation.
- **Session Storage**: The SDK stores the queue UUID in `sessionStorage` using `storageTokenKey` and the `connect_key` (from `socketConfig.query`) using `storageConnectKey` to ensure continuity across page reloads.

## Configuration Options

- `wsUrl` (string, required): Socket.IO server URL (e.g., `wss://queue-server.example.com`).
- `apiUrl` (string, optional): API server URL for HTTP requests (e.g., `https://api.example.com`). Required for sending `/leave` requests.
- `option` (object, optional): Additional configuration options for the SDK.
  - `storageTokenKey` (string): Key used to store the queue UUID in `sessionStorage` (default: `'queue_token'`).
  - `storageConnectKey` (string): Key used to store the `connect_key` from `socketConfig.query` in `sessionStorage` (default: `'connect_key'`).
- `socketConfig` (object, optional): Socket.IO configuration options.
  - `query` (object): Additional query parameters sent to the Socket.IO server (e.g., `{ connect_key: 'CONNECT_KEY' }`).
  - `transports` (string[]): Transport methods (e.g., `['websocket']`). Defaults to `['websocket']`.
  - `reconnectionAttempts` (number): Number of reconnection attempts (e.g., `3`). Defaults to `3`.
  - `reconnectionDelay` (number): Delay between reconnection attempts in milliseconds (e.g., `1000`). Defaults to `1000`.
- `popupConfig` (object, optional):
  - `language` ('en' | 'ko'): Language for default popup content (default: `'ko'`).
  - `style` (string): Custom CSS for the popup.
  - `content` (string | (position: number) => string): Custom HTML content for the popup, either as a static string or a function that takes `position` and returns HTML.
  - `textColor` (string): Color for the popup text (e.g., `'#276bff'`).
  - `loaderGradientStart` (string): Starting color of the loader gradient (e.g., `'#276bff'`).
  - `loaderGradientEnd` (string): Ending color of the loader gradient (e.g., `'rgba(39,107,255,0.05)'`).
- `customEvents` (object, optional): Key-value pairs where the key is the event name and the value is a handler function. The handler receives event `data` and utilities `{ createPopup, removePopup, preventNavigation, allowNavigation }`.

## Features

- Connects to a Socket.IO server to monitor queue status.
- Receives `{ uuid: string, position: number, status: OnlineQueueStatus }` from the Socket.IO server via the `online-queue:status` event.
- Handles queue status updates:
  - `ACTIVE`: Removes the popup, allows navigation, and emits `online-queue:check-disconnected` every 30 seconds to maintain connection status.
  - `WAITING`: Displays a customizable full-screen popup with the queue `position`, prevents navigation, and emits `online-queue:status` at an interval of 2000ms (adjusted by `(position / 100) * 1000`ms for positions >= 100).
  - `EMPTY`: Logs an error (`'[j-queue-sdk-web] - Connect key does not exist!'`) to the console and clears any active intervals, taking no further UI or navigation actions.
- Supports custom Socket.IO events via `customEvents`.
- Provides utilities (`createPopup`, `removePopup`, `preventNavigation`, `allowNavigation`) for custom event handlers.
- Handles connection errors and disconnections with reconnection logic (default: 3 attempts, 1000ms delay).
- Includes default popup styling with a loading animation and multilingual support (English and Korean).
- Sends periodic `online-queue:status` messages for `WAITING` state to maintain queue position.
- Stores `connect_key` in `sessionStorage` for continuity.
- Uses `navigator.sendBeacon` to notify the server with a JSON payload when leaving the queue (if `apiUrl` is provided).

## Development

### Build

Compile TypeScript and bundle the package using Webpack:

```bash
npm run build
```

This generates `dist/j-queue-sdk-web.js`.

### Test

Run tests using Jest in a jsdom environment:

```bash
npm test
```

Tests are located in the `tests` directory and cover initialization, status handling, socket events, disconnection, and listener management, with mocked Socket.IO connections.

## Security Note

The default popup content uses direct HTML injection (`innerHTML`). For production use, consider integrating a library like `DOMPurify` to sanitize HTML and prevent XSS attacks.

## License

MIT

## Repository

- **GitHub**: [https://github.com/joinguyen/j-queue-sdk-web](https://github.com/joinguyen/j-queue-sdk-web)
- **Issues**: [https://github.com/joinguyen/j-queue-sdk-web/issues](https://github.com/joinguyen/j-queue-sdk-web/issues)
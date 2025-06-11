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
<script src="https://unpkg.com/j-queue-sdk-web@<version>/dist/j-queue-sdk-web.js"></script>
```

## Usage

### Usage in Browser with `<script>`

Initialize the SDK after including the scripts:

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script src="https://unpkg.com/j-queue-sdk-web@<version>/dist/j-queue-sdk-web.js"></script>
<script>
  try {
    // Handle default export
    const JQueueSdk = window.ConnectionJQueueSdkWeb.default || window.ConnectionJQueueSdkWeb;
    const connection = JQueueSdk.init({
      wsUrl: 'wss://queue-server.example.com', // Socket.IO server URL
      apiUrl: 'https://api.example.com', // API server URL
      option: { storageKey: 'queue_token' },
      socketConfig: {
        query: {
          app_id: 'XXXXX', // Replace with actual App id
          service_name: 'NEWS', // Replace with actual Service name
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
      pollInterval: 1000, // Poll interval in milliseconds
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
- **Default Export**: The script exports `ConnectionJQueueSdkWeb` as `ConnectionJQueueSdkWeb.default`. The code handles both cases.
- **Error Handling**: Use `onerror` on the script tag and try-catch to handle errors.
- **Leave Request**: The SDK automatically sends a `navigator.sendBeacon` request to the `/leave` endpoint with a JSON payload (`{"uuid": "..."}`) on disconnect or navigation.

## Configuration Options

- `wsUrl` (string, required): Socket.IO server URL (e.g., `wss://queue-server.example.com`).
- `apiUrl` (string, required): API server URL for HTTP requests (e.g., `https://api.example.com`).
- `option` (object, optional): Additional configuration options for the SDK.
  - `storageKey` (string): The key used to store the UUID in `sessionStorage` for persisting queue session data (e.g., `'queue_token'`). This allows the SDK to retrieve the UUID across page reloads, ensuring continuity in queue tracking.
- `socketConfig` (object, optional): Socket.IO configuration options.
  - `query` (object): Additional query parameters sent to the Socket.IO server (e.g., `{ app_id: 'XXXXX', service_name: 'NEWS' }`).
  - `transports` (string[]): Transport methods (e.g., `['websocket']`). Defaults to `['websocket']`.
  - `reconnectionAttempts` (number): Number of reconnection attempts (e.g., `3`). Defaults to `3`.
  - `reconnectionDelay` (number): Delay between reconnection attempts in milliseconds (e.g., `1000`). Defaults to `1000`.
- `popupConfig` (object, optional):
  - `language` ('en' | 'ko'): Language for default popup content (default: `'ko'`).
  - `style` (string): Custom CSS for the popup.
  - `content` (string | (position: number) => string): Custom HTML content for the popup, either as a static string or a function that takes `position` and returns HTML.
  - `textColor` (string): Color for the popup text (e.g., `'#276bff'`). Overrides the default text color.
  - `loaderGradientStart` (string): Starting color of the loader gradient (e.g., `'#276bff'`). Defines the initial color of the loading animation.
  - `loaderGradientEnd` (string): Ending color of the loader gradient (e.g., `'rgba(39,107,255,0.05)'`). Defines the final color of the loading animation.
- `customEvents` (object, optional): Key-value pairs where the key is the event name and the value is a handler function. The handler receives event `data` and utilities `{ createPopup, removePopup, preventNavigation, allowNavigation }`.
- `pollInterval` (number, optional): Interval for polling queue status in milliseconds (default: `1000`). The interval adjusts dynamically based on queue position (adds `(position / 100) * 1000`ms for positions >= 100).

## Features

- Connects to a Socket.IO server to monitor queue status.
- Makes HTTP API calls to `/join`, `/status`, and `/leave` endpoints.
- Receives `{ data: { uuid: string, position: number, status: string } }` from the Socket.IO server via the `online-queue:status` event.
- If `status === 'ACTIVE'`, removes the popup and allows navigation.
- If `status === 'WAITING'`, displays a customizable full-screen popup with the queue `position` and prevents navigation.
- Supports custom Socket.IO events via `customEvents`.
- Provides utilities (`createPopup`, `removePopup`, `preventNavigation`, `allowNavigation`) for custom event handlers.
- Handles connection errors and disconnections gracefully with reconnection logic.
- Includes default popup styling with a loading animation and multilingual support (English and Korean).
- Sends periodic `online-queue:set-ttl` messages to maintain queue position.
- Uses `navigator.sendBeacon` to notify the server with a JSON payload when leaving the queue.

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

Tests are located in the `tests` directory and cover initialization, event handling, polling, and disconnection logic, with mocked Socket.IO connections.

## Security Note

The default popup content uses direct HTML injection (`innerHTML`). For production use, consider integrating a library like `DOMPurify` to sanitize HTML and prevent XSS attacks.

## License

MIT

## Repository

- **GitHub**: [https://github.com/Joinguyen/j-queue-sdk-web](https://github.com/Joinguyen/j-queue-sdk-web)
- **Issues**: [https://github.com/Joinguyen/j-queue-sdk-web/issues](https://github.com/Joinguyen/j-queue-sdk-web/issues)
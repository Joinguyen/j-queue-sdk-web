# j-queue-sdk-web

A TypeScript package for managing WebSocket connections and controlling web access by displaying a customizable full-screen popup when users are in a queue. It integrates with a WebSocket server to handle queue status updates and navigation restrictions using the native WebSocket API.

## Installation

Install the package via npm:

```bash
npm install j-queue-sdk-web
```

No additional WebSocket libraries are required, as the SDK uses the browser's native WebSocket API.

## Usage

### Usage in Browser with `<script>`

Include the `j-queue-sdk-web` script in your HTML and initialize it:

```html
<script src="https://unpkg.com/j-queue-sdk-web@<version>/dist/j-queue-sdk-web.js"></script>
<script>
  try {
    // Handle default export
    const JQueueSdk = window.ConnectionJQueueSdkWeb.default || window.ConnectionJQueueSdkWeb;
    const connection = JQueueSdk.init({
      wsUrl: 'wss://queue-server.example.com', // WebSocket server URL
      apiUrl: 'https://api.example.com', // API server URL
      option: { storageKey: 'queue_token' },
      socketConfig: {
        query: {
          app_id: 'XXXXX', // Replace with actual App id
          service_name: 'NEWS',  // Replace with actual Service name
        },
      },
      popupConfig: {
        language: 'en', // 'en' or 'ko'
        textColor: '#276bff',
        loaderGradientStart: '#276bff',
        loaderGradientEnd: 'rgba(39,107,255,0.05)',
      },
      customEvents: {
        disconnect: (data, utils) => {
          const queue_token = sessionStorage.getItem('queue_token') || '';
          if (queue_token) {
            const beaconData = JSON.stringify({
              uuid: queue_token,
              app_id: 'XXXXX',
              service_name: 'NEWS',
            });
            const blob = new Blob([beaconData], { type: 'application/json' });
            navigator.sendBeacon('https://example.com/log-disconnect', blob);
          }
        },
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
- **Beacon**: Update the `navigator.sendBeacon` URL (`https://example.com/log-disconnect`) to your actual endpoint.

## Configuration Options

- `wsUrl` (string, required): WebSocket server URL (e.g., `wss://queue-server.example.com`).
- `apiUrl` (string, required): API server URL for HTTP requests (e.g., `https://api.example.com`).
- `option` (object, optional): Additional configuration options for the SDK.
  - `storageKey` (string): The key used to store the UUID in `sessionStorage` for persisting queue session data (e.g., `'queue_token'`). This allows the SDK to retrieve the UUID across page reloads, ensuring continuity in queue tracking.
- `socketConfig` (object, optional): WebSocket configuration options.
  - `query` (object): Additional query parameters sent to the WebSocket server (e.g., `{ app_id: 'XXXXX', service_name: 'NEWS' }`).
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

- Connects to a WebSocket server using the native WebSocket API to monitor queue status.
- Makes HTTP API calls to join, check status, and leave the queue.
- Receives `{ data: { uuid: string, position: number, status: string } }` from the WebSocket server via the `online-queue:status` event.
- If `status === 'ACTIVE'`, removes the popup and allows navigation.
- If `status === 'WAITING'`, displays a customizable full-screen popup with the queue `position` and prevents navigation.
- Supports custom WebSocket events via `customEvents`.
- Provides utilities (`createPopup`, `removePopup`, `preventNavigation`, `allowNavigation`) for custom event handlers.
- Handles connection errors and disconnections gracefully.
- Includes default popup styling with a loading animation and multilingual support (English and Korean).
- Sends periodic `online-queue:set-ttl` messages to maintain queue position.
- Uses `navigator.sendBeacon` to notify the server when leaving the queue.

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

Tests are located in the `tests` directory and cover initialization, event handling, polling, and disconnection logic.

## Security Note

The default popup content uses direct HTML injection (`innerHTML`). For production use, consider integrating a library like `DOMPurify` to sanitize HTML and prevent XSS attacks.

## License

MIT

## Repository

- **GitHub**: [https://github.com/Joinguyen/j-queue-sdk-web](https://github.com/Joinguyen/j-queue-sdk-web)
- **Issues**: [https://github.com/Joinguyen/j-queue-sdk-web/issues](https://github.com/Joinguyen/j-queue-sdk-web/issues)
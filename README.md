## J-Queue SDK Web

The J-Queue SDK Web is a JavaScript library for managing online queue systems in web applications. It provides a seamless integration with a WebSocket-based queue service, displaying a customizable popup UI to inform users about their queue status.

## Features

- **Real-time Queue Management**: Connects to a WebSocket server to receive real-time updates on queue position and status.
- **Customizable Popup UI**: Displays a loading or queue position popup with customizable styles, colors, and languages (English and Korean).
- **Navigation Control**: Prevents navigation during queue wait to ensure users don't lose their place.
- **Session Storage**: Persists queue tokens and connect keys in `sessionStorage` for continuity.
- **Script Tag Configuration**: Supports initialization via `data-*` attributes on the script tag for easy setup.
- **Event Listeners**: Allows adding listeners for queue status updates.
- **Custom Events**: Supports handling custom WebSocket events with utility functions.

## Installation

Install the SDK via npm:

```bash
npm install j-queue-sdk-web
```

Or include it directly in your HTML using a CDN (replace `x.x.x` with the desired version):

```html
<script src="https://unpkg.com/j-queue-sdk-web@<version>/dist/j-queue-sdk-web.js"></script>
```

## Usage

### Programmatic Initialization

Import and initialize the SDK in your JavaScript/TypeScript code:

```typescript
import ConnectionJQueueSdkWeb from 'j-queue-sdk-web';

const config = {
  wsUrl: 'https://api-extra-queue.pressai.kr',
  apiUrl: 'https://api-extra-queue.pressai.kr',
  socketConfig: {
    query: { connect_key: 'your_connect_key' },
  },
  popupConfig: {
    isShowLoadingOnConnect: true,
    language: 'en',
    textColor: '#276bff',
    loaderGradientStart: '#276bff',
    loaderGradientEnd: 'rgba(39,107,255,0.05)',
  },
};

ConnectionJQueueSdkWeb.init(config)
  .then(({ disconnect }) => {
    console.log('J-Queue SDK initialized');
    // Store disconnect function for later use
  })
  .catch((error) => {
    console.error('Initialization failed:', error);
  });

// Add a status listener
ConnectionJQueueSdkWeb.addStatusListener((status) => {
  console.log('Queue status:', status);
});
```

### Script Tag Initialization

Include the SDK script with `data-*` attributes to auto-initialize:

```html
<script
  src="https://unpkg.com/j-queue-sdk-web@<version>/dist/j-queue-sdk-web.js"
  data-ws-url="https://api-extra-queue.pressai.kr"
  data-api-url="https://api-extra-queue.pressai.kr"
  data-connect-key="your_connect_key"
  data-show-loading="true"
  data-language="ko"
  data-mode="prod" 
  data-text-color="#276bff"
  data-loader-gradient-start="#276bff"
  data-loader-gradient-end="rgba(39,107,255,0.05)"
></script>
```

The SDK will automatically initialize using these attributes when the script loads.

### Configuration Options

The `InitConfig` interface defines the configuration options:

- `wsUrl`: WebSocket URL (default: `https://api-extra-queue.pressai.kr` for prod, `https://dev-api-extra-queue.pressai.kr` for dev).
- `apiUrl`: API URL for operations like leaving the queue.
- `socketConfig`: Socket.IO configuration.
  - `query`: Query parameters (e.g., `{ connect_key: 'your_key' }`).
  - `transports`: Transport methods (default: `['websocket']`).
  - `reconnectionAttempts`: Number of reconnection attempts (default: 3).
  - `reconnectionDelay`: Delay between reconnections (default: 1000ms).
- `popupConfig`: Popup UI configuration.
  - `content`: Custom HTML or a function returning HTML based on queue position.
  - `language`: `'en'` or `'ko'` (default: `'ko'`).
  - `textColor`: Text color for popup content.
  - `loaderGradientStart`: Starting color for loader gradient.
  - `loaderGradientEnd`: Ending color for loader gradient.
  - `style`: Custom CSS for the popup.
  - `isShowLoadingOnConnect`: Show loading popup during connection (default: `false`).
- `customEvents`: Handlers for custom WebSocket events.
- `option`: Storage key settings.
  - `storageTokenKey`: `sessionStorage` key for queue token (default: `'queue_token'`).
  - `storageConnectKey`: `sessionStorage` key for connect key (default: `'connect_key'`).

### Methods

- `init(config: InitConfig)`: Initializes the SDK. Returns a promise resolving to an object with a `disconnect` method.
- `addStatusListener(listener)`: Adds a callback to receive queue status updates.
- `removeStatusListener(listener)`: Removes a status listener.
- `getQueueStatus()`: Returns the current queue status (`{ uuid, position, status }` or `null`).
- `initFromScriptAttributes()`: Initializes the SDK using script tag attributes (called automatically on load).

### Queue Statuses

Defined in the `OnlineQueueStatus` enum:

- `WAITING` (1): User is waiting in the queue.
- `ACTIVE` (2): User is active and can proceed.
- `EMPTY` (3): Queue is empty or connect key is invalid.

## Development

### Prerequisites

- Node.js >= 14
- npm >= 6

### Setup

```bash
git clone <repository-url>
cd j-queue-sdk-web
npm install
```

### Running Tests

The SDK includes unit tests using Jest. Run them with:

```bash
npm test
```

### Building

To build the SDK:

```bash
npm run build
```

## Contributing

Contributions are welcome! Please submit a pull request or open an issue to discuss changes.

## License

MIT

## Repository

- **GitHub**: [https://github.com/joinguyen/j-queue-sdk-web](https://github.com/joinguyen/j-queue-sdk-web)
- **Issues**: [https://github.com/joing-sdk-web/j-queue-sdk-web/issues](https://github.com/joing-sdk/j-queue-sdk-web/issues)

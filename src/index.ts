import { Socket, io } from 'socket.io-client';

interface ConnectionData {
  uuid: string;
  position: number;
  allow: boolean;
}

interface PopupConfig {
  style?: string;
  content?: string | ((position: number | undefined) => string);
}

interface CustomEventHandlers {
  [key: string]: (data: any, utils: {
    createPopup: (position: number | undefined) => void;
    removePopup: () => void;
    preventNavigation: () => void;
    allowNavigation: () => void;
  }) => void;
}

interface ConnectionJQueueSdkWebOptions {
  url?: string;
  socketConfig?: any; // Socket.Options
  popupConfig?: PopupConfig;
  customEvents?: CustomEventHandlers;
}

interface ConnectionJQueueSdkWebResult {
  disconnect: () => void;
  reconnect: () => void;
  socket: Socket;
}

/**
 * Initialize WebSocket connection checker
 * @param options Configuration options
 * @returns Connection checker methods
 */
function initConnectionJQueueSdkWeb(options: ConnectionJQueueSdkWebOptions = {}): ConnectionJQueueSdkWebResult | { error: string } {
  const defaultUrl = 'wss://demo-websocket.example.com';
  const defaultPopupConfig: any = { // PopupConfig
    style: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 9999;
      display: flex;
      justify-content: center;
      align-items: center;
      color: white;
      font-family: Arial, sans-serif;
      font-size: 24px;
      text-align: center;
    `,
    content: (position: number | undefined) => `
      <div>
        <h2>Access Denied</h2>
        <p>Your current position: ${position ?? 'Unknown'}</p>
        <p>Please wait for access permission</p>
      </div>
    `
  };

  const {
    url = defaultUrl,
    socketConfig = { transports: ['websocket'], reconnectionAttempts: 3 },
    popupConfig = defaultPopupConfig,
    customEvents = {}
  } = options;

  // Check if Socket.IO client is available
  if (typeof io === 'undefined') {
    console.error('Socket.IO client is required for j-queue-sdk-web');
    return { error: 'Socket.IO not found' };
  }

  // Check if running in a browser environment
  if (typeof document === 'undefined') {
    console.error('j-queue-sdk-web requires a browser environment');
    return { error: 'Browser environment required' };
  }

  // Create popup container
  function createPopup(position: number | undefined): void {
    removePopup(); // Remove any existing popup
    const popup: any = document.createElement('div');
    popup.id = 'j-queue-sdk-web';
    popup.style.cssText = popupConfig.style ?? defaultPopupConfig.style;
    popup.innerHTML = typeof popupConfig.content === 'function'
      ? popupConfig.content(position)
      : popupConfig.content ?? defaultPopupConfig.content(position);
    document.body.appendChild(popup);
  }

  // Remove popup
  function removePopup(): void {
    const popup = document.getElementById('j-queue-sdk-web');
    if (popup) popup.remove();
  }

  // Prevent navigation
  function preventNavigation(): void {
    window.addEventListener('click', preventDefaultAction, true);
    window.addEventListener('popstate', preventDefaultAction, true);
  }

  // Allow navigation
  function allowNavigation(): void {
    window.removeEventListener('click', preventDefaultAction, true);
    window.removeEventListener('popstate', preventDefaultAction, true);
  }

  // Prevent default navigation actions
  function preventDefaultAction(e: Event): void {
    if ((e.target as HTMLElement).tagName === 'A' || e.type === 'popstate') {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Handle connection status
  function handleConnectionStatus(data: ConnectionData): void {
    if (!data || typeof data.allow !== 'boolean') {
      console.error('Invalid data received:', data);
      createPopup(undefined);
      preventNavigation();
      return;
    }

    const { allow, position } = data;
    if (allow) {
      removePopup();
      allowNavigation();
    } else {
      createPopup(position);
      preventNavigation();
    }
  }

  // Initialize socket
  const socket: Socket = io(url, socketConfig);

  // Handle default WebSocket events
  socket.on('connect', () => {
    console.log(`Connected to WebSocket server at ${url}`);
  });

  socket.on('connection-status', handleConnectionStatus);
  socket.on('position-update', handleConnectionStatus);

  // Handle custom WebSocket events
  Object.entries(customEvents).forEach(([eventName, handler]) => {
    if (typeof handler === 'function') {
      socket.on(eventName, (data: any) => {
        try {
          handler(data, { createPopup, removePopup, preventNavigation, allowNavigation });
        } catch (error) {
          console.error(`Error in custom event handler for ${eventName}:`, error);
        }
      });
    }
  });

  socket.on('connect_error', (error: Error) => {
    console.error('WebSocket connection error:', error.message);
    createPopup(undefined);
    preventNavigation();
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from WebSocket server');
    createPopup(undefined);
    preventNavigation();
  });

  return {
    disconnect: () => socket.disconnect(),
    reconnect: () => socket.connect(),
    socket
  };
}

export default {
  init: initConnectionJQueueSdkWeb
};
import { io, Socket } from 'socket.io-client';
import { InitConfig, CustomEventUtils } from './types';

class ConnectionJQueueSdkWeb {
  private static socket: Socket | null = null;
  private static popupEl: HTMLElement | null = null;

  /**
   * Initialize the WebSocket connection checker
   * @param config Configuration options
   * @returns Methods to control the connection
   */
  public static init(config: InitConfig) {
    const {
      url = 'wss://demo-websocket.example.com',
      socketConfig = { transports: ['websocket'], reconnectionAttempts: 3 },
      extraHeaders = {},
      popupConfig = {},
      customEvents = {}
    } = config;

    // Initialize socket with optional extraHeaders
    const socket = io(url, {
      ...socketConfig,
      extraHeaders: extraHeaders
    });
    this.socket = socket;

    // Create popup with provided HTML content
    const createPopup = (html: string) => {
      this.removePopup();
      const div = document.createElement('div');
      div.innerHTML = html;
      div.setAttribute('id', '__jqueue_popup');
      div.setAttribute('style', popupConfig.style || '');
      document.body.appendChild(div);
      this.popupEl = div;
    };

    // Remove existing popup
    const removePopup = () => {
      if (this.popupEl) {
        this.popupEl.remove();
        this.popupEl = null;
      }
    };

    // Prevent browser navigation
    const preventNavigation = () => {
      window.onbeforeunload = () => 'Navigation is currently blocked.';
    };

    // Allow browser navigation
    const allowNavigation = () => {
      window.onbeforeunload = null;
    };

    // Handle connection event
    socket.on('connect', () => {
      console.log('[J-Queue] Connected');
    });

    // Handle connection status updates
    socket.on('connection-status', (data: { uuid: string; position: number; allow: boolean }) => {
      if (data.allow) {
        removePopup();
        allowNavigation();
      } else {
        const content = typeof popupConfig.content === 'function'
          ? popupConfig.content(data.position)
          : popupConfig.content || `<div>Position: ${data.position ?? 'N/A'}<br>Please wait...</div>`;
        createPopup(content);
        preventNavigation();
      }
    });

    // Handle position updates
    socket.on('position-update', (data: { position: number; allow: boolean }) => {
      if (data.allow) {
        removePopup();
        allowNavigation();
      } else {
        const content = typeof popupConfig.content === 'function'
          ? popupConfig.content(data.position)
          : popupConfig.content || `<div>Position: ${data.position ?? 'N/A'}<br>Please wait...</div>`;
        createPopup(content);
      }
    });

    // Register custom event handlers
    Object.entries(customEvents).forEach(([eventName, handler]) => {
      socket.on(eventName, (data: any) => {
        const utils: CustomEventUtils = {
          createPopup,
          removePopup,
          preventNavigation,
          allowNavigation,
        };
        handler(data, utils);
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.warn('[J-Queue] Disconnected from server');
    });

    return {
      disconnect: () => socket.disconnect(),
    };
  }

  /**
   * Remove the popup if it exists
   */
  public static removePopup() {
    if (this.popupEl) {
      this.popupEl.remove();
      this.popupEl = null;
    }
  }
}

export default ConnectionJQueueSdkWeb;

if (typeof window !== 'undefined') {
  (window as any).ConnectionJQueueSdkWeb = ConnectionJQueueSdkWeb;
}
export type { InitConfig, PopupConfig, CustomEventUtils } from './types';
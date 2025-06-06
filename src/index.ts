import { io, Socket } from 'socket.io-client';
import { InitConfig, CustomEventUtils } from './types';

enum ONLINE_QUEUE_STATUS {
  WAITING = 1,
  ACTIVE = 2,
}

interface ConnectionState {
  socket: Socket | null;
  popupEl: HTMLElement | null;
  isNavigating: boolean;
}

class ConnectionJQueueSdkWeb {
  private static state: ConnectionState = {
    socket: null,
    popupEl: null,
    isNavigating: false,
  };
  private static statusInterval: NodeJS.Timeout | null = null;
  private static readonly STATUS_POLL_INTERVAL = 1000;

  public static init(config: InitConfig) {
    const {
      url,
      socketConfig = {
        transports: ['websocket'],
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
      },
      popupConfig = {},
      customEvents = {},
    } = config;

    if (!url) {
      throw new Error('URL is required for initialization');
    }

    if (this.state.socket?.connected) {
      console.warn('[J-Queue] Already initialized, skipping');
      return { disconnect: () => this.disconnect() };
    }

    const socket = io(url, socketConfig);
    this.state.socket = socket;

    const createPopup = (html: string): void => {
      this.removePopup();
      const div = document.createElement('div');
      div.id = '__jqueue_popup';
      div.style.cssText = popupConfig.style || '';
      div.innerHTML = html;
      document.body.appendChild(div);
      this.state.popupEl = div;
    };

    const removePopup = (): void => {
      this.state.popupEl?.remove();
      this.state.popupEl = null;
    };

    const preventNavigation = (): void => {
      if (!this.state.isNavigating) {
        window.onbeforeunload = () => 'Navigation is currently blocked.';
        this.state.isNavigating = true;
      }
    };

    const allowNavigation = (): void => {
      if (this.state.isNavigating) {
        window.onbeforeunload = null;
        this.state.isNavigating = false;
      }
    };

    const handleStatusUpdate = (response: { data: { uuid: string; position: number; status: number } }): void => {
      if (!response?.data) {
        console.warn('[J-Queue] Invalid status response received');
        return;
      }

      const { status, position } = response.data;

      if (status === ONLINE_QUEUE_STATUS.ACTIVE) {
        removePopup();
        allowNavigation();
        if (this.statusInterval) {
          clearInterval(this.statusInterval);
          this.statusInterval = null;
        }
      } else {
        const content = typeof popupConfig.content === 'function'
          ? popupConfig.content(position)
          : popupConfig.content || `<div>Position: ${position ?? 'N/A'}<br>Please wait...</div>`;
        createPopup(content);
        preventNavigation();
      }
    };

    socket.on('connect', () => {
      console.log('[J-Queue] Connected');
      this.statusInterval = setInterval(() => {
        socket.emit('online-queue:status', { ...socketConfig?.query });
      }, this.STATUS_POLL_INTERVAL);
    });

    socket.on('online-queue:status', handleStatusUpdate);

    socket.on('connect_error', (error) => {
      console.error('[J-Queue] Connection error:', error.message);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[J-Queue] Disconnected from server:', reason);
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
        this.statusInterval = null;
      }
    });

    Object.entries(customEvents).forEach(([eventName, handler]) => {
      socket.on(eventName, (data: unknown) => {
        try {
          const utils: CustomEventUtils = {
            createPopup,
            removePopup,
            preventNavigation,
            allowNavigation,
          };
          handler(data, utils);
        } catch (error) {
          console.error(`[J-Queue] Error in custom event handler ${eventName}:`, error);
        }
      });
    });

    return {
      disconnect: () => this.disconnect(),
    };
  }

  public static removePopup(): void {
    this.state.popupEl?.remove();
    this.state.popupEl = null;
  }

  private static disconnect(): void {
    if (this.state.socket) {
      this.state.socket.disconnect();
      this.state.socket = null;
    }
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    this.removePopup();
    if (this.state.isNavigating) {
      window.onbeforeunload = null;
      this.state.isNavigating = false;
    }
  }
}

if (typeof window !== 'undefined') {
  (window as any).ConnectionJQueueSdkWeb = ConnectionJQueueSdkWeb;
}

export default ConnectionJQueueSdkWeb;
export type { InitConfig, PopupConfig, CustomEventUtils } from './types';
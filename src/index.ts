import { io, Socket } from 'socket.io-client';
import { InitConfig, CustomEventUtils } from './types';

class ConnectionJQueueSdkWeb {
  private static socket: Socket | null = null;
  private static popupEl: HTMLElement | null = null;

  public static init(config: InitConfig) {
    const {
      url,
      socketConfig = { transports: ['websocket'], reconnectionAttempts: 3 },
      popupConfig = {},
      customEvents = {}
    } = config;

    const socket = io(url, socketConfig);
    this.socket = socket;

    const createPopup = (html: string) => {
      this.removePopup();
      const div = document.createElement('div');
      div.innerHTML = html;
      div.setAttribute('id', '__jqueue_popup');
      div.setAttribute('style', popupConfig.style || '');
      document.body.appendChild(div);
      this.popupEl = div;
    };

    const removePopup = () => {
      if (this.popupEl) {
        this.popupEl.remove();
        this.popupEl = null;
      }
    };

    const preventNavigation = () => {
      window.onbeforeunload = () => 'Navigation is currently blocked.';
    };

    const allowNavigation = () => {
      window.onbeforeunload = null;
    };

    socket.on('connect', () => {
      console.log('[J-Queue] Connected');
    });

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

    socket.on('disconnect', () => {
      console.warn('[J-Queue] Disconnected from server');
    });

    return {
      disconnect: () => socket.disconnect(),
    };
  }

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
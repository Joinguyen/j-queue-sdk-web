import { io, Socket } from 'socket.io-client';
import { InitConfig, PopupConfig, CustomEventUtils } from './types';

// Note: DOMPurify is optional for XSS sanitization; uncomment if used
// import DOMPurify from 'dompurify';

interface Window {
  ConnectionJQueueSdkWeb: typeof ConnectionJQueueSdkWeb;
}

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
  private static readonly STATUS_POLL_INTERVAL = 2000; // Increased to 2s for less server load

  private static readonly STYLE_POPUP = `
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    width: 100%;
    height: 100%;
    background: #fff;
    z-index: 10000;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 28px;
  `;

  private static readonly LOADER_STYLES = `
    .loader-jqueue_popup {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      display: inline-block;
      position: relative;
      background: linear-gradient(0deg, rgba(39,107,255,0.05) 33%, #276bff 100%);
      box-sizing: border-box;
      animation: rotation 1s linear infinite;
    }
    .loader-jqueue_popup::after {
      content: '';
      box-sizing: border-box;
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 96%;
      height: 96%;
      border-radius: 50%;
      background: #fff;
    }
    @keyframes rotation {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;

  private static injectStyles(): void {
    if (!document.querySelector('style[data-jqueue-styles]')) {
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-jqueue-styles', '');
      styleEl.textContent = this.LOADER_STYLES;
      document.head.appendChild(styleEl);
    }
  }

  private static createPopup(html: string, style?: string): void {
    if (this.state.popupEl) this.removePopup();
    const div = document.createElement('div');
    div.id = '__jqueue_popup';
    div.style.cssText = style || this.STYLE_POPUP;
    // Optional: Sanitize html with DOMPurify
    // div.innerHTML = DOMPurify.sanitize(html);
    div.innerHTML = html;
    document.body.appendChild(div);
    this.state.popupEl = div;
  }

  private static removePopup(): void {
    this.state.popupEl?.remove();
    this.state.popupEl = null;
  }

  private static preventNavigation(): void {
    if (!this.state.isNavigating) {
      window.onbeforeunload = () => 'Navigation is currently blocked.';
      this.state.isNavigating = true;
    }
  }

  private static allowNavigation(): void {
    if (this.state.isNavigating) {
      window.onbeforeunload = null;
      this.state.isNavigating = false;
    }
  }

  private static getDefaultPopupContent(position: number): string {
    return `
      <div style="margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; width: 100%;">
        <div style="padding: 20px; text-align: center;">
          <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px 0; color: #276bff;">
            접속한 순서대로 순차적 진행 중입니다.<br>
            빠른 서비스 진행을 위해 최선을 다하고 있습니다.
          </p>
          <div style="position: relative; width: 150px; height: 150px; margin: 20px auto;">
            <span style="position: absolute; width: 100%; height: 100%; left: 0;" class="loader-jqueue_popup"></span>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
              <div style="font-size: 14px; color: #276bff;">대기순번</div>
              <div style="font-size: 36px; color: #276bff; font-weight: bold;">${position}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

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
      pollInterval = this.STATUS_POLL_INTERVAL,
    } = config;

    if (!url) {
      throw new Error('URL is required for initialization');
    }

    if (this.state.socket?.connected) {
      console.warn('[J-Queue] Already initialized, skipping');
      return { disconnect: () => this.disconnect() };
    }

    this.injectStyles();
    const socket = io(url, socketConfig);
    this.state.socket = socket;

    const handleStatusUpdate = (response: { data: { uuid: string; position: number; status: number } }): void => {
      if (!response?.data) {
        console.warn(`[J-Queue] Invalid status response received, uuid: ${response?.data?.uuid || 'unknown'}`);
        return;
      }

      const { status, position } = response.data;

      if (status === ONLINE_QUEUE_STATUS.ACTIVE) {
        this.removePopup();
        this.allowNavigation();
        if (this.statusInterval) {
          clearInterval(this.statusInterval);
          this.statusInterval = null;
        }
      } else {
        const content = typeof popupConfig.content === 'function'
          ? popupConfig.content(position)
          : popupConfig.content || this.getDefaultPopupContent(position);
        this.createPopup(content, popupConfig.style);
        this.preventNavigation();
      }
    };

    socket.on('connect', () => {
      console.log('[J-Queue] Connected');
      this.statusInterval = setInterval(() => {
        socket.emit('online-queue:status', socketConfig?.query ? { ...socketConfig.query } : {});
      }, pollInterval);
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
            createPopup: this.createPopup,
            removePopup: this.removePopup,
            preventNavigation: this.preventNavigation,
            allowNavigation: this.allowNavigation,
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
    this.allowNavigation();
  }
}

if (typeof window !== 'undefined') {
  // Use unknown as an intermediate cast to resolve type mismatch
  (window as unknown as Window).ConnectionJQueueSdkWeb = ConnectionJQueueSdkWeb;
}

export default ConnectionJQueueSdkWeb;
export type { InitConfig, PopupConfig, CustomEventUtils } from './types';
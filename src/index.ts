import { io, Socket } from 'socket.io-client';
import { InitConfig, PopupConfig, OnlineQueueStatus } from './types';

// Define types for better clarity
interface ConnectionState {
  socket: Socket | null;
  popupEl: HTMLElement | null;
  isNavigating: boolean;
  storageKey: string | null;
}

interface StatusResponse {
  data: {
    uuid: string;
    position: number;
    status: OnlineQueueStatus;
  };
}

class ConnectionJQueueSdkWeb {
  private static readonly CONFIG = {
    STATUS_POLL_INTERVAL: 2000,
    MESSAGES: {
      en: {
        MESS_1: 'Progressing sequentially based on access order.',
        MESS_2: 'We are doing our best to proceed quickly.',
        MESS_3: 'Queue Number',
      },
      ko: {
        MESS_1: '접속한 순서대로 순차적 진행 중입니다.',
        MESS_2: '빠른 서비스 진행을 위해 최선을 다하고 있습니다.',
        MESS_3: '대기순번',
      },
    },
    STYLES: {
      POPUP: `
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        background: #fff;
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 28px;
      `,
      LOADER: (popupConfig?: PopupConfig): string => `
        .loader-jqueue_popup {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          display: inline-block;
          position: relative;
          background: linear-gradient(0deg, ${popupConfig?.loaderGradientEnd ?? 'rgba(39,107,255,0.05)'} 33%, ${popupConfig?.loaderGradientStart ?? '#276bff'} 100%);
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
      `,
    },
  };

  private static state: ConnectionState = {
    socket: null,
    popupEl: null,
    isNavigating: false,
    storageKey: null,
  };

  private static statusInterval: NodeJS.Timeout | null = null;

  private static injectStyles(popupConfig?: PopupConfig): void {
    if (typeof document === 'undefined') return;
    if (document.querySelector('style[data-jqueue-styles]')) return;
    const styleEl = document.createElement('style');
    styleEl.dataset.jqueueStyles = '';
    styleEl.textContent = this.CONFIG.STYLES.LOADER(popupConfig);
    document.head.appendChild(styleEl);
  }

  private static createPopup(html: string, style?: string): void {
    if (typeof document === 'undefined') return;
    this.removePopup();
    const div = document.createElement('div');
    div.id = '__jqueue_popup';
    div.style.cssText = style ?? this.CONFIG.STYLES.POPUP;
    div.innerHTML = html;
    document.body.appendChild(div);
    this.state.popupEl = div;
  }

  private static removePopup(): void {
    if (typeof document === 'undefined') return;
    this.state.popupEl?.remove();
    this.state.popupEl = null;
  }

  private static toggleNavigation(block: boolean): void {
    if (typeof window === 'undefined') return;
    if (this.state.isNavigating === block) return;
    window.onbeforeunload = block ? () => 'Navigation is currently blocked.' : null;
    this.state.isNavigating = block;
  }

  private static getDefaultPopupContent(position: number, language: 'en' | 'ko' = 'ko', popupConfig?: PopupConfig): string {
    const messages = this.CONFIG.MESSAGES[language];
    const textColor = popupConfig?.textColor ?? '#276bff';
    return `
      <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
        <div style="padding: 20px; text-align: center;">
          <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px 0; color: ${textColor};">
            ${messages.MESS_1}<br>
            ${messages.MESS_2}
          </p>
          <div style="position: relative; width: 150px; height: 150px; margin: 20px auto;">
            <span style="position: absolute; inset: 0;" class="loader-jqueue_popup"></span>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
              <div style="font-size: 14px; color: ${textColor};">${messages.MESS_3}</div>
              <div style="font-size: 36px; color: ${textColor}; font-weight: bold;">${position}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  public static init({
    url,
    socketConfig = { transports: ['websocket'], reconnectionAttempts: 3, reconnectionDelay: 1000 },
    popupConfig = {},
    customEvents = {},
    pollInterval = this.CONFIG.STATUS_POLL_INTERVAL,
    option = { storageKey: 'queue_token' },
  }: InitConfig) {
    if (!url) throw new Error('URL is required for initialization');
    if (typeof io === 'undefined') {
      throw new Error('Socket.IO client is not loaded. Please include socket.io-client before j-queue-sdk-web.');
    }
    if (this.state.socket?.connected) {
      console.warn('[J-Queue] Already initialized, skipping');
      return { disconnect: () => this.disconnect() };
    }

    this.state.storageKey = option.storageKey ?? null;
    this.injectStyles(popupConfig);
    const socket = io(url, socketConfig);
    this.state.socket = socket;

    const handleStatusUpdate = ({ data }: StatusResponse): void => {
      if (!data) {
        console.warn(`[J-Queue] Invalid status response received, uuid: ${data || 'unknown'}`);
        return;
      }

      const { status, position, uuid } = data;
      if (this.state.storageKey && uuid && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(this.state.storageKey, uuid);
      }

      if (status === OnlineQueueStatus.ACTIVE) {
        this.removePopup();
        this.toggleNavigation(false);
        if (this.statusInterval) {
          clearInterval(this.statusInterval);
          this.statusInterval = null;
        }
      } else {
        const content = typeof popupConfig.content === 'function'
          ? popupConfig.content(position)
          : popupConfig.content ?? this.getDefaultPopupContent(position, popupConfig.language ?? 'ko', popupConfig);
        this.createPopup(content, popupConfig.style);
        this.toggleNavigation(true);
      }
    };

    socket.on('connect', () => {
      this.statusInterval = setInterval(() => {
        socket.emit('online-queue:status', socketConfig?.query ?? {});
      }, pollInterval);
    });

    socket.on('online-queue:status', handleStatusUpdate);
    socket.on('connect_error', (error) => console.error('[J-Queue] Connection error:', error.message));
    socket.on('disconnect', (reason) => {
      console.warn('[J-Queue] Disconnected from server:', reason);
      // this.cleanup();
    });

    Object.entries(customEvents).forEach(([eventName, handler]) => {
      socket.on(eventName, (data: unknown) => {
        try {
          handler(data, {
            createPopup: this.createPopup.bind(this),
            removePopup: this.removePopup.bind(this),
            preventNavigation: () => this.toggleNavigation(true),
            allowNavigation: () => this.toggleNavigation(false),
          });
        } catch (error) {
          console.error(`[J-Queue] Error in custom event handler ${eventName}:`, error);
        }
      });
    });

    return { disconnect: () => this.disconnect() };
  }

  private static cleanup(): void {
    if (typeof sessionStorage !== 'undefined' && this.state.storageKey) {
      sessionStorage.removeItem(this.state.storageKey);
      this.state.storageKey = null;
    }
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    this.removePopup();
    this.toggleNavigation(false);
  }

  private static disconnect(): void {
    this.state.socket?.disconnect();
    this.state.socket = null;
    this.cleanup();
  }
}

// Global window augmentation
declare global {
  interface Window {
    ConnectionJQueueSdkWeb: typeof ConnectionJQueueSdkWeb;
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.ConnectionJQueueSdkWeb = ConnectionJQueueSdkWeb;
  console.log('[J-Queue] ConnectionJQueueSdkWeb initialized on window');
}

// Export for module systems
export default ConnectionJQueueSdkWeb;
export type { InitConfig, PopupConfig } from './types';
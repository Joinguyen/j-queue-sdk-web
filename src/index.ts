import { io, Socket } from 'socket.io-client';
import { InitConfig, PopupConfig, OnlineQueueStatus } from './types';

interface ConnectionState {
  socket: Socket | null;
  popupEl: HTMLElement | null;
  isNavigating: boolean;
  storageKey: string | null;
  queueStatus: { position: number; status: OnlineQueueStatus; uuid: string } | null;
  url: string | null;
  socketConfig: InitConfig['socketConfig'] | null;
}

interface StatusResponse {
  data: {
    uuid: string;
    position: number;
    status: OnlineQueueStatus;
  };
}

type QueryParams = Record<string, string | number | undefined>;

class ConnectionJQueueSdkWeb {
  private static readonly CONFIG = {
    STATUS_POLL_INTERVAL: 1000,
    TTL_INTERVAL: 5000, // Interval for emitting online-queue:set-ttl (5 seconds)
    API_ENDPOINTS: {
      JOIN: '/api/v1/online-queue/join',
      STATUS: '/api/v1/online-queue/status',
      LEAVE: '/api/v1/online-queue/leave',
    },
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
    queueStatus: null,
    url: null,
    socketConfig: {
      transports: ['websocket'],
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
    },
  };

  private static statusInterval: NodeJS.Timeout | null = null;
  private static ttlInterval: NodeJS.Timeout | null = null; // Interval for set-ttl emission
  private static statusListeners: ((status: { position: number; status: OnlineQueueStatus; uuid: string }) => void)[] = [];

  private static log(message: string, type: 'info' | 'warn' | 'error' = 'info', error?: unknown): void {
    const prefix = '[J-Queue]';
    if (type === 'error') {
      console.error(`${prefix} ${message}`, error);
    } else if (type === 'warn') {
      console.warn(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  private static injectStyles(popupConfig?: PopupConfig): void {
    if (typeof document === 'undefined' || document.querySelector('style[data-jqueue-styles]')) return;
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
    if (typeof window === 'undefined' || this.state.isNavigating === block) return;
    window.onbeforeunload = block
      ? () => {
        if (this.state.queueStatus?.uuid && this.state.url) {
          this.sendLeaveRequest();
        }
        return 'Navigation is currently blocked.';
      }
      : null;
    this.state.isNavigating = block;
  }

  private static sendLeaveRequest(): void {
    if (!this.state.url || !this.state.queueStatus?.uuid) return;
    try {
      const data = JSON.stringify({ ...this.state.socketConfig?.query, uuid: this.state.queueStatus.uuid });
      navigator.sendBeacon(`${this.state.url}${this.CONFIG.API_ENDPOINTS.LEAVE}`, data);
    } catch (error) {
      this.log('Leave API (sendBeacon) failed', 'error', error);
    }
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

  private static setupSocket(url: string, socketConfig: InitConfig['socketConfig'], uuid: string, customEvents: InitConfig['customEvents'], handleStatusUpdate: (response: StatusResponse) => void): void {
    const socket = io(url, {
      ...socketConfig,
      query: { ...socketConfig?.query, uuid },
    });
    this.state.socket = socket;

    socket.on('connect', () => {
      this.log('Socket connected');
      // Start emitting online-queue:set-ttl every 5 seconds
      this.ttlInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit('online-queue:set-ttl', { ...socketConfig?.query, uuid });
          this.log('Emitted online-queue:set-ttl');
        }
      }, this.CONFIG.TTL_INTERVAL);
    });

    socket.on('online-queue:status', handleStatusUpdate);
    socket.on('connect_error', (error) => this.log('Socket connection failed', 'error', error));
    socket.on('disconnect', (reason) => {
      this.log(`Socket disconnected: ${reason}`, 'warn');
      // Clear ttlInterval on disconnect
      if (this.ttlInterval) {
        clearInterval(this.ttlInterval);
        this.ttlInterval = null;
      }
    });

    Object.entries(customEvents || {}).forEach(([eventName, handler]) => {
      socket.on(eventName, (data: unknown) => {
        try {
          handler(data, {
            createPopup: this.createPopup.bind(this),
            removePopup: this.removePopup.bind(this),
            preventNavigation: () => this.toggleNavigation(true),
            allowNavigation: () => this.toggleNavigation(false),
          });
        } catch (error) {
          this.log(`Custom event handler ${eventName} failed`, 'error', error);
        }
      });
    });
  }

  public static addStatusListener(listener: (status: { position: number; status: OnlineQueueStatus; uuid: string }) => void): void {
    this.statusListeners.push(listener);
  }

  public static removeStatusListener(listener: (status: { position: number; status: OnlineQueueStatus; uuid: string }) => void): void {
    this.statusListeners = this.statusListeners.filter((l) => l !== listener);
  }

  public static getQueueStatus(): ConnectionState['queueStatus'] {
    return this.state.queueStatus;
  }

  private static async checkStatus(url: string, query: QueryParams, uuid: string): Promise<StatusResponse> {
    try {
      const params = new URLSearchParams(query as any);
      params.append('uuid', uuid);
      const response = await fetch(`${url}${this.CONFIG.API_ENDPOINTS.STATUS}?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      return response.json();
    } catch (error) {
      this.log('Status check failed', 'error', error);
      throw error;
    }
  }

  private static getAdjustedPollInterval(position: number, baseInterval: number): number {
    // Add 1 second (1000 ms) to pollInterval if position is 100 or greater
    return position >= 100 ? baseInterval + (Number(position / 100) * 1000) : baseInterval;
  }

  private static updateQueueStatus(data: StatusResponse['data'], popupConfig: PopupConfig): void {
    if (!data) {
      this.log('Invalid status response received', 'warn');
      return;
    }

    const { status, position, uuid } = data;
    this.state.queueStatus = { status, position, uuid };

    if (this.state.storageKey && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(this.state.storageKey, uuid);
    }

    this.statusListeners.forEach((listener) => listener({ status, position, uuid }));

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
  }

  public static async init({
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
    const socketConfigDefault = { transports: ['websocket'], reconnectionAttempts: 3, reconnectionDelay: 1000, ...socketConfig };
    this.state.storageKey = option.storageKey ?? null;
    this.state.url = url;
    this.state.socketConfig = socketConfigDefault;
    this.injectStyles(popupConfig);

    try {
      const joinResponse = await fetch(`${url}${this.CONFIG.API_ENDPOINTS.JOIN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(socketConfigDefault?.query ?? {}),
      });
      const joinData: StatusResponse = await joinResponse.json();
      if (!joinData.data?.uuid) {
        this.log('Join response missing UUID', 'error');
        return { disconnect: () => this.disconnect() };
      }

      const handleStatusUpdate = (response: StatusResponse): void => {
        this.updateQueueStatus(response.data, popupConfig);
      };

      this.updateQueueStatus(joinData.data, popupConfig);

      if (joinData.data.status === OnlineQueueStatus.ACTIVE) {
        this.setupSocket(url, socketConfigDefault, joinData.data.uuid, customEvents, handleStatusUpdate);
      } else if (joinData.data.status === OnlineQueueStatus.WAITING) {
        // Adjust initial pollInterval based on joinData.data.position
        let currentPollInterval = this.getAdjustedPollInterval(joinData.data.position, pollInterval);
        this.statusInterval = setInterval(async () => {
          const response = await this.checkStatus(url, socketConfigDefault?.query || {}, joinData.data.uuid);
          handleStatusUpdate(response);
          // Re-adjust pollInterval based on latest position
          const newPollInterval = this.getAdjustedPollInterval(response.data.position, pollInterval);
          if (newPollInterval !== currentPollInterval) {
            // Restart interval with new pollInterval
            if (this.statusInterval) {
              clearInterval(this.statusInterval);
            }
            currentPollInterval = newPollInterval;
            this.statusInterval = setInterval(async () => {
              const response = await this.checkStatus(url, socketConfigDefault?.query || {}, joinData.data.uuid);
              handleStatusUpdate(response);
              if (response.data.status === OnlineQueueStatus.ACTIVE) {
                this.setupSocket(url, socketConfigDefault, joinData.data.uuid, customEvents, handleStatusUpdate);
              }
            }, currentPollInterval);
          }
          if (response.data.status === OnlineQueueStatus.ACTIVE) {
            this.setupSocket(url, socketConfigDefault, joinData.data.uuid, customEvents, handleStatusUpdate);
          }
        }, currentPollInterval);
      }

      return { disconnect: () => this.disconnect() };
    } catch (error) {
      this.log('Initialization failed', 'error', error);
      return { disconnect: () => this.disconnect() };
    }
  }

  private static cleanup(): void {
    if (typeof sessionStorage !== 'undefined' && this.state.storageKey) {
      sessionStorage.removeItem(this.state.storageKey);
    }
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    if (this.ttlInterval) {
      clearInterval(this.ttlInterval);
      this.ttlInterval = null;
    }
    this.removePopup();
    this.toggleNavigation(false);
    this.state = {
      socket: null,
      popupEl: null,
      isNavigating: false,
      storageKey: null,
      queueStatus: null,
      url: null,
      socketConfig: null,
    };
    this.statusListeners = [];
  }

  private static disconnect(): void {
    if (this.state.socket?.connected && this.state.queueStatus?.uuid && this.state.url) {
      this.sendLeaveRequest();
    }
    this.state.socket?.disconnect();
    this.cleanup();
  }
}

declare global {
  interface Window {
    ConnectionJQueueSdkWeb: typeof ConnectionJQueueSdkWeb;
  }
}

if (typeof window !== 'undefined') {
  window.ConnectionJQueueSdkWeb = ConnectionJQueueSdkWeb;
  console.log('Initialized on window');
}

export default ConnectionJQueueSdkWeb;
export type { InitConfig, PopupConfig, OnlineQueueStatus } from './types';
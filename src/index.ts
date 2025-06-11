import { io, Socket } from 'socket.io-client';
import { InitConfig, PopupConfig, OnlineQueueStatus, CustomEventUtils } from './types';

interface ConnectionState {
  socket: Socket | null;
  popupEl: HTMLElement | null;
  isNavigating: boolean;
  storageKey: string | null;
  queueStatus: { position: number; status: OnlineQueueStatus; uuid: string } | null;
  wsUrl: string | null;
  apiUrl: string | null;
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
    TTL_INTERVAL: 30000, // Base interval for online-queue:status
    STORAGE_KEY: 'queue_token',
    API_ENDPOINTS: {
      LEAVE: '/leave',
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
    wsUrl: null,
    apiUrl: null,
    socketConfig: null,
  };

  private static ttlInterval: NodeJS.Timeout | null = null;
  private static statusListeners: Array<(status: NonNullable<ConnectionState['queueStatus']>) => void> = [];

  /** Logs messages with a prefix, supporting different log levels. */
  private static log(message: string, type: 'info' | 'warn' | 'error' = 'info', error?: unknown): void {
    const prefix = '[J-Queue]';
    const logMethod = type === 'error' ? console.error : type === 'warn' ? console.warn : console.log;
    logMethod(`${prefix} ${message}`, error ?? '');
  }

  /** Injects CSS styles for the popup loader if not already present. */
  private static injectStyles(popupConfig?: PopupConfig): void {
    if (typeof document === 'undefined' || document.querySelector('style[data-jqueue-styles]')) return;
    const styleEl = document.createElement('style');
    styleEl.dataset.jqueueStyles = '';
    styleEl.textContent = this.CONFIG.STYLES.LOADER(popupConfig);
    document.head.appendChild(styleEl);
  }

  /** Creates a popup with the given HTML and optional styles. */
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

  /** Removes the current popup from the DOM. */
  private static removePopup(): void {
    if (typeof document === 'undefined') return;
    this.state.popupEl?.remove();
    this.state.popupEl = null;
  }

  /** Toggles navigation blocking with an onbeforeunload handler. */
  private static toggleNavigation(block: boolean): void {
    if (typeof window === 'undefined' || this.state.isNavigating === block) return;
    window.onbeforeunload = block
      ? () => {
        if (this.state.queueStatus?.uuid && this.state.apiUrl) this.sendLeaveRequest();
        return 'Navigation is currently blocked.';
      }
      : null;
    this.state.isNavigating = block;
  }

  /** Sends a leave request via navigator.sendBeacon with JSON data. */
  private static sendLeaveRequest(): void {
    const { apiUrl, queueStatus } = this.state;
    if (!apiUrl || !queueStatus?.uuid) return;
    try {
      const data = JSON.stringify({ uuid: queueStatus.uuid });
      navigator.sendBeacon(`${apiUrl}${this.CONFIG.API_ENDPOINTS.LEAVE}`, data);
    } catch (error) {
      this.log('Leave API (sendBeacon) failed', 'error', error);
    }
  }

  /** Generates default popup content based on position and language. */
  private static getDefaultPopupContent(position: number, language: 'en' | 'ko' = 'ko', popupConfig?: PopupConfig): string {
    const messages = this.CONFIG.MESSAGES[language];
    const textColor = popupConfig?.textColor ?? '#276bff';
    return `
      <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
        <div style="padding: 20px; text-align: center;">
          <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px 0; color: ${textColor};">
            ${messages.MESS_1}<br>${messages.MESS_2}
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

  /** Calculates the polling interval based on queue position. */
  private static getAdjustedPollInterval(position: number, baseInterval: number): number {
    return position >= 100 ? baseInterval + (position / 100) * 1000 : baseInterval;
  }

  /** Handles status updates from online-queue:join or online-queue:status events. */
  private static handleStatusUpdate(data: StatusResponse, popupConfig: InitConfig['popupConfig'], currentTtlInterval: { value: number }): void {
    if (!data?.data) {
      this.log('Invalid status response received', 'warn');
      return;
    }

    const { status, position, uuid } = data.data;
    this.state.queueStatus = { status, position, uuid };

    if (this.state.storageKey && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(this.state.storageKey, uuid);
    }

    this.statusListeners.forEach((listener) => listener({ status, position, uuid }));

    // Update TTL interval based on new position
    const newTtlInterval = this.getAdjustedPollInterval(position, this.CONFIG.TTL_INTERVAL);
    if (newTtlInterval !== currentTtlInterval.value) {
      currentTtlInterval.value = newTtlInterval;
      this.startTtlEmission(currentTtlInterval.value);
    }

    // Handle popup and navigation
    if (status === OnlineQueueStatus.ACTIVE) {
      this.removePopup();
      this.toggleNavigation(false);
    } else {
      const content =
        typeof popupConfig?.content === 'function'
          ? popupConfig.content(position)
          : popupConfig?.content ?? this.getDefaultPopupContent(position, popupConfig?.language ?? 'ko', popupConfig);
      this.createPopup(content, popupConfig?.style);
      this.toggleNavigation(true);
    }
  }

  /** Starts periodic TTL emission with the specified interval. */
  private static startTtlEmission(interval: number): void {
    if (this.ttlInterval) clearInterval(this.ttlInterval);
    this.ttlInterval = setInterval(() => {
      if (this.state.socket?.connected && this.state.queueStatus?.uuid && this.state.socketConfig) {
        this.state.socket.emit('online-queue:status', { ...this.state.socketConfig.query, uuid: this.state.queueStatus.uuid });
        this.log('Sent online-queue:status');
      }
    }, interval);
  }

  /** Configures the Socket.IO connection with event handlers and periodic TTL emission. */
  private static setupSocket(
    wsUrl: string,
    socketConfig: NonNullable<InitConfig['socketConfig']>,
    uuid: string,
    customEvents: InitConfig['customEvents'],
    popupConfig: InitConfig['popupConfig'],
  ): void {
    const socket = io(wsUrl, {
      query: { ...socketConfig.query, uuid },
      transports: socketConfig.transports || ['websocket'],
      reconnectionAttempts: socketConfig.reconnectionAttempts || 3,
      reconnectionDelay: socketConfig.reconnectionDelay || 1000,
    });
    this.state.socket = socket;

    const currentTtlInterval = { value: this.getAdjustedPollInterval(0, this.CONFIG.TTL_INTERVAL) };
    let isFirstConnection = true;

    socket.on('connect', () => {
      this.log('Socket.IO connected');
      if (isFirstConnection) {
        socket.emit('online-queue:join', { ...socketConfig.query });
        this.log('Sent online-queue:join');
        isFirstConnection = false;
      }
      this.startTtlEmission(currentTtlInterval.value);
    });

    socket.on('online-queue:join', (data: StatusResponse) => {
      this.handleStatusUpdate(data, popupConfig, currentTtlInterval);
    });

    socket.on('online-queue:status', (data: StatusResponse) => {
      this.handleStatusUpdate(data, popupConfig, currentTtlInterval);
    });

    if (customEvents) {
      Object.keys(customEvents).forEach((event) => {
        socket.on(event, (data: any) => {
          customEvents[event](data, {
            createPopup: this.createPopup.bind(this),
            removePopup: this.removePopup.bind(this),
            preventNavigation: () => this.toggleNavigation(true),
            allowNavigation: () => this.toggleNavigation(false),
          });
        });
      });
    }

    socket.on('connect_error', (error) => {
      this.log('Socket.IO connection error', 'error', error);
    });

    socket.on('disconnect', (reason) => {
      this.log(`Socket.IO disconnected: ${reason}`, 'warn');
      if (this.ttlInterval) {
        clearInterval(this.ttlInterval);
        this.ttlInterval = null;
      }
    });
  }

  /** Adds a listener for queue status updates. */
  public static addStatusListener(listener: (status: NonNullable<ConnectionState['queueStatus']>) => void): void {
    this.statusListeners.push(listener);
  }

  /** Removes a queue status listener. */
  public static removeStatusListener(listener: (status: NonNullable<ConnectionState['queueStatus']>) => void): void {
    this.statusListeners = this.statusListeners.filter((l) => l !== listener);
  }

  /** Returns the current queue status. */
  public static getQueueStatus(): ConnectionState['queueStatus'] {
    return this.state.queueStatus;
  }

  /** Initializes the queue SDK with the provided configuration. */
  public static async init({
    wsUrl,
    apiUrl,
    socketConfig = {},
    popupConfig = {},
    customEvents = {},
    option = { storageKey: this.CONFIG.STORAGE_KEY },
  }: InitConfig): Promise<{ disconnect: () => void }> {
    if (!wsUrl || !apiUrl) throw new Error('Both wsUrl and apiUrl are required for initialization');
    if (typeof window === 'undefined') throw new Error('Socket.IO is not supported in this environment.');

    this.state = {
      ...this.state,
      storageKey: option.storageKey ?? this.CONFIG.STORAGE_KEY,
      wsUrl,
      apiUrl,
      socketConfig,
    };
    this.injectStyles(popupConfig);

    try {
      // Connect socket immediately
      this.setupSocket(wsUrl, socketConfig, '', customEvents, popupConfig);
      return { disconnect: () => this.disconnect() };
    } catch (error) {
      this.log('Initialization failed', 'error', error);
      return { disconnect: () => this.disconnect() };
    }
  }

  /** Cleans up resources and resets state. */
  private static cleanup(): void {
    if (this.state.storageKey && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(this.state.storageKey);
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
      wsUrl: null,
      apiUrl: null,
      socketConfig: null,
    };
    this.statusListeners = [];
  }

  /** Disconnects the Socket.IO connection and cleans up resources. */
  private static disconnect(): void {
    if (this.state.socket?.connected && this.state.queueStatus?.uuid && this.state.apiUrl) {
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
  // console.log('Initialized on window');
}

export default ConnectionJQueueSdkWeb;
export type { InitConfig, PopupConfig, OnlineQueueStatus } from './types';
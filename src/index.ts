import { io, Socket } from 'socket.io-client';
import { InitConfig, OnlineQueueStatus, PopupConfig } from './types';

// Default WebSocket URLs
const DEFAULT_WS_URLS = {
  prod: 'https://api-extra-queue.pressai.kr',
  dev: 'https://dev-api-extra-queue.pressai.kr',
};

interface ConnectionState {
  socket: Socket | null;
  popupEl: HTMLElement | null;
  isNavigating: boolean;
  storageTokenKey: string | null;
  storageConnectKey: string | null;
  queueStatus: { position: number; status: OnlineQueueStatus; uuid: string } | null;
  wsUrl: string | null;
  apiUrl: string | null;
  socketConfig: InitConfig['socketConfig'] | null;
}

interface StatusResponse {
  uuid: string;
  position: number;
  status: OnlineQueueStatus;
}

type QueryParams = Record<string, string | number | undefined>;

class ConnectionJQueueSdkWeb {
  private static readonly CONFIG = {
    TTL_INTERVAL: 2000,
    MAX_TTL_INTERVAL: 60000,
    CHECK_DISCONNECTED_INTERVAL: 30000,
    STORAGE_TOKEN_KEY: 'queue_token',
    STORAGE_CONNECT_KEY: 'queue_connect_key',
    STORAGE_LANGUAGE_KEY: 'queue_language',
    API_ENDPOINTS: { LEAVE: '/leave' },
    MESSAGES: {
      en: {
        MESS_1: 'Progressing sequentially based on access order.',
        MESS_2: 'We are doing our best to proceed quickly.',
        MESS_3: 'Queue Number',
        LOADING: 'Connecting',
      },
      ko: {
        MESS_1: '접속한 순서대로 순차적 진행 중입니다.',
        MESS_2: '빠른 서비스 진행을 위해 최선을 다하고 있습니다.',
        MESS_3: '대기순번',
        LOADING: '연결 중',
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
    storageTokenKey: null,
    storageConnectKey: null,
    queueStatus: null,
    wsUrl: null,
    apiUrl: null,
    socketConfig: null,
  };

  private static ttlInterval: NodeJS.Timeout | null = null;
  private static statusListeners: Array<(status: NonNullable<ConnectionState['queueStatus']>) => void> = [];

  private static log(message: string, type: 'info' | 'warn' | 'error' = 'info', error?: unknown): void {
    const prefix = `[J-Queue]`;
    const logMethod = { error: console.error, warn: console.warn, info: console.log }[type];
    logMethod(`${prefix} ${message}`, error ?? '');
  }

  private static injectStyles(popupConfig?: PopupConfig): void {
    if (typeof document === 'undefined' || document.querySelector('style[data-styles]')) return;
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
        if (this.state.queueStatus?.uuid && this.state.apiUrl) this.sendLeaveRequest();
        return 'Navigation is currently blocked.';
      }
      : null;
    this.state.isNavigating = block;
  }

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

  private static getLoadingPopupContent(language: 'en' | 'ko' = 'ko', popupConfig?: PopupConfig): string {
    const messages = this.CONFIG.MESSAGES[language];
    const textColor = popupConfig?.textColor ?? '#276bff';
    return `
      <div style="display: flex; flex-direction: column; align-items: center; width: 100%;">
        <div style="padding: 20px; text-align: center;">
          <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px 0; color: transparent;">
            ${messages.MESS_1}<br>${messages.MESS_2}
          </p>
          <div style="position: relative; width: 150px; height: 150px; margin: 20px auto;">
            <span style="position: absolute; inset: 0;" class="loader-jqueue_popup"></span>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
              <div style="font-size: 14px; color: ${textColor};">${messages.LOADING}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private static getAdjustedPollInterval(position: number): number {
    const pollTime = position >= 100 ? this.CONFIG.TTL_INTERVAL + (position / 100) * 1000 : this.CONFIG.TTL_INTERVAL;
    return pollTime > this.CONFIG.MAX_TTL_INTERVAL ? this.CONFIG.MAX_TTL_INTERVAL : pollTime;
  }

  private static clearInterval(): void {
    if (this.ttlInterval) {
      clearInterval(this.ttlInterval);
      this.ttlInterval = null;
    }
  }

  private static reloadPage(): void {
    window.location.reload();
  }

  private static startStatusEmission(interval: number): void {
    this.clearInterval();
    this.ttlInterval = setInterval(() => {
      if (this.state.socket?.connected && this.state.socketConfig) {
        this.state.socket.emit('online-queue:status', {
          ...this.state.socketConfig.query,
          ...(this.state.queueStatus?.uuid ? { uuid: this.state.queueStatus.uuid } : {}),
        });
        this.log('Sent online-queue:status');
      }
    }, interval);
  }

  private static startCheckDisconnectedEmission(): void {
    this.clearInterval();
    this.ttlInterval = setInterval(() => {
      if (this.state.socket?.connected && this.state.queueStatus?.uuid) {
        this.state.socket.emit('online-queue:check-disconnected', { uuid: this.state.queueStatus.uuid });
        this.log('Sent online-queue:check-disconnected');
      }
    }, this.CONFIG.CHECK_DISCONNECTED_INTERVAL);
  }

  private static updateQueueStatus({ status, position, uuid }: StatusResponse): void {
    this.state.queueStatus = { status, position, uuid };
    if (this.state.storageTokenKey && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(this.state.storageTokenKey, uuid);
    }
    this.statusListeners.forEach((listener) => listener({ status, position, uuid }));
  }

  private static handleStatusUpdate(data: StatusResponse, popupConfig: InitConfig['popupConfig'], currentTtlInterval: { value: number }): void {
    if (!data) {
      this.log('Invalid status response received', 'warn');
      return;
    }

    const { status, position } = data;
    this.updateQueueStatus(data);

    switch (status) {
      case OnlineQueueStatus.ACTIVE:
        this.startCheckDisconnectedEmission();
        this.removePopup();
        this.toggleNavigation(false);
        break;
      case OnlineQueueStatus.WAITING:
        const newTtlInterval = this.getAdjustedPollInterval(position);
        if (newTtlInterval !== currentTtlInterval.value) {
          currentTtlInterval.value = newTtlInterval;
          this.startStatusEmission(newTtlInterval);
        }
        const content =
          typeof popupConfig?.content === 'function'
            ? popupConfig.content(position)
            : popupConfig?.content ?? this.getDefaultPopupContent(position, popupConfig?.language ?? 'ko', popupConfig);
        this.createPopup(content, popupConfig?.style);
        this.toggleNavigation(true);
        break;
      case OnlineQueueStatus.EMPTY:
        alert(`${popupConfig?.language === 'en' ? 'Connect key does not exist!' : '연결 키가 존재하지 않습니다!'}`);
        this.clearInterval();
      case OnlineQueueStatus.EXPIRED:
        alert(`${popupConfig?.language === 'en' ? 'The request was not processed due to a timeout.\nPlease try again later.' : '대기 시간 초과로 인해 처리되지 않았습니다. \n잠시 후 다시 시도해 주세요.'}`);
        this.reloadPage();
        break;
    }
  }

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

    const currentTtlInterval = { value: this.getAdjustedPollInterval(0) };

    socket.on('connect', () => {
      this.log('Socket.IO connected');
      this.removePopup();
      this.startStatusEmission(currentTtlInterval.value);
    });

    socket.on('online-queue:status', (data: StatusResponse) => {
      this.handleStatusUpdate(data, popupConfig, currentTtlInterval);
    });

    Object.entries(customEvents || {}).forEach(([event, handler]) => {
      socket.on(event, (data: any) =>
        handler(data, {
          createPopup: this.createPopup.bind(this),
          removePopup: this.removePopup.bind(this),
          preventNavigation: () => this.toggleNavigation(true),
          allowNavigation: () => this.toggleNavigation(false),
        }),
      );
    });

    socket.on('connect_error', (error) => {
      this.log('Socket.IO connection error', 'error', error);
      this.removePopup();
    });

    socket.on('disconnect', (reason) => {
      this.log(`Socket.IO disconnected: ${reason}`, 'warn');
      this.clearInterval();
      if (this.state.storageTokenKey && typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem(this.state.storageTokenKey)) {
        window?.location?.reload();
      }
    });

    if (this.state.storageConnectKey && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(this.state.storageConnectKey, `${socketConfig?.query?.connect_key}`);
    }
  }

  /**
   * Adds a listener for queue status updates.
   * @param listener Callback function to receive status updates.
   */
  public static addStatusListener(listener: (status: NonNullable<ConnectionState['queueStatus']>) => void): void {
    this.statusListeners.push(listener);
  }

  /**
   * Removes a queue status listener.
   * @param listener Callback function to remove.
   */
  public static removeStatusListener(listener: (status: NonNullable<ConnectionState['queueStatus']>) => void): void {
    this.statusListeners = this.statusListeners.filter((l) => l !== listener);
  }

  /**
   * Gets the current queue status.
   * @returns Current queue status or null if not initialized.
   */
  public static getQueueStatus(): ConnectionState['queueStatus'] {
    return this.state.queueStatus;
  }


  /**
   * Initializes the J-Queue SDK with the provided configuration.
   * @param config Configuration for the SDK.
   * @returns Promise resolving to an object with a disconnect method.
   */
  public static async init({
    wsUrl = DEFAULT_WS_URLS.prod,
    apiUrl = '',
    socketConfig = {},
    popupConfig = {
      isShowLoadingOnConnect: false,
    },
    customEvents = {},
    option = { storageTokenKey: this.CONFIG.STORAGE_TOKEN_KEY, storageConnectKey: this.CONFIG.STORAGE_CONNECT_KEY },
  }: InitConfig): Promise<{ disconnect: () => void }> {
    if (typeof window === 'undefined') throw new Error('Socket.IO is not supported in this environment');

    this.state = {
      ...this.state,
      storageTokenKey: option.storageTokenKey ?? this.CONFIG.STORAGE_TOKEN_KEY,
      storageConnectKey: option.storageConnectKey ?? this.CONFIG.STORAGE_CONNECT_KEY,
      wsUrl,
      apiUrl,
      socketConfig,
    };
    this.injectStyles(popupConfig);

    try {
      if (popupConfig?.isShowLoadingOnConnect) {
        const content = this.getLoadingPopupContent(popupConfig.language ?? 'ko', popupConfig);
        this.createPopup(content, popupConfig.style);
      }

      this.setupSocket(wsUrl, socketConfig, '', customEvents, popupConfig);
      return { disconnect: () => this.disconnect() };
    } catch (error) {
      this.log('Initialization failed', 'error', error);
      this.removePopup();
      throw error;
    }
  }

  private static cleanup(): void {
    if (this.state.storageTokenKey && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(this.state.storageTokenKey);
    }
    if (this.state.storageConnectKey && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(this.state.storageConnectKey);
    }
    this.clearInterval();
    this.removePopup();
    this.toggleNavigation(false);
    this.state = {
      socket: null,
      popupEl: null,
      isNavigating: false,
      storageTokenKey: null,
      storageConnectKey: null,
      queueStatus: null,
      wsUrl: null,
      apiUrl: null,
      socketConfig: null,
    };
    this.statusListeners = [];
  }

  private static disconnect(): void {
    if (this.state.socket?.connected && this.state.queueStatus?.uuid) {
      this.sendLeaveRequest();
    }
    this.state.socket?.disconnect();
    this.cleanup();
  }

  /**
   * Initializes the SDK using attributes from the script tag.
   * Automatically called when the script is loaded with data-* attributes.
   * Supported attributes:
   * - data-ws-url: WebSocket URL (optional; if not provided, determined by data-mode).
   * - data-mode: Environment mode ('dev' or 'prod'; optional, defaults to 'prod').
   * - data-api-url: API URL for queue operations.
   * - data-storage-token-key: sessionStorage key for queue token.
   * - data-storage-connect-key: sessionStorage key for connect key.
   * - data-connect-key: Connect key for socket query.
   * - data-show-loading: Show loading popup on connect ('true'/'false').
   * - data-language: Language for popup ('en'/'ko').
   * - data-storage-language-key: Language for popup ('en'/'ko').
   * - data-text-color: Text color for popup.
   * - data-loader-gradient-start: Starting color for the loader gradient.
   * - data-loader-gradient-end: Ending color for the loader gradient.
   */
  public static initFromScriptAttributes(): void {
    if (typeof document === 'undefined') return;

    const scripts = document.getElementsByTagName('script');
    let sdkScript: HTMLScriptElement | null = null;

    for (const script of scripts) {
      if (script.src.includes('j-queue-sdk-web')) {
        sdkScript = script;
        break;
      }
    }

    if (!sdkScript) {
      this.log('Could not find J-Queue SDK script tag', 'error');
      return;
    }

    // Extract attributes
    const wsUrlAttr = sdkScript.getAttribute('data-ws-url');
    const mode = sdkScript.getAttribute('data-mode') as 'dev' | 'prod' | null;
    const wsUrl = wsUrlAttr || (mode === 'dev' ? DEFAULT_WS_URLS.dev : DEFAULT_WS_URLS.prod);
    const apiUrl = sdkScript.getAttribute('data-api-url') || '';
    const storageTokenKey = sdkScript.getAttribute('data-storage-token-key') || this.CONFIG.STORAGE_TOKEN_KEY;
    const storageConnectKey = sdkScript.getAttribute('data-storage-connect-key') || this.CONFIG.STORAGE_CONNECT_KEY;
    const storageLanguageKey = sdkScript.getAttribute('data-storage-language-key') || this.CONFIG.STORAGE_LANGUAGE_KEY;
    const connectKey = sdkScript.getAttribute('data-connect-key');
    const isShowLoadingOnConnect = sdkScript.getAttribute('data-show-loading') === 'true';
    const language = (sdkScript.getAttribute('data-language') || localStorage?.getItem(storageLanguageKey) || (navigator?.language?.split('-')[0] === 'ko' ? 'ko' : 'en')) as 'en' | 'ko' | undefined;
    const textColor = sdkScript.getAttribute('data-text-color');
    const loaderGradientStart = sdkScript.getAttribute('data-loader-gradient-start');
    const loaderGradientEnd = sdkScript.getAttribute('data-loader-gradient-end');


    const config: InitConfig = {
      wsUrl,
      apiUrl,
      option: {
        storageTokenKey,
        storageConnectKey,
      },
      socketConfig: {
        query: connectKey ? { connect_key: connectKey } : {},
      },
      popupConfig: {
        isShowLoadingOnConnect,
        ...(language && { language }),
        ...(textColor && { textColor }),
        ...(loaderGradientStart && { loaderGradientStart }),
        ...(loaderGradientEnd && { loaderGradientEnd }),
      },
    };

    this.init(config).catch((error) => {
      this.log('Auto-initialization from script attributes failed', 'error', error);
    });
  }
}

// Properly extend the Window interface
declare global {
  interface Window {
    ConnectionJQueueSdkWeb?: typeof ConnectionJQueueSdkWeb;
  }
}

// Initialize in browser environment
(function () {
  if (typeof window !== 'undefined') {
    window.ConnectionJQueueSdkWeb = ConnectionJQueueSdkWeb;
    try {
      ConnectionJQueueSdkWeb.initFromScriptAttributes();
    } catch (error) {
      console.error(`[J-Queue] Failed to initialize from script attributes`, error);
    }
  }
})();

export default ConnectionJQueueSdkWeb;
export type { InitConfig, OnlineQueueStatus, PopupConfig } from './types';
import { InitConfig, PopupConfig, OnlineQueueStatus, CustomEventUtils } from './types';

interface ConnectionState {
  socket: WebSocket | null;
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

interface WebSocketMessage {
  event: string;
  data: any;
}

type QueryParams = Record<string, string | number | undefined>;

class ConnectionJQueueSdkWeb {
  private static readonly CONFIG = {
    STATUS_POLL_INTERVAL: 1000,
    TTL_INTERVAL: 5000, // Interval for emitting online-queue:set-ttl
    STORAGE_KEY: 'queue_token',
    API_ENDPOINTS: {
      JOIN: '/join',
      STATUS: '/status',
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

  private static statusInterval: NodeJS.Timeout | null = null;
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

  /** Sends a leave request via navigator.sendBeacon. */
  private static sendLeaveRequest(): void {
    const { apiUrl, queueStatus } = this.state;
    if (!apiUrl || !queueStatus?.uuid) return;
    try {
      const data = new URLSearchParams(); data.set('uuid', queueStatus?.uuid);
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

  /** Configures the WebSocket with event handlers and periodic TTL emission. */
  private static setupSocket(
    wsUrl: string,
    socketConfig: NonNullable<InitConfig['socketConfig']>,
    uuid: string,
    customEvents: InitConfig['customEvents'],
    handleStatusUpdate: (response: StatusResponse) => void,
  ): void {
    const params = new URLSearchParams({ ...socketConfig.query, uuid });
    const socket = new WebSocket(`${wsUrl}?${params.toString()}`);
    this.state.socket = socket;

    socket.onopen = () => {
      this.log('WebSocket connected');
      this.ttlInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ event: 'online-queue:set-ttl', data: { ...socketConfig.query, uuid } }));
          this.log('Sent online-queue:set-ttl');
        }
      }, this.CONFIG.TTL_INTERVAL);
    };

    socket.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        if (message.event === 'online-queue:status') {
          handleStatusUpdate(message.data);
        } else if (customEvents && message.event in customEvents) {
          customEvents[message.event](message.data, {
            createPopup: this.createPopup.bind(this),
            removePopup: this.removePopup.bind(this),
            preventNavigation: () => this.toggleNavigation(true),
            allowNavigation: () => this.toggleNavigation(false),
          });
        }
      } catch (error) {
        this.log('WebSocket message handling failed', 'error', error);
      }
    };

    socket.onerror = (error) => {
      this.log('WebSocket error', 'error', error);
    };

    socket.onclose = (event) => {
      this.log(`WebSocket closed: code=${event.code}, reason=${event.reason}`, 'warn');
      if (this.ttlInterval) {
        clearInterval(this.ttlInterval);
        this.ttlInterval = null;
      }
    };
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

  /** Fetches the queue status from the server. */
  private static async fetchStatus(apiUrl: string, query: QueryParams, uuid: string): Promise<StatusResponse> {
    const params = new URLSearchParams({});
    params.append('uuid', uuid);
    const response = await fetch(`${apiUrl}${this.CONFIG.API_ENDPOINTS.STATUS}?${params.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.json();
  }

  /** Calculates the polling interval based on queue position. */
  private static getAdjustedPollInterval(position: number, baseInterval: number): number {
    return position >= 100 ? baseInterval + (position / 100) * 1000 : baseInterval;
  }

  /** Updates the queue status and UI based on the server response. */
  private static updateQueueStatus(data: StatusResponse['data'] | null, popupConfig: InitConfig['popupConfig']): void {
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
      const content =
        typeof popupConfig?.content === 'function'
          ? popupConfig.content(position)
          : popupConfig?.content ?? this.getDefaultPopupContent(position, popupConfig?.language ?? 'ko', popupConfig);
      this.createPopup(content, popupConfig?.style);
      this.toggleNavigation(true);
    }
  }

  /** Starts polling the queue status for WAITING state. */
  private static startStatusPolling(
    wsUrl: string,
    apiUrl: string,
    socketConfig: NonNullable<InitConfig['socketConfig']>,
    uuid: string,
    basePollInterval: number,
    popupConfig: InitConfig['popupConfig'],
    customEvents: InitConfig['customEvents'],
  ): void {
    let currentPollInterval = this.getAdjustedPollInterval(this.state.queueStatus?.position ?? 0, basePollInterval);

    const pollStatus = async () => {
      try {
        const response = await this.fetchStatus(apiUrl, socketConfig.query ?? {}, uuid);
        this.updateQueueStatus(response.data, popupConfig);

        const newPollInterval = this.getAdjustedPollInterval(response.data.position, basePollInterval);
        if (newPollInterval !== currentPollInterval && this.statusInterval) {
          clearInterval(this.statusInterval);
          currentPollInterval = newPollInterval;
          this.statusInterval = setInterval(pollStatus, currentPollInterval);
        }

        if (response.data.status === OnlineQueueStatus.ACTIVE) {
          this.setupSocket(wsUrl, socketConfig, uuid, customEvents, (res) => this.updateQueueStatus(res.data, popupConfig));
        }
      } catch (error) {
        this.log('Status polling failed', 'error', error);
      }
    };

    this.statusInterval = setInterval(pollStatus, currentPollInterval);
  }

  /** Initializes the queue SDK with the provided configuration. */
  public static async init({
    wsUrl,
    apiUrl,
    socketConfig = {},
    popupConfig = {},
    customEvents = {},
    pollInterval = this.CONFIG.STATUS_POLL_INTERVAL,
    option = { storageKey: this.CONFIG.STORAGE_KEY },
  }: InitConfig): Promise<{ disconnect: () => void }> {
    if (!wsUrl || !apiUrl) throw new Error('Both wsUrl and apiUrl are required for initialization');
    if (typeof WebSocket === 'undefined') throw new Error('WebSocket is not supported in this environment.');

    this.state = {
      ...this.state,
      storageKey: option.storageKey ?? this.CONFIG.STORAGE_KEY,
      wsUrl,
      apiUrl,
      socketConfig,
    };
    this.injectStyles(popupConfig);

    try {
      const joinResponse = await fetch(`${apiUrl}${this.CONFIG.API_ENDPOINTS.JOIN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(socketConfig.query ?? {}),
      });
      const joinData: StatusResponse = await joinResponse.json();

      if (!joinData.data?.uuid) {
        this.log('Join response missing UUID', 'error');
        return { disconnect: () => this.disconnect() };
      }

      this.updateQueueStatus(joinData.data, popupConfig);

      if (joinData.data.status === OnlineQueueStatus.ACTIVE) {
        this.setupSocket(wsUrl, socketConfig, joinData.data.uuid, customEvents, (res) => this.updateQueueStatus(res.data, popupConfig));
      } else if (joinData.data.status === OnlineQueueStatus.WAITING) {
        this.startStatusPolling(wsUrl, apiUrl, socketConfig, joinData.data.uuid, pollInterval, popupConfig, customEvents);
      }

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
      wsUrl: null,
      apiUrl: null,
      socketConfig: null,
    };
    this.statusListeners = [];
  }

  /** Disconnects the WebSocket and cleans up resources. */
  private static disconnect(): void {
    if (this.state.socket?.readyState === WebSocket.OPEN && this.state.queueStatus?.uuid && this.state.apiUrl) {
      this.sendLeaveRequest();
    }
    this.state.socket?.close();
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
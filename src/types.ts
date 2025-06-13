/**
 * Configuration for the popup displayed during queue operations.
 */
export interface PopupConfig {
    /**
     * Custom HTML content for the popup or a function that returns content based on queue position.
     */
    content?: string | ((position: number) => string);
    /**
     * Language for popup messages ('en' for English, 'ko' for Korean).
     * Can be set via script tag attribute `data-language`.
     */
    language?: 'en' | 'ko';
    /**
     * Text color for popup content.
     * Can be set via script tag attribute `data-text-color`.
     */
    textColor?: string;
    /**
     * Starting color for the loader gradient.
     */
    loaderGradientStart?: string;
    /**
     * Ending color for the loader gradient.
     * Can be set via script tag attribute `data-loader-gradient-start`.
     */
    loaderGradientEnd?: string;
    /**
     * Custom CSS styles for the popup.
     * Can be set via script tag attribute `data-loader-gradient-end`.
     */
    style?: string;
    /**
     * Whether to show a loading popup during connection initialization.
     * Can be set via script tag attribute `data-show-loading` ('true'/'false').
     */
    isShowLoadingOnConnect?: boolean;
}

/**
 * Enum representing possible queue statuses.
 */
export enum OnlineQueueStatus {
    WAITING = 1,
    ACTIVE = 2,
    EMPTY = 3
}

/**
 * Response structure for queue status updates.
 */
export interface StatusResponse {
    /**
     * Unique identifier for the queue entry.
     */
    uuid: string;
    /**
     * Current position in the queue.
     */
    position: number;
    /**
     * Current status of the queue entry.
     */
    status: OnlineQueueStatus;
}

/**
 * Configuration for initializing the J-Queue SDK.
 * Can be passed programmatically or via script tag attributes with `data-` prefix.
 */
export interface InitConfig {
    /**
     * WebSocket URL for the queue service.
     * Optional; set via script tag attribute `data-ws-url`.
     * If not provided, determined by `data-mode`:
     * - 'dev': 'https://dev-api-extra-queue.pressai.kr'
     * - 'prod': 'https://api-extra-queue.pressai.kr' (default)
     */
    wsUrl?: string;
    /**
     * API URL for additional queue operations (e.g., leave request).
     * Set via script tag attribute `data-api-url`.
     */
    apiUrl?: string;
    /**
     * Configuration for the Socket.IO connection.
     */
    socketConfig?: {
        /**
         * Query parameters for the Socket.IO connection.
         * Supports `connect_key` for authentication, set via script tag attribute `data-connect-key`.
         */
        query?: Record<string, string | number | undefined>;
        /**
         * Transport methods for Socket.IO (e.g., ['websocket']).
         */
        transports?: string[];
        /**
         * Number of reconnection attempts.
         */
        reconnectionAttempts?: number;
        /**
         * Delay between reconnection attempts (in milliseconds).
         */
        reconnectionDelay?: number;
    };
    /**
     * Configuration for the popup UI.
     */
    popupConfig?: PopupConfig;
    /**
     * Custom event handlers for Socket.IO events.
     */
    customEvents?: Record<string, (data: any, utils: {
        createPopup: (html: string, style?: string) => void;
        removePopup: () => void;
        preventNavigation: () => void;
        allowNavigation: () => void;
    }) => void>;
    /**
     * Optional settings for storage keys.
     */
    option?: {
        /**
         * Key for storing the queue token in sessionStorage.
         * Set via script tag attribute `data-storage-token-key`.
         */
        storageTokenKey?: string;
        /**
         * Key for storing the connect key in sessionStorage.
         * Set via script tag attribute `data-storage-connect-key`.
         */
        storageConnectKey?: string;
    };
}
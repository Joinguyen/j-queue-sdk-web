/**
 * Configuration for the queue popup display.
 */
export interface PopupConfig {
    /** Language for popup messages ('en' or 'ko'). Defaults to 'ko'. */
    language?: 'en' | 'ko';
    /** Custom CSS styles for the popup. */
    style?: string;
    /** Custom HTML content for the popup, or a function returning content based on position. */
    content?: string | ((position: number) => string);
    /** Text color for popup content. Defaults to '#276bff'. */
    textColor?: string;
    /** Gradient start color for the loader. Defaults to '#276bff'. */
    loaderGradientStart?: string;
    /** Gradient end color for the loader. Defaults to 'rgba(39,107,255,0.05)'. */
    loaderGradientEnd?: string;
}

/**
 * Utilities provided to custom event handlers for controlling popup and navigation.
 */
export interface CustomEventUtils {
    /** Creates a popup with the specified HTML content and optional styles. */
    createPopup: (html: string, style?: string) => void;
    /** Removes the current popup from the DOM. */
    removePopup: () => void;
    /** Prevents page navigation by setting an onbeforeunload handler. */
    preventNavigation: () => void;
    /** Allows page navigation by removing the onbeforeunload handler. */
    allowNavigation: () => void;
}

/**
 * Configuration for initializing the queue SDK.
 */
export interface InitConfig {
    /** Base URL for the queue server (required). */
    url: string;
    /** Optional configuration for storage. */
    option?: {
        /** Key for storing queue UUID in sessionStorage. Defaults to 'queue_token'. */
        storageKey?: string;
    };
    /** Optional Socket.IO configuration. */
    socketConfig?: {
        /** Transport methods for Socket.IO. Defaults to ['websocket']. */
        transports?: string[];
        /** Number of reconnection attempts. Defaults to 3. */
        reconnectionAttempts?: number;
        /** Delay between reconnection attempts (ms). Defaults to 1000. */
        reconnectionDelay?: number;
        /** Query parameters for socket connection. */
        query?: Record<string, string | number | undefined>;
    };
    /** Optional popup configuration. */
    popupConfig?: PopupConfig;
    /** Optional custom event handlers. */
    customEvents?: Record<string, (data: unknown, utils: CustomEventUtils) => void>;
    /** Polling interval for status checks (ms). Defaults to 10000. */
    pollInterval?: number;
}

/**
 * Status of a queue entry.
 */
export enum OnlineQueueStatus {
    /** The client is waiting in the queue. */
    WAITING = 1,
    /** The client is active and can proceed. */
    ACTIVE = 2,
}
export interface PopupConfig {
    content?: string | ((position: number) => string);
    language?: 'en' | 'ko';
    textColor?: string;
    loaderGradientStart?: string;
    loaderGradientEnd?: string;
    style?: string;
}

export enum OnlineQueueStatus {
    WAITING = 1,
    ACTIVE = 2,
    EMPTY = 3
}

export interface CustomEventUtils {
    createPopup: (html: string, style?: string) => void;
    removePopup: () => void;
    preventNavigation: () => void;
    allowNavigation: () => void;
}

export type QueryParams = Record<string, string | number | undefined>;

export interface InitConfig {
    wsUrl: string;
    apiUrl: string;
    socketConfig?: {
        query?: QueryParams;
        transports?: string[];
        reconnectionAttempts?: number;
        reconnectionDelay?: number;
    };
    popupConfig?: PopupConfig;
    customEvents?: Record<string, (data: any, utils: CustomEventUtils) => void>;
    pollInterval?: number;
    option?: {
        storageKey?: string;
    };
}
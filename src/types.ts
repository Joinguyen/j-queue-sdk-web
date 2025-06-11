export interface PopupConfig {
    content?: string | ((position: number) => string);
    style?: string;
    language?: 'en' | 'ko';
    textColor?: string;
    loaderGradientStart?: string;
    loaderGradientEnd?: string;
}

export enum OnlineQueueStatus {
    WAITING = 1,
    ACTIVE = 2,
}

export interface CustomEventUtils {
    createPopup: (html: string, style?: string) => void;
    removePopup: () => void;
    preventNavigation: () => void;
    allowNavigation: () => void;
}

export type QueryParams = Record<string, string | number | undefined>;

export interface InitConfig {
    url: string;
    socketConfig?: {
        transports?: string[];
        reconnectionAttempts?: number;
        reconnectionDelay?: number;
        query?: QueryParams;
    };
    popupConfig?: PopupConfig;
    customEvents?: Record<string, (data: unknown, utils: CustomEventUtils) => void>;
    pollInterval?: number;
    option?: {
        storageKey?: string;
    };
}
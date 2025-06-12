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

export interface StatusResponse {
    uuid: string;
    position: number;
    status: OnlineQueueStatus;
}

export interface InitConfig {
    wsUrl: string;
    apiUrl: string;
    socketConfig?: {
        query?: Record<string, string | number | undefined>;
        transports?: string[];
        reconnectionAttempts?: number;
        reconnectionDelay?: number;
    };
    popupConfig?: PopupConfig;
    customEvents?: Record<string, (data: any, utils: {
        createPopup: (html: string, style?: string) => void;
        removePopup: () => void;
        preventNavigation: () => void;
        allowNavigation: () => void;
    }) => void>;
    option?: {
        storageTokenKey?: string;
        storageConnectKey?: string;
    };
}
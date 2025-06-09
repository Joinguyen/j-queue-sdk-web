import { Socket } from 'socket.io-client';

export interface PopupConfig {
    style?: string;
    content?: string | ((position: number) => string);
}

export interface CustomEventUtils {
    createPopup: (html: string, style?: string) => void;
    removePopup: () => void;
    preventNavigation: () => void;
    allowNavigation: () => void;
}

export interface InitConfig {
    url: string;
    socketConfig?: {
        transports?: string[];
        reconnectionAttempts?: number;
        reconnectionDelay?: number;
        query?: Record<string, any>;
    };
    popupConfig?: PopupConfig;
    customEvents?: Record<string, (data: unknown, utils: CustomEventUtils) => void>;
    pollInterval?: number;
}
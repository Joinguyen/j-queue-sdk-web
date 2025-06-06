import { Socket } from 'socket.io-client';

export interface PopupConfig {
    style?: string;
    content?: string | ((position?: number) => string);
}

export interface CustomEventUtils {
    createPopup: (html: string) => void;
    removePopup: () => void;
    preventNavigation: () => void;
    allowNavigation: () => void;
}

export interface InitConfig {
    url: string;
    socketConfig?: Record<string, any>;
    extraHeaders?: Record<string, any>;
    popupConfig?: PopupConfig;
    customEvents?: {
        [eventName: string]: (data: any, utils: CustomEventUtils) => void;
    };
}

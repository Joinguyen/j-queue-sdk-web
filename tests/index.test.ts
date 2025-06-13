import { io, Socket } from 'socket.io-client';
import ConnectionJQueueSdkWeb from '../src/index';
import { InitConfig, OnlineQueueStatus } from '../src/types';

// Mock socket.io-client
jest.mock('socket.io-client', () => {
    const mockSocket = {
        on: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
        connected: false,
    };
    return {
        io: jest.fn(() => mockSocket),
    };
});

// Mock browser APIs
const mockDocument = {
    createElement: jest.fn(),
    body: { appendChild: jest.fn(), removeChild: jest.fn() },
    head: { appendChild: jest.fn() },
    querySelector: jest.fn(),
    getElementsByTagName: jest.fn(() => []),
};
const mockWindow = {
    onbeforeunload: null,
    sessionStorage: {
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getItem: jest.fn(),
    },
    navigator: { sendBeacon: jest.fn() },
};
Object.defineProperty(global, 'document', { value: mockDocument });
Object.defineProperty(global, 'window', { value: mockWindow });

describe('ConnectionJQueueSdkWeb', () => {
    let mockSocket: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockSocket = {
            on: jest.fn(),
            emit: jest.fn(),
            disconnect: jest.fn(),
            connected: true,
        };
        (io as jest.Mock).mockReturnValue(mockSocket);
        // Reset static state
        (ConnectionJQueueSdkWeb as any).state = {
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
        (ConnectionJQueueSdkWeb as any).statusListeners = [];
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should initialize SDK with default config', async () => {
        const config: InitConfig = {
            wsUrl: 'https://test-api.com',
            apiUrl: 'https://test-api.com',
            socketConfig: { query: { connect_key: 'test_key' } },
            popupConfig: { isShowLoadingOnConnect: true },
        };

        const result = await ConnectionJQueueSdkWeb.init(config);

        expect(io).toHaveBeenCalledWith('https://test-api.com', {
            query: { connect_key: 'test_key', uuid: '' },
            transports: ['websocket'],
            reconnectionAttempts: 3,
            reconnectionDelay: 1000,
        });
        expect(mockDocument.createElement).toHaveBeenCalledWith('style');
        expect(result).toHaveProperty('disconnect');
    });

    test('should create popup when isShowLoadingOnConnect is true', async () => {
        const config: InitConfig = {
            popupConfig: { isShowLoadingOnConnect: true, language: 'en' },
        };

        await ConnectionJQueueSdkWeb.init(config);

        expect(mockDocument.createElement).toHaveBeenCalledWith('div');
        expect(mockDocument.body.appendChild).toHaveBeenCalled();
    });

    test('should handle online-queue:status event with WAITING status', async () => {
        const config: InitConfig = {
            wsUrl: 'https://test-api.com',
            popupConfig: { language: 'ko' },
        };
        const statusResponse = {
            uuid: 'test-uuid',
            position: 5,
            status: OnlineQueueStatus.WAITING,
        };

        await ConnectionJQueueSdkWeb.init(config);
        const statusCallback = mockSocket.on.mock.calls.find(
            (call: any) => call[0] === 'online-queue:status'
        )[1];
        statusCallback(statusResponse);

        expect(mockWindow.sessionStorage.setItem).toHaveBeenCalledWith('queue_token', 'test-uuid');
        expect(mockDocument.createElement).toHaveBeenCalledWith('div');
    });

    test('should handle online-queue:status event with ACTIVE status', async () => {
        const config: InitConfig = {
            wsUrl: 'https://test-api.com',
            popupConfig: { language: 'ko' },
        };
        const statusResponse = {
            uuid: 'test-uuid',
            position: 0,
            status: OnlineQueueStatus.ACTIVE,
        };

        await ConnectionJQueueSdkWeb.init(config);
        const statusCallback = mockSocket.on.mock.calls.find(
            (call: any) => call[0] === 'online-queue:status'
        )[1];
        statusCallback(statusResponse);

        expect(mockWindow.onbeforeunload).toBeNull();
    });

    test('should disconnect and cleanup properly', async () => {
        const config: InitConfig = {
            wsUrl: 'https://test-api.com',
            apiUrl: 'https://test-api.com',
        };
        const { disconnect } = await ConnectionJQueueSdkWeb.init(config);

        // Simulate connected state
        (ConnectionJQueueSdkWeb as any).state.queueStatus = { uuid: 'test-uuid' };
        (ConnectionJQueueSdkWeb as any).state.socket.connected = true;

        disconnect();

        expect(mockSocket.disconnect).toHaveBeenCalled();
        expect(mockWindow.sessionStorage.removeItem).toHaveBeenCalledWith('queue_token');
        expect(mockWindow.onbeforeunload).toBeNull();
    });

    test('should add and remove status listeners', () => {
        const listener1 = jest.fn();
        const listener2 = jest.fn();

        ConnectionJQueueSdkWeb.addStatusListener(listener1);
        ConnectionJQueueSdkWeb.addStatusListener(listener2);
        ConnectionJQueueSdkWeb.removeStatusListener(listener1);

        // Simulate status update
        (ConnectionJQueueSdkWeb as any).updateQueueStatus({
            uuid: 'test-uuid',
            position: 10,
            status: OnlineQueueStatus.WAITING,
        });

        expect(listener2).toHaveBeenCalledWith({
            uuid: 'test-uuid',
            position: 10,
            status: OnlineQueueStatus.WAITING,
        });
        expect(listener1).not.toHaveBeenCalled();
    });

    test('should initialize from script attributes', () => {
        mockDocument.getElementsByTagName.mockReturnValue([
            {
                src: 'j-queue-sdk-web.js',
                getAttribute: jest.fn((attr: string) => {
                    const attrs: Record<string, string> = {
                        'data-ws-url': 'https://custom-api.com',
                        'data-api-url': 'https://custom-api.com',
                        'data-connect-key': 'custom_key',
                        'data-show-loading': 'true',
                        'data-language': 'en',
                    };
                    return attrs[attr] || null;
                }),
            },
        ] as any);

        ConnectionJQueueSdkWeb.initFromScriptAttributes();

        expect(io).toHaveBeenCalledWith('https://custom-api.com', expect.any(Object));
    });
});
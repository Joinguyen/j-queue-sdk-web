// tests/index.test.ts
import ConnectionJQueueSdkWeb, { InitConfig } from '../src/index';

import { io } from 'socket.io-client';
import { OnlineQueueStatus } from '../src/types';

jest.mock('socket.io-client', () => {
    const mSocket = {
        on: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
        connected: false,
    };
    return {
        io: jest.fn(() => mSocket),
    };
});

describe('ConnectionJQueueSdkWeb', () => {
    let socketMock: any;

    beforeEach(() => {
        jest.clearAllMocks();
        socketMock = (io as jest.Mock).mock.results[0]?.value;
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        window.onbeforeunload = null;
    });

    afterEach(() => {
        // Ensure cleanup of any intervals or DOM changes
        jest.useRealTimers();
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        window.onbeforeunload = null;
    });

    test('should initialize socket connection with default config', () => {
        const config: InitConfig = {
            url: 'wss://queue-server.example.com',
        };

        const conn = ConnectionJQueueSdkWeb.init(config);

        expect(io).toHaveBeenCalledWith('wss://queue-server.example.com', {
            transports: ['websocket'],
            reconnectionAttempts: 3,
            reconnectionDelay: 1000,
        });

        expect(socketMock.on).toHaveBeenCalledWith('connect', expect.any(Function));
        expect(socketMock.on).toHaveBeenCalledWith('online-queue:status', expect.any(Function));
        expect(socketMock.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
        expect(socketMock.on).toHaveBeenCalledWith('disconnect', expect.any(Function));

        // Test disconnect method
        conn.disconnect();
        expect(socketMock.disconnect).toHaveBeenCalled();
        expect(document.body.innerHTML).toBe('');
        expect(window.onbeforeunload).toBeNull();
    });

    test('should create popup and prevent navigation on WAITING status', () => {
        const config: InitConfig = {
            url: 'wss://queue-server.example.com',
            popupConfig: {
                language: 'en',
            },
        };

        ConnectionJQueueSdkWeb.init(config);

        // Simulate connect event to start polling
        const connectHandler = socketMock.on.mock.calls.find((call: any) => call[0] === 'connect')?.[1];
        connectHandler();

        // Simulate status event with WAITING status
        const statusHandler = socketMock.on.mock.calls.find((call: any) => call[0] === 'online-queue:status')?.[1];
        statusHandler({ data: { uuid: 'test-uuid', position: 5, status: OnlineQueueStatus.WAITING } });

        expect(document.body.innerHTML).toContain('__jqueue_popup');
        expect(document.body.innerHTML).toContain('Position: 5');
        expect(window.onbeforeunload).not.toBeNull();
        expect(socketMock.emit).toHaveBeenCalledWith('online-queue:status', {});
    });

    test('should remove popup and allow navigation on ACTIVE status', () => {
        const config: InitConfig = {
            url: 'wss://queue-server.example.com',
            popupConfig: {
                language: 'en',
            },
        };

        ConnectionJQueueSdkWeb.init(config);

        // Simulate connect event to start polling
        const connectHandler = socketMock.on.mock.calls.find((call: any) => call[0] === 'connect')?.[1];
        connectHandler();

        // Simulate WAITING status first
        const statusHandler = socketMock.on.mock.calls.find((call: any) => call[0] === 'online-queue:status')?.[1];
        statusHandler({ data: { uuid: 'test-uuid', position: 5, status: OnlineQueueStatus.WAITING } });

        // Simulate ACTIVE status
        statusHandler({ data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE } });

        expect(document.body.innerHTML).toBe('');
        expect(window.onbeforeunload).toBeNull();
        expect(socketMock.emit).not.toHaveBeenCalledWith('online-queue:status', {}); // Polling should stop
    });

    test('should handle custom event and trigger provided handler', () => {
        const customHandler = jest.fn();
        const config: InitConfig = {
            url: 'wss://queue-server.example.com',
            customEvents: {
                'custom-event': customHandler,
            },
        };

        ConnectionJQueueSdkWeb.init(config);

        // Simulate custom event
        const registeredHandler = socketMock.on.mock.calls.find((call: any) => call[0] === 'custom-event')?.[1];
        registeredHandler({ message: 'Hello' });

        expect(customHandler).toHaveBeenCalledWith(
            { message: 'Hello' },
            expect.objectContaining({
                createPopup: expect.any(Function),
                removePopup: expect.any(Function),
                preventNavigation: expect.any(Function),
                allowNavigation: expect.any(Function),
            })
        );

        // Test utility functions in custom event
        const utils = customHandler.mock.calls[0][1];
        utils.createPopup('<div>Test</div>');
        expect(document.body.innerHTML).toContain('__jqueue_popup');
        expect(document.body.innerHTML).toContain('Test');

        utils.preventNavigation();
        expect(window.onbeforeunload).not.toBeNull();

        utils.removePopup();
        expect(document.body.innerHTML).toBe('');

        utils.allowNavigation();
        expect(window.onbeforeunload).toBeNull();
    });

    test('should handle invalid status response gracefully', () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const config: InitConfig = {
            url: 'wss://queue-server.example.com',
        };

        ConnectionJQueueSdkWeb.init(config);

        // Simulate connect event
        const connectHandler = socketMock.on.mock.calls.find((call: any) => call[0] === 'connect')?.[1];
        connectHandler();

        // Simulate invalid status response
        const statusHandler = socketMock.on.mock.calls.find((call: any) => call[0] === 'online-queue:status')?.[1];
        statusHandler({ data: null });

        expect(consoleWarnSpy).toHaveBeenCalledWith('[J-Queue] Invalid status response received, uuid: unknown');
        expect(document.body.innerHTML).toBe('');
        expect(window.onbeforeunload).toBeNull();

        consoleWarnSpy.mockRestore();
    });

    test('should inject styles only once', () => {
        const config: InitConfig = {
            url: 'wss://queue-server.example.com',
        };

        ConnectionJQueueSdkWeb.init(config);
        ConnectionJQueueSdkWeb.init(config); // Second init should not add styles again

        expect(document.querySelectorAll('style[data-jqueue-styles]').length).toBe(1);
        expect(document.head.innerHTML).toContain('.loader-jqueue_popup');
    });

    test('should handle disconnect event and clean up', () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const config: InitConfig = {
            url: 'wss://queue-server.example.com',
        };

        ConnectionJQueueSdkWeb.init(config);

        // Simulate connect event to start polling
        const connectHandler = socketMock.on.mock.calls.find((call: any) => call[0] === 'connect')?.[1];
        connectHandler();

        // Simulate disconnect event
        const disconnectHandler = socketMock.on.mock.calls.find((call: any) => call[0] === 'disconnect')?.[1];
        disconnectHandler('server');

        expect(consoleWarnSpy).toHaveBeenCalledWith('[J-Queue] Disconnected from server: server');
        expect(socketMock.emit).not.toHaveBeenCalledWith('online-queue:status', {}); // Polling should stop

        consoleWarnSpy.mockRestore();
    });
});

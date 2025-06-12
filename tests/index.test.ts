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
    return { io: jest.fn(() => mockSocket) };
});

describe('ConnectionJQueueSdkWeb', () => {
    let mockSocket: Partial<Socket>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
        // Clear mocks and spies
        jest.clearAllMocks();
        mockSocket = {
            on: jest.fn(),
            emit: jest.fn(),
            disconnect: jest.fn(),
            connected: true,
        };
        (io as jest.Mock).mockReturnValue(mockSocket);

        // Mock browser APIs
        Object.defineProperty(window, 'document', {
            value: {
                createElement: jest.fn().mockReturnValue({
                    setAttribute: jest.fn(),
                    appendChild: jest.fn(),
                    remove: jest.fn(),
                }),
                querySelector: jest.fn().mockReturnValue(null),
                body: { appendChild: jest.fn(), removeChild: jest.fn() },
                head: { appendChild: jest.fn() },
            },
            writable: true,
        });
        Object.defineProperty(window, 'sessionStorage', {
            value: {
                setItem: jest.fn(),
                removeItem: jest.fn(),
            },
            writable: true,
        });
        Object.defineProperty(window, 'navigator', {
            value: { sendBeacon: jest.fn() },
            writable: true,
        });

        // Spy on console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

        // Mock setInterval and clearInterval
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        (window as any).onbeforeunload = null;
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    describe('init', () => {
        it('should throw error if wsUrl is missing', async () => {
            await expect(ConnectionJQueueSdkWeb.init({ wsUrl: '', apiUrl: 'http://api.test' } as InitConfig))
                .rejects.toThrow('Both wsUrl are required');
        });

        it('should throw error if window is undefined', async () => {
            const originalWindow = global.window;
            delete (global as any).window;
            await expect(ConnectionJQueueSdkWeb.init({ wsUrl: 'ws://test', apiUrl: 'http://api.test' }))
                .rejects.toThrow('Socket.IO is not supported in this environment');
            global.window = originalWindow;
        });

        it('should initialize socket and return disconnect function', async () => {
            const config: InitConfig = {
                wsUrl: 'ws://test',
                apiUrl: 'http://api.test',
                socketConfig: { query: { token: '123', connect_key: 'key123' } },
                option: { storageTokenKey: 'queue_token', storageConnectKey: 'connect_key' }
            };
            const result = await ConnectionJQueueSdkWeb.init(config);
            expect(io).toHaveBeenCalledWith('ws://test', expect.objectContaining({
                query: { token: '123', connect_key: 'key123', uuid: '' },
                transports: ['websocket'],
                reconnectionAttempts: 3,
                reconnectionDelay: 1000,
            }));
            expect(sessionStorage.setItem).toHaveBeenCalledWith('connect_key', 'key123');
            expect(result).toEqual({ disconnect: expect.any(Function) });
        });
    });

    describe('handleStatusUpdate', () => {
        let config: InitConfig;
        let statusHandler: (data: any) => void;

        beforeEach(async () => {
            config = {
                wsUrl: 'ws://test',
                apiUrl: 'http://api.test',
                popupConfig: {},
                option: { storageTokenKey: 'queue_token', storageConnectKey: 'connect_key' }
            };
            await ConnectionJQueueSdkWeb.init(config);
            statusHandler = (mockSocket.on as any)?.mock?.calls.find(([event]: any) => event === 'online-queue:status')![1];
        });

        it('should log warning for invalid status response', () => {
            statusHandler(null);
            expect(consoleWarnSpy).toHaveBeenCalledWith('[J-Queue] Invalid status response received', '');
        });

        it('should handle ACTIVE status', () => {
            const data = { uuid: '123', position: 0, status: OnlineQueueStatus.ACTIVE };
            statusHandler(data);

            expect(sessionStorage.setItem).toHaveBeenCalledWith('queue_token', '123');
            expect(window.document.body.appendChild).not.toHaveBeenCalled();
            expect(window.onbeforeunload).toBeNull();
            expect(mockSocket.emit).toHaveBeenCalledWith('online-queue:check-disconnected', { uuid: '123' });
            jest.advanceTimersByTime(30000);
            expect(mockSocket.emit).toHaveBeenCalledWith('online-queue:check-disconnected', { uuid: '123' });
            expect(consoleLogSpy).toHaveBeenCalledWith('[J-Queue] Sent online-queue:check-disconnected', '');
        });

        it('should handle WAITING status', () => {
            const data = { uuid: '123', position: 50, status: OnlineQueueStatus.WAITING };
            statusHandler(data);

            expect(sessionStorage.setItem).toHaveBeenCalledWith('queue_token', '123');
            expect(window.document.body.appendChild).toHaveBeenCalled();
            expect(window.onbeforeunload).toBeDefined();
            expect(mockSocket.emit).toHaveBeenCalledWith('online-queue:status', { uuid: '123' });
            jest.advanceTimersByTime(2000);
            expect(mockSocket.emit).toHaveBeenCalledWith('online-queue:status', { uuid: '123' });
            expect(consoleLogSpy).toHaveBeenCalledWith('[J-Queue] Sent online-queue:status', '');
        });

        it('should handle EMPTY status', () => {
            const data = { uuid: '123', position: 0, status: OnlineQueueStatus.EMPTY };
            statusHandler(data);

            expect(sessionStorage.setItem).toHaveBeenCalledWith('queue_token', '123');
            expect(window.document.body.appendChild).not.toHaveBeenCalled();
            expect(window.onbeforeunload).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith('[j-queue-sdk-web] - Connect key does not exist!', '');
            expect(mockSocket.emit).not.toHaveBeenCalled();
        });
    });

    describe('socket events', () => {
        let config: InitConfig;
        let connectHandler: () => void;
        let disconnectHandler: (reason: string) => void;
        let connectErrorHandler: (error: Error) => void;

        beforeEach(async () => {
            config = {
                wsUrl: 'ws://test',
                apiUrl: 'http://api.test',
                popupConfig: {},
                option: { storageTokenKey: 'queue_token', storageConnectKey: 'connect_key' }
            };
            await ConnectionJQueueSdkWeb.init(config);
            connectHandler = (mockSocket.on as any)?.mock?.calls.find(([event]: any) => event === 'connect')![1];
            disconnectHandler = (mockSocket.on as any)?.mock?.calls.find(([event]: any) => event === 'disconnect')![1];
            connectErrorHandler = (mockSocket.on as any)?.mock?.calls.find(([event]: any) => event === 'connect_error')![1];
        });

        it('should log connection and start status emission', () => {
            connectHandler();
            expect(consoleLogSpy).toHaveBeenCalledWith('[J-Queue] Socket.IO connected', '');
            expect(mockSocket.emit).toHaveBeenCalledWith('online-queue:status', {});
            jest.advanceTimersByTime(2000);
            expect(mockSocket.emit).toHaveBeenCalledWith('online-queue:status', {});
        });

        it('should log connection error', () => {
            const error = new Error('Connection failed');
            connectErrorHandler(error);
            expect(consoleErrorSpy).toHaveBeenCalledWith('[J-Queue] Socket.IO connection error', error);
        });

        it('should log disconnection and clear interval', () => {
            disconnectHandler('io server disconnect');
            expect(consoleWarnSpy).toHaveBeenCalledWith('[J-Queue] Socket.IO disconnected: io server disconnect', '');
            expect(mockSocket.emit).not.toHaveBeenCalled();
        });
    });

    describe('disconnect', () => {
        it('should send leave request and clean up resources', async () => {
            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://test',
                apiUrl: 'http://api.test',
                popupConfig: {},
                option: { storageTokenKey: 'queue_token', storageConnectKey: 'connect_key' }
            });
            (ConnectionJQueueSdkWeb as any).state.queueStatus = { uuid: '123' };
            (ConnectionJQueueSdkWeb as any).state.apiUrl = 'http://api.test';
            const disconnect = (await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://test',
                apiUrl: 'http://api.test',
                option: { storageTokenKey: 'queue_token', storageConnectKey: 'connect_key' }
            })).disconnect;

            disconnect();
            expect(navigator.sendBeacon).toHaveBeenCalledWith('http://api.test/leave', JSON.stringify({ uuid: '123' }));
            expect(mockSocket.disconnect).toHaveBeenCalled();
            expect(sessionStorage.removeItem).toHaveBeenCalledWith('queue_token');
            expect(sessionStorage.removeItem).toHaveBeenCalledWith('connect_key');
            expect(window.onbeforeunload).toBeNull();
        });
    });

    describe('status listeners', () => {
        it('should add and invoke status listeners', async () => {
            const listener = jest.fn();
            ConnectionJQueueSdkWeb.addStatusListener(listener);
            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://test',
                apiUrl: 'http://api.test',
                popupConfig: {},
                option: { storageTokenKey: 'queue_token', storageConnectKey: 'connect_key' }
            });
            const statusHandler = (mockSocket.on as any)?.mock?.calls.find(([event]: any) => event === 'online-queue:status')![1];

            const data = { uuid: '123', position: 50, status: OnlineQueueStatus.WAITING };
            statusHandler(data);
            expect(listener).toHaveBeenCalledWith({ uuid: '123', position: 50, status: OnlineQueueStatus.WAITING });
        });

        it('should remove status listeners', async () => {
            const listener = jest.fn();
            ConnectionJQueueSdkWeb.addStatusListener(listener);
            ConnectionJQueueSdkWeb.removeStatusListener(listener);
            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://test',
                apiUrl: 'http://api.test',
                popupConfig: {},
                option: { storageTokenKey: 'queue_token', storageConnectKey: 'connect_key' }
            });
            const statusHandler = (mockSocket.on as any)?.mock?.calls.find(([event]: any) => event === 'online-queue:status')![1];

            statusHandler({ uuid: '123', position: 50, status: OnlineQueueStatus.WAITING });
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('getQueueStatus', () => {
        it('should return current queue status', async () => {
            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://test',
                apiUrl: 'http://api.test',
                popupConfig: {},
                option: { storageTokenKey: 'queue_token', storageConnectKey: 'connect_key' }
            });
            const statusHandler = (mockSocket.on as any)?.mock?.calls.find(([event]: any) => event === 'online-queue:status')![1];
            const data = { uuid: '123', position: 50, status: OnlineQueueStatus.WAITING };
            statusHandler(data);

            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toEqual({ uuid: '123', position: 50, status: OnlineQueueStatus.WAITING });
        });
    });
});
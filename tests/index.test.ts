import { OnlineQueueStatus, InitConfig } from '../src/types';
import ConnectionJQueueSdkWeb from '../src/index';
import { io, Socket } from 'socket.io-client';
import '@testing-library/jest-dom';

jest.mock('socket.io-client', () => {
    const mockSocket = {
        on: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
        connected: true,
        connect: jest.fn(),
    };
    return { io: jest.fn(() => mockSocket), Socket: jest.fn(() => mockSocket) };
});

describe('ConnectionJQueueSdkWeb', () => {
    let mockSocket: jest.Mocked<Socket>;
    let originalWindow: typeof window;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });

        // Get the mocked socket instance
        mockSocket = (io as jest.Mock)().mock.results[0].value;

        // Mock window and document
        originalWindow = global.window;
        global.window = {
            ...global.window,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            sessionStorage: {
                setItem: jest.fn(),
                getItem: jest.fn(),
                removeItem: jest.fn(),
                clear: jest.fn(),
            },
            onbeforeunload: null,
            navigator: {
                sendBeacon: jest.fn(),
            } as any,
            document: {
                createElement: jest.fn().mockImplementation((tag) => {
                    if (tag === 'style') return { dataset: {}, textContent: '' };
                    if (tag === 'div') return { id: '', style: {}, innerHTML: '', remove: jest.fn() };
                    return {};
                }),
                querySelector: jest.fn().mockReturnValue(null),
                head: { appendChild: jest.fn() },
                body: { appendChild: jest.fn() },
            } as any,
        } as any;

        // Mock fetch
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
        global.window = originalWindow;
        ConnectionJQueueSdkWeb['cleanup'](); // Access private cleanup
    });

    describe('init', () => {
        it('throws error if wsUrl or apiUrl is not provided', async () => {
            await expect(ConnectionJQueueSdkWeb.init({ wsUrl: '', apiUrl: 'https://api.example.com' } as InitConfig)).rejects.toThrow(
                'Both wsUrl and apiUrl are required for initialization'
            );
            await expect(ConnectionJQueueSdkWeb.init({ wsUrl: 'ws://example.com', apiUrl: '' } as InitConfig)).rejects.toThrow(
                'Both wsUrl and apiUrl are required for initialization'
            );
        });

        it('throws error if browser environment is not supported', async () => {
            const originalWindow = global.window;
            (global as any).window = undefined;
            await expect(ConnectionJQueueSdkWeb.init({ wsUrl: 'ws://example.com', apiUrl: 'https://api.example.com' })).rejects.toThrow(
                'Socket.IO is not supported in this environment.'
            );
            global.window = originalWindow;
        });

        it('calls join API and sets up state for ACTIVE status', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            const config: InitConfig = {
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
                socketConfig: { query: { token: '123' } },
            };
            const result = await ConnectionJQueueSdkWeb.init(config);

            expect(fetch).toHaveBeenCalledWith('https://api.example.com/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: '123' }),
            });
            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toEqual(mockResponse.data);
            expect(window.sessionStorage.setItem).toHaveBeenCalledWith('queue_token', 'test-uuid');
            expect(io).toHaveBeenCalledWith('ws://websocket.example.com', {
                query: { token: '123', uuid: 'test-uuid' },
                transports: ['websocket'],
                reconnectionAttempts: 3,
                reconnectionDelay: 1000,
            });
            expect(result).toEqual({ disconnect: expect.any(Function) });
        });

        it('starts polling for WAITING status with adjusted pollInterval', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 150, status: OnlineQueueStatus.WAITING },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
                socketConfig: { query: { token: '123' } },
            });

            expect(fetch).toHaveBeenCalledTimes(1);
            expect(document.createElement).toHaveBeenCalledWith('div');
            expect(window.onbeforeunload).toBeTruthy();

            // First poll after 2500ms (1000 + 1500ms due to position 150 / 100 * 1000)
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue({
                    data: { uuid: 'test-uuid', position: 50, status: OnlineQueueStatus.WAITING },
                }),
            });

            jest.advanceTimersByTime(2500);
            await Promise.resolve();

            expect(fetch).toHaveBeenCalledWith('https://api.example.com/status?uuid=test-uuid', expect.any(Object));
            expect(fetch).toHaveBeenCalledTimes(2);

            // Next poll after 1000ms (position 50 < 100)
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue({
                    data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
                }),
            });

            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(fetch).toHaveBeenCalledTimes(3);
            expect(io).toHaveBeenCalledWith('ws://websocket.example.com', {
                query: { token: '123', uuid: 'test-uuid' },
                transports: ['websocket'],
                reconnectionAttempts: 3,
                reconnectionDelay: 1000,
            });
            expect(window.onbeforeunload).toBeNull();
        });

        it('handles join API failure gracefully', async () => {
            (fetch as jest.Mock).mockRejectedValueOnce(new Error('fetch error'));

            const result = await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
            });

            expect(console.error).toHaveBeenCalledWith('[J-Queue] Initialization failed', expect.any(Error));
            expect(result).toEqual({ disconnect: expect.any(Function) });
        });
    });

    describe('Socket.IO setup', () => {
        it('sends online-queue:set-ttl every 5 seconds after connection', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
                socketConfig: { query: { token: '123' } },
            });

            // Trigger connect
            const connectHandler = mockSocket.on.mock.calls.find(([event]) => event === 'connect')?.[1];
            connectHandler?.();

            expect(mockSocket.emit).not.toHaveBeenCalled();

            jest.advanceTimersByTime(5000);
            expect(mockSocket.emit).toHaveBeenCalledWith('online-queue:set-ttl', { token: '123', uuid: 'test-uuid' });

            jest.advanceTimersByTime(5000);
            expect(mockSocket.emit).toHaveBeenCalledTimes(2);

            // Trigger disconnect
            const disconnectHandler = mockSocket.on.mock.calls.find(([event]) => event === 'disconnect')?.[1];
            disconnectHandler?.('io server disconnect');

            jest.advanceTimersByTime(5000);
            expect(mockSocket.emit).toHaveBeenCalledTimes(2); // No further emits after disconnect
        });

        it('handles online-queue:status messages', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
            });

            const statusListener = jest.fn();
            ConnectionJQueueSdkWeb.addStatusListener(statusListener);

            // Trigger online-queue:status
            const statusHandler = mockSocket.on.mock.calls.find(([event]) => event === 'online-queue:status')?.[1];
            statusHandler?.({ data: { uuid: 'test-uuid', position: 2, status: OnlineQueueStatus.ACTIVE } });

            expect(statusListener).toHaveBeenCalledWith({ uuid: 'test-uuid', position: 2, status: OnlineQueueStatus.ACTIVE });
        });

        it('handles custom events', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            const customEventHandler = jest.fn();
            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
                customEvents: { 'custom-event': customEventHandler },
            });

            // Trigger custom event
            const customHandler = mockSocket.on.mock.calls.find(([event]) => event === 'custom-event')?.[1];
            customHandler?.({ some: 'data' });

            expect(customEventHandler).toHaveBeenCalledWith(
                { some: 'data' },
                expect.objectContaining({
                    createPopup: expect.any(Function),
                    removePopup: expect.any(Function),
                    preventNavigation: expect.any(Function),
                    allowNavigation: expect.any(Function),
                })
            );
        });
    });

    describe('status listeners', () => {
        it('adds and removes status listeners', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            const listener1 = jest.fn();
            const listener2 = jest.fn();

            ConnectionJQueueSdkWeb.addStatusListener(listener1);
            ConnectionJQueueSdkWeb.addStatusListener(listener2);

            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
            });

            expect(listener1).toHaveBeenCalledWith(mockResponse.data);
            expect(listener2).toHaveBeenCalledWith(mockResponse.data);

            ConnectionJQueueSdkWeb.removeStatusListener(listener1);

            const statusHandler = mockSocket.on.mock.calls.find(([event]) => event === 'online-queue:status')?.[1];
            statusHandler?.({ data: { uuid: 'test-uuid', position: 2, status: OnlineQueueStatus.ACTIVE } });

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(2);
        });
    });

    describe('popup management', () => {
        it('creates popup for WAITING status', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 150, status: OnlineQueueStatus.WAITING },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
            });

            expect(document.createElement).toHaveBeenCalledWith('div');
            expect(document.body.appendChild).toHaveBeenCalled();
        });

        it('removes popup for ACTIVE status', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
            });

            expect(document.createElement).not.toHaveBeenCalledWith('div');
            expect(document.body.appendChild).not.toHaveBeenCalled();
        });
    });

    describe('navigation blocking', () => {
        it('blocks navigation for WAITING status', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 150, status: OnlineQueueStatus.WAITING },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
            });

            expect(window.onbeforeunload).toBeTruthy();
        });

        it('allows navigation for ACTIVE status', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
            });

            expect(window.onbeforeunload).toBeNull();
        });
    });

    describe('leave request', () => {
        it('sends leave request on disconnect', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            const { disconnect } = await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
                socketConfig: { query: { token: '123' } },
            });

            // Trigger connect to set connected to true
            const connectHandler = mockSocket.on.mock.calls.find(([event]) => event === 'connect')?.[1];
            connectHandler?.();

            disconnect();

            expect(window.navigator.sendBeacon).toHaveBeenCalledWith(
                'https://api.example.com/leave',
                JSON.stringify({ uuid: 'test-uuid' })
            );
        });

        it('sends leave request on navigation', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 150, status: OnlineQueueStatus.WAITING },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
            });

            // Trigger onbeforeunload
            const onbeforeunload = window.onbeforeunload as () => string;
            onbeforeunload();

            expect(window.navigator.sendBeacon).toHaveBeenCalledWith(
                'https://api.example.com/leave',
                JSON.stringify({ uuid: 'test-uuid' })
            );
        });
    });

    describe('cleanup', () => {
        it('resets state and clears resources on disconnect', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            const { disconnect } = await ConnectionJQueueSdkWeb.init({
                wsUrl: 'ws://websocket.example.com',
                apiUrl: 'https://api.example.com',
            });

            const listener = jest.fn();
            ConnectionJQueueSdkWeb.addStatusListener(listener);

            // Trigger connect to start TTL interval
            const connectHandler = mockSocket.on.mock.calls.find(([event]) => event === 'connect')?.[1];
            connectHandler?.();
            jest.advanceTimersByTime(5000);

            disconnect();

            expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('queue_token');
            expect(mockSocket.disconnect).toHaveBeenCalled();
            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toBeNull();
            expect(ConnectionJQueueSdkWeb['statusListeners']).toHaveLength(0);
            expect(window.onbeforeunload).toBeNull();
            jest.advanceTimersByTime(5000);
            expect(mockSocket.emit).not.toHaveBeenCalled(); // TTL interval cleared
        });
    });
});
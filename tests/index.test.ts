import { OnlineQueueStatus, InitConfig } from '../src/types';
import ConnectionJQueueSdkWeb from '../src/index';
import '@testing-library/jest-dom';

describe('ConnectionJQueueSdkWeb', () => {
    let mockWebSocket: jest.Mocked<WebSocket>;
    let originalWindow: typeof window;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });

        // Mock WebSocket
        mockWebSocket = {
            onopen: null,
            onmessage: null,
            onerror: null,
            onclose: null,
            send: jest.fn(),
            close: jest.fn(),
            readyState: WebSocket.OPEN,
        } as any;
        jest.spyOn(global, 'WebSocket').mockImplementation(() => mockWebSocket);

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

        it('throws error if WebSocket is not supported', async () => {
            const originalWebSocket = global.WebSocket;
            (global as any).WebSocket = undefined;
            await expect(ConnectionJQueueSdkWeb.init({ wsUrl: 'ws://example.com', apiUrl: 'https://api.example.com' })).rejects.toThrow(
                'WebSocket is not supported in this environment.'
            );
            global.WebSocket = originalWebSocket;
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

            expect(fetch).toHaveBeenCalledWith('https://api.example.com/api/v1/online-queue/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: '123' }),
            });
            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toEqual(mockResponse.data);
            expect(window.sessionStorage.setItem).toHaveBeenCalledWith('queue_token', 'test-uuid');
            expect(WebSocket).toHaveBeenCalledWith('ws://websocket.example.com?token=123&uuid=test-uuid');
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

            expect(fetch).toHaveBeenCalledWith('https://api.example.com/api/v1/online-queue/status?uuid=test-uuid', expect.any(Object));
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
            expect(WebSocket).toHaveBeenCalledWith('ws://websocket.example.com?token=123&uuid=test-uuid');
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

    describe('WebSocket setup', () => {
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

            // Trigger onopen
            mockWebSocket.onopen?.(new Event('open'));

            expect(mockWebSocket.send).not.toHaveBeenCalled();

            jest.advanceTimersByTime(5000);
            expect(mockWebSocket.send).toHaveBeenCalledWith(
                JSON.stringify({ event: 'online-queue:set-ttl', data: { token: '123', uuid: 'test-uuid' } })
            );

            jest.advanceTimersByTime(5000);
            expect(mockWebSocket.send).toHaveBeenCalledTimes(2);

            // Trigger onclose
            mockWebSocket.onclose?.(new CloseEvent('close', { code: 1000, reason: 'normal' }));

            jest.advanceTimersByTime(5000);
            expect(mockWebSocket.send).toHaveBeenCalledTimes(2); // No further sends after close
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

            // Trigger onmessage with status
            const statusMessage = { event: 'online-queue:status', data: { data: { uuid: 'test-uuid', position: 2, status: OnlineQueueStatus.ACTIVE } } };
            mockWebSocket.onmessage?.(new MessageEvent('message', { data: JSON.stringify(statusMessage) }));

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

            // Trigger onmessage with custom event
            const customMessage = { event: 'custom-event', data: { some: 'data' } };
            mockWebSocket.onmessage?.(new MessageEvent('message', { data: JSON.stringify(customMessage) }));

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

            const statusMessage = { event: 'online-queue:status', data: { data: { uuid: 'test-uuid', position: 2, status: OnlineQueueStatus.ACTIVE } } };
            mockWebSocket.onmessage?.(new MessageEvent('message', { data: JSON.stringify(statusMessage) }));

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

            // Trigger onopen to set readyState to OPEN
            mockWebSocket.onopen?.(new Event('open'));

            disconnect();

            expect(window.navigator.sendBeacon).toHaveBeenCalledWith(
                'https://api.example.com/api/v1/online-queue/leave',
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
                'https://api.example.com/api/v1/online-queue/leave',
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

            // Trigger onopen to start TTL interval
            mockWebSocket.onopen?.(new Event('open'));
            jest.advanceTimersByTime(5000);

            disconnect();

            expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('queue_token');
            expect(mockWebSocket.close).toHaveBeenCalled();
            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toBeNull();
            expect(ConnectionJQueueSdkWeb['statusListeners']).toHaveLength(0);
            expect(window.onbeforeunload).toBeNull();
            jest.advanceTimersByTime(5000);
            expect(mockWebSocket.send).not.toHaveBeenCalled(); // TTL interval cleared
        });
    });
});
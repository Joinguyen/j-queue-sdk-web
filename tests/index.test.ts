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
    };
    return {
        io: jest.fn(() => mockSocket),
    };
});

describe('ConnectionJQueueSdkWeb', () => {
    let mockSocket: jest.Mocked<Socket>;
    let originalWindow: typeof window;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
        mockSocket = (io as jest.Mock)().mockReturnValue({
            on: jest.fn(),
            emit: jest.fn(),
            disconnect: jest.fn(),
            connected: true,
        }) as any;

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
        it('throws error if URL is not provided', async () => {
            await expect(ConnectionJQueueSdkWeb.init({ url: '' } as InitConfig)).rejects.toThrow('URL is required for initialization');
        });

        it('throws error if socket.io-client is not loaded', async () => {
            const originalIo = io;
            (global as any).io = undefined;
            await expect(ConnectionJQueueSdkWeb.init({ url: 'http://example.com' })).rejects.toThrow(
                'Socket.IO client is not loaded. Please include socket.io-client before j-queue-sdk-web.'
            );
            (global as any).io = originalIo;
        });

        it('calls join API and sets up state for ACTIVE status', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            const config: InitConfig = { url: 'http://example.com', socketConfig: { query: { token: '123' } } };
            const result = await ConnectionJQueueSdkWeb.init(config);

            expect(fetch).toHaveBeenCalledWith('http://example.com/api/v1/online-queue/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: '123' }),
            });
            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toEqual(mockResponse.data);
            expect(window.sessionStorage.setItem).toHaveBeenCalledWith('queue_token', 'test-uuid');
            expect(io).toHaveBeenCalledWith('http://example.com', {
                transports: ['websocket'],
                reconnectionAttempts: 3,
                reconnectionDelay: 1000,
                query: { token: '123', uuid: 'test-uuid' },
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

            await ConnectionJQueueSdkWeb.init({ url: 'http://example.com', socketConfig: { query: { token: '123' } } });

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

            expect(fetch).toHaveBeenCalledTimes(2);

            // Next poll after 1000ms (position 50 < 100)
            // (fetch as jest.fn()).mockResolvedValue({
            //   json: {
            //     data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            //   }});

            // jest.advanceByTime(1000);
            expect(fetch).toHaveBeenCalledTimes(2);
            expect(io).toHaveBeenCalled();
            expect(window.onbeforeunload).toBeNull();
        });

        it('handles join API failure gracefully', async () => {
            (fetch as jest.Mock).mockRejectedValue(new Error('fetch error'));

            const result = await ConnectionJQueueSdkWeb.init({ url: 'http://example.com' });

            expect(console.error).toHaveBeenCalledWith('[J-Queue] Initialization failed', '');
            expect(result).toEqual({ disconnect: expect.any(Function) });
        });
    });

    describe('socket setup', () => {
        it('emits online-queue:set-ttl every 5 seconds after connection', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({ url: 'http://example.com', socketConfig: { query: { token: '123' } } });

            const connectHandler: any = mockSocket.on.mock.calls.find((call) => call[0] === 'connect')?.[1];
            connectHandler();

            expect(mockSocket.emit).not.toHaveBeenCalledWith('online-queue:set-ttl');

            jest.advanceTimersByTime(5000);
            expect(mockSocket.emit).toHaveBeenCalledWith('online-queue:set-ttl', { token: '123', uuid: 'test-uuid' });

            jest.advanceTimersByTime(5000);
            expect(mockSocket.emit).toHaveBeenCalledTimes(2);

            const disconnectHandler: any = mockSocket.on.mock.calls.find((call) => call[0] === 'disconnect')?.[1];
            disconnectHandler('io client disconnect');

            jest.advanceTimersByTime(5000);
            expect(mockSocket.emit).toHaveBeenCalledTimes(2); // No further emissions after disconnect
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
                url: 'http://example.com',
                customEvents: { 'custom-event': customEventHandler },
            });

            const customEvent: any = mockSocket.on.mock.calls.find((call) => call[0] === 'custom-event')?.[1];
            customEvent({ some: 'data' });

            expect(customEventHandler).toHaveBeenCalledWith({ some: 'data' }, expect.objectContaining({
                createPopup: expect.any(Function),
                removePopup: expect.any(Function),
                preventNavigation: expect.any(Function),
                allowNavigation: expect.any(Function),
            }));
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

            await ConnectionJQueueSdkWeb.init({ url: 'http://example.com' });

            expect(listener1).toHaveBeenCalledWith(mockResponse.data);
            expect(listener2).toHaveBeenCalledWith(mockResponse.data);

            ConnectionJQueueSdkWeb.removeStatusListener(listener1);

            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue({
                    data: { uuid: 'test-uuid', position: 2, status: OnlineQueueStatus.ACTIVE },
                }),
            });

            const statusHandler: any = mockSocket.on.mock.calls.find((call) => call[0] === 'online-queue:status')?.[1];
            statusHandler({ data: { uuid: 'test-uuid', position: 2, status: OnlineQueueStatus.ACTIVE } });

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

            await ConnectionJQueueSdkWeb.init({ url: 'http://example.com' });

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

            await ConnectionJQueueSdkWeb.init({ url: 'http://example.com' });

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

            await ConnectionJQueueSdkWeb.init({ url: 'http://example.com' });

            expect(window.onbeforeunload).toBeTruthy();
        });

        it('allows navigation for ACTIVE status', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({ url: 'http://example.com' });

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
                url: 'http://example.com',
                socketConfig: { query: { token: '123' } },
            });

            disconnect();

            expect(window.navigator.sendBeacon).toHaveBeenCalledWith(
                'http://example.com/api/v1/online-queue/leave',
                JSON.stringify({ token: '123', uuid: 'test-uuid' })
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

            const { disconnect } = await ConnectionJQueueSdkWeb.init({ url: 'http://example.com' });

            const listener = jest.fn();
            ConnectionJQueueSdkWeb.addStatusListener(listener);

            disconnect();

            expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('queue_token');
            expect(mockSocket.disconnect).toHaveBeenCalled();
            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toBeNull();
            expect(ConnectionJQueueSdkWeb['statusListeners']).toHaveLength(0);
        });
    });
});
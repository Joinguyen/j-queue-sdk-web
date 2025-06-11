import { OnlineQueueStatus, InitConfig } from '../src/types';
import ConnectionJQueueSdkWeb from '../src/index';
import { io, Socket } from 'socket.io-client';

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

// Mock fetch
global.fetch = jest.fn();

// Mock navigator.sendBeacon
const mockSendBeacon = jest.fn();
Object.defineProperty(global.navigator, 'sendBeacon', {
    value: mockSendBeacon,
    writable: true,
});

// Mock console methods
jest.spyOn(console, 'log').mockImplementation(() => { });
jest.spyOn(console, 'warn').mockImplementation(() => { });
jest.spyOn(console, 'error').mockImplementation(() => { });

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
        // Reset DOM
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        // Mock sessionStorage
        const sessionStorageMock = (() => {
            let store: Record<string, string> = {};
            return {
                getItem: (key: string) => store[key] || null,
                setItem: (key: string, value: string) => (store[key] = value),
                removeItem: (key: string) => delete store[key],
                clear: () => (store = {}),
            };
        })();
        Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });
        // Reset timers and navigation
        jest.useRealTimers();
        window.onbeforeunload = null;
    });

    afterEach(() => {
        jest.useRealTimers();
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        window.onbeforeunload = null;
    });

    describe('init', () => {
        it('throws error if URL is not provided', async () => {
            await expect(ConnectionJQueueSdkWeb.init({} as any)).rejects.toThrow('URL is required for initialization');
        });

        it('throws error if socket.io-client is not loaded', async () => {
            // jest.spyOn(global, 'io').mockImplementation(undefined as any);
            await expect(ConnectionJQueueSdkWeb.init({ url: 'http://example.com' })).rejects.toThrow(
                'Socket.IO client is not loaded. Please include socket.io-client before j-queue-sdk-web.'
            );
        });

        it('initializes with ACTIVE status and sets up socket', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            const config: InitConfig = {
                url: 'http://example.com',
                socketConfig: { query: { token: '123' } },
                popupConfig: { language: 'en' },
            };

            const result = await ConnectionJQueueSdkWeb.init(config);

            expect(fetch).toHaveBeenCalledWith('http://example.com/online-queue/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config?.socketConfig?.query),
            });
            expect(io).toHaveBeenCalledWith('http://example.com', {
                ...config?.socketConfig,
                query: { ...config?.socketConfig?.query, uuid: 'test-uuid' },
            });
            expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('online-queue:status', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toEqual(mockResponse.data);
            expect(document.querySelector('#__jqueue_popup')).toBeNull();
            expect(window.onbeforeunload).toBeNull();
            expect(result).toEqual({ disconnect: expect.any(Function) });
        });

        it('initializes with WAITING status, creates popup, and starts polling', async () => {
            jest.useFakeTimers();
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 5, status: OnlineQueueStatus.WAITING },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            const config: InitConfig = {
                url: 'http://example.com',
                socketConfig: { query: { token: '123' } },
                popupConfig: { language: 'en' },
            };

            await ConnectionJQueueSdkWeb.init(config);

            expect(fetch).toHaveBeenCalledWith('http://example.com/online-queue/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config?.socketConfig?.query),
            });
            expect(io).not.toHaveBeenCalled();
            const popup = document.querySelector('#__jqueue_popup');
            expect(popup).toBeTruthy();
            expect(popup?.textContent).toContain('Queue Number');
            expect(popup?.textContent).toContain('5');
            expect(window.onbeforeunload).toBeInstanceOf(Function);
            expect(window.sessionStorage.getItem('queue_token')).toBe('test-uuid');

            // Simulate polling
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue({
                    data: { uuid: 'test-uuid', position: 4, status: OnlineQueueStatus.WAITING },
                }),
            });

            jest.advanceTimersByTime(10000);
            await Promise.resolve();

            expect(fetch).toHaveBeenCalledWith('http://example.com/online-queue/status?token=123&uuid=test-uuid', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toMatchObject({
                position: 4,
                status: OnlineQueueStatus.WAITING,
                uuid: 'test-uuid',
            });

            // Simulate status change to ACTIVE
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue({
                    data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
                }),
            });

            jest.advanceTimersByTime(10000);
            await Promise.resolve();

            expect(io).toHaveBeenCalledWith('http://example.com', {
                ...config?.socketConfig,
                query: { ...config?.socketConfig?.query, uuid: 'test-uuid' },
            });
            expect(document.querySelector('#__jqueue_popup')).toBeNull();
            expect(window.onbeforeunload).toBeNull();
        });

        it('handles invalid join response gracefully', async () => {
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue({ data: {} }),
            });

            const config: InitConfig = { url: 'http://example.com' };
            const result = await ConnectionJQueueSdkWeb.init(config);

            expect(console.error).toHaveBeenCalledWith('[J-Queue] Join response missing UUID', expect.anything());
            expect(result).toEqual({ disconnect: expect.any(Function) });
            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toBeNull();
        });
    });

    describe('status listeners', () => {
        it('adds and removes status listeners', async () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();

            ConnectionJQueueSdkWeb.addStatusListener(listener1);
            ConnectionJQueueSdkWeb.addStatusListener(listener2);

            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({ url: 'http://example.com' });

            expect(listener1).toHaveBeenCalledWith(mockResponse.data);
            expect(listener2).toHaveBeenCalledWith(mockResponse.data);

            ConnectionJQueueSdkWeb.removeStatusListener(listener1);
            const newStatus = { uuid: 'test-uuid', position: 2, status: OnlineQueueStatus.ACTIVE };
            ConnectionJQueueSdkWeb['updateQueueStatus'](newStatus, {});

            expect(listener1).not.toHaveBeenCalledWith(newStatus);
            expect(listener2).toHaveBeenCalledWith(newStatus);
        });
    });

    describe('popup management', () => {
        it('creates and removes popup based on status', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 5, status: OnlineQueueStatus.WAITING },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({
                url: 'http://example.com',
                popupConfig: { language: 'en' },
            });

            const popup = document.querySelector('#__jqueue_popup');
            expect(popup).toBeTruthy();
            expect(popup?.textContent).toContain('Queue Number');
            expect(popup?.textContent).toContain('5');

            // Simulate status update to ACTIVE
            ConnectionJQueueSdkWeb['updateQueueStatus'](
                { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
                {}
            );

            expect(document.querySelector('#__jqueue_popup')).toBeNull();
        });
    });

    describe('socket setup', () => {
        it('sets up socket events for ACTIVE status', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            const customEvents = { 'custom-event': jest.fn() };
            await ConnectionJQueueSdkWeb.init({
                url: 'http://example.com',
                socketConfig: { query: { token: '123' } },
                customEvents,
            });

            expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('online-queue:status', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('custom-event', expect.any(Function));

            // Test custom event
            const customHandler = mockSocket.on.mock.calls.find((call: any) => call[0] === 'custom-event')?.[1];
            customHandler({ message: 'Hello' });
            expect(customEvents['custom-event']).toHaveBeenCalledWith(
                { message: 'Hello' },
                expect.objectContaining({
                    createPopup: expect.any(Function),
                    removePopup: expect.any(Function),
                    preventNavigation: expect.any(Function),
                    allowNavigation: expect.any(Function),
                })
            );
        });
    });

    describe('disconnect', () => {
        it('sends leave request and cleans up', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 1, status: OnlineQueueStatus.ACTIVE },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            const config: InitConfig = {
                url: 'http://example.com',
                socketConfig: { query: { token: '123' } },
            };
            const { disconnect } = await ConnectionJQueueSdkWeb.init(config);

            disconnect();

            expect(mockSendBeacon).toHaveBeenCalledWith(
                'http://example.com/online-queue/leave',
                JSON.stringify({ token: '123', uuid: 'test-uuid' })
            );
            expect(mockSocket.disconnect).toHaveBeenCalled();
            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toBeNull();
            expect(window.onbeforeunload).toBeNull();
            expect(window.sessionStorage.getItem('queue_token')).toBeNull();
        });
    });

    describe('navigation blocking', () => {
        it('blocks navigation and sends leave request on beforeunload', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 5, status: OnlineQueueStatus.WAITING },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({
                url: 'http://example.com',
                socketConfig: { query: { token: '123' } },
            });

            const event = new Event('beforeunload');
            window.dispatchEvent(event);

            expect(mockSendBeacon).toHaveBeenCalledWith(
                'http://example.com/online-queue/leave',
                JSON.stringify({ token: '123', uuid: 'test-uuid' })
            );
        });
    });

    describe('styles injection', () => {
        it('injects styles only once', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 5, status: OnlineQueueStatus.WAITING },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({ url: 'http://example.com' });
            await ConnectionJQueueSdkWeb.init({ url: 'http://example.com' });

            expect(document.querySelectorAll('style[data-jqueue-styles]').length).toBe(1);
            expect(document.head.innerHTML).toContain('.loader-jqueue_popup');
        });
    });

    describe('invalid status response', () => {
        it('handles invalid status response gracefully', async () => {
            const mockResponse = {
                data: { uuid: 'test-uuid', position: 5, status: OnlineQueueStatus.WAITING },
            };
            (fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue(mockResponse),
            });

            await ConnectionJQueueSdkWeb.init({ url: 'http://example.com' });

            // Simulate invalid status response
            ConnectionJQueueSdkWeb['updateQueueStatus'](null as any, {});

            expect(console.warn).toHaveBeenCalledWith('[J-Queue] Invalid status response received');
            expect(ConnectionJQueueSdkWeb.getQueueStatus()).toBeNull();
        });
    });
});
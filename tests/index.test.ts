import ConnectionJQueueSdkWeb from '../src/index';
import { io as mockIo } from 'socket.io-client';

jest.mock('socket.io-client', () => {
    const mSocket = {
        on: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
    };
    return {
        io: jest.fn(() => mSocket),
    };
});

describe('ConnectionJQueueSdkWeb', () => {
    let socketMock: any;

    beforeEach(() => {
        jest.clearAllMocks();
        socketMock = (mockIo as jest.Mock).mock.results[0]?.value;
    });

    test('should initialize socket connection with default config', () => {
        const config = {
            url: 'wss://demo-websocket.example.com',
        };

        const conn = ConnectionJQueueSdkWeb.init(config);

        expect(mockIo).toHaveBeenCalledWith('wss://demo-websocket.example.com', {
            transports: ['websocket'],
            reconnectionAttempts: 3,
        });

        expect(socketMock.on).toHaveBeenCalledWith('connect', expect.any(Function));
        expect(socketMock.on).toHaveBeenCalledWith('connection-status', expect.any(Function));
        expect(socketMock.on).toHaveBeenCalledWith('position-update', expect.any(Function));
        expect(socketMock.on).toHaveBeenCalledWith('disconnect', expect.any(Function));

        // Test disconnect method
        conn.disconnect();
        expect(socketMock.disconnect).toHaveBeenCalled();
    });

    test('should handle custom event and trigger provided handler', () => {
        const customHandler = jest.fn();

        const config = {
            url: 'wss://demo-websocket.example.com',
            customEvents: {
                'custom-event': customHandler
            }
        };

        ConnectionJQueueSdkWeb.init(config);

        // simulate event callback from socket
        const registeredHandler = socketMock.on.mock.calls.find((call: any) => call[0] === 'custom-event')?.[1];
        registeredHandler?.({ message: 'Hello' });

        expect(customHandler).toHaveBeenCalledWith(
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

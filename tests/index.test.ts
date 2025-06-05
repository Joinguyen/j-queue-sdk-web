import ConnectionChecker from '../src/index';

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
    io: jest.fn(() => ({
        on: jest.fn(),
        disconnect: jest.fn(),
        connect: jest.fn()
    }))
}));

describe('ConnectionChecker', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.clearAllMocks();
    });

    test('should return error if Socket.IO is not available', () => {
        // Temporarily override the mock to simulate io undefined
        jest.mock('socket.io-client', () => ({}), { virtual: true });
        const result = ConnectionChecker.init();
        expect(result).toEqual({ error: 'Socket.IO not found' });
        expect(console.error).toHaveBeenCalledWith('Socket.IO client is required for j-queue-sdk-web');
    });

    test('should initialize without errors when Socket.IO is available', () => {
        // Ensure the mock is restored
        jest.mock('socket.io-client', () => ({
            io: jest.fn(() => ({
                on: jest.fn(),
                disconnect: jest.fn(),
                connect: jest.fn()
            }))
        }), { virtual: true });
        const result = ConnectionChecker.init({ url: 'wss://test-server' });
        expect(result).toHaveProperty('disconnect');
        expect(result).toHaveProperty('reconnect');
        expect(result).toHaveProperty('socket');
    });
});
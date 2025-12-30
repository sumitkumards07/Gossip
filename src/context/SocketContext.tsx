import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Use env variable for production backend, fallback to local for dev
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        const newSocket = io(SOCKET_URL, {
            transports: ['websocket'], // More stable for some hosting
            reconnectionAttempts: 5
        });

        newSocket.on('connect_error', (err) => {
            console.error('Socket connection error:', err);
            // alert('Socket connection error: ' + err.message);
        });

        newSocket.on('connect', () => {
            console.log('Socket connected to:', SOCKET_URL);
            setIsConnected(true);
        });

        newSocket.on('disconnect', () => {
            console.log('Socket disconnected');
            setIsConnected(false);
        });

        setSocket(newSocket);

        return () => {
            newSocket.close();
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (context === undefined) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
};

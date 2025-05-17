import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

// Define types
interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinSession: (sessionId: string) => void;
  leaveSession: () => void;
}

// Create the context with default values
const SocketContext = createContext<SocketContextType | null>(null);

// Custom hook to use the socket context
export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Initialize socket connection
  useEffect(() => {
    // Get the API URL from environment variables or use a default
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    
    // Create socket connection
    const newSocket = io(API_URL);
    
    // Set up event listeners
    newSocket.on('connect', () => {
      console.log('[Socket] Connected to server');
      setIsConnected(true);
      
      // If there was a session ID before, rejoin it
      if (currentSessionId) {
        newSocket.emit('joinSession', currentSessionId);
      }
    });
    
    newSocket.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
      setIsConnected(false);
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
      setIsConnected(false);
    });
    
    setSocket(newSocket);
    
    // Clean up on unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);
  
  // Function to join a session
  const joinSession = (sessionId: string) => {
    if (!socket || !isConnected) return;
    
    console.log(`[Socket] Joining session: ${sessionId}`);
    socket.emit('joinSession', sessionId);
    setCurrentSessionId(sessionId);
  };
  
  // Function to leave the current session
  const leaveSession = () => {
    if (!socket || !isConnected || !currentSessionId) return;
    
    console.log(`[Socket] Leaving session: ${currentSessionId}`);
    socket.emit('leaveSession', currentSessionId);
    setCurrentSessionId(null);
  };
  
  // Ensure session is rejoined if socket reconnects
  useEffect(() => {
    if (isConnected && socket && currentSessionId) {
      socket.emit('joinSession', currentSessionId);
    }
  }, [isConnected, socket, currentSessionId]);
  
  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        joinSession,
        leaveSession
      }}
    >
      {children}
    </SocketContext.Provider>
  );
} 
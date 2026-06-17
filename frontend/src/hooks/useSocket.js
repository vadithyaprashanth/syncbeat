import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

/* global io */

const useSocket = () => {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => { setConnected(true); console.log('Socket connected'); });
    socket.on('disconnect', () => { setConnected(false); console.log('Socket disconnected'); });
    socket.on('error', (err) => { console.error('Socket error:', err.message); });
    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  return { socket: socketRef.current, connected };
};

export default useSocket;
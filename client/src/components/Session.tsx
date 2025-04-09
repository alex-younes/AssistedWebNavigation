import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// Define a proper interface for session data
interface SessionData {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string;
  status: string;
  metadata?: Record<string, unknown>;
}

const Session = () => {
  const [sessionId, setSessionId] = useState('');
  const [serverIp, setServerIp] = useState('localhost');
  const [serverPort, setServerPort] = useState('3001');
  const [status, setStatus] = useState<'idle' | 'loading' | 'connected' | 'error'>('idle');
  const [error, setError] = useState('');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    
    try {
      // Use the provided IP and port to connect
      const baseUrl = `http://${serverIp}:${serverPort}/api`;
      const response = await axios.get(`${baseUrl}/extension/recorder/session/${sessionId}`);
      
      if (response.data.success) {
        setStatus('connected');
        setSessionData(response.data.session);
        console.log('Connected to session:', response.data.session);
      } else {
        setStatus('error');
        setError('Session not found');
      }
    } catch (err) {
      setStatus('error');
      setError('Failed to connect to session');
      console.error('Error connecting to session:', err);
    }
  };

  const handleViewGraph = () => {
    // Navigate to the graph page with necessary parameters
    navigate(`/graph/${sessionId}`, { 
      state: { 
        serverIp, 
        serverPort, 
        sessionId,
        sessionData
      } 
    });
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4 text-center text-gray-800">Connect to Session</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="serverIp" className="block text-sm font-medium text-gray-700 mb-1">
              Server IP
            </label>
            <input
              type="text"
              id="serverIp"
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              placeholder="localhost or IP"
              required
            />
          </div>
          <div>
            <label htmlFor="serverPort" className="block text-sm font-medium text-gray-700 mb-1">
              Port
            </label>
            <input
              type="text"
              id="serverPort"
              value={serverPort}
              onChange={(e) => setServerPort(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              placeholder="e.g. 3001"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="sessionId" className="block text-sm font-medium text-gray-700 mb-1">
            Session ID
          </label>
          <input
            type="text"
            id="sessionId"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            placeholder="Enter your session ID"
            required
          />
        </div>
        
        <button
          type="submit"
          className="w-full py-2 px-4 rounded-md text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          disabled={status === 'loading'}
        >
          {status === 'loading' ? 'Connecting...' : 'Connect'}
        </button>
      </form>
      
      {status === 'connected' && (
        <div className="mt-4">
          <div className="p-3 bg-green-100 text-green-700 rounded-md mb-4">
            Successfully connected to session
          </div>
          <button
            onClick={handleViewGraph}
            className="w-full py-2 px-4 rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            View Graph
          </button>
        </div>
      )}
      
      {status === 'error' && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
};

export default Session; 
import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import axios from 'axios';

// Define Activity type
interface Activity {
  _id: string;
  sessionId: string;
  userId: string;
  eventType: string;
  interaction: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// Define DOM State type to track transitions
interface DOMState {
  _id: string;
  stateId: string;
  sessionId: string;
  timestamp: string;
  title: string;
  url: string;
  isNewState: boolean;
  stateNumber: number;
  interactionInfo?: {
    type: string;
    element: string;
    text?: string;
    timestamp: string;
  };
  // Add any other fields from MongoDB here
  previousStateId?: string;
  previousHash?: string;
  hash?: string;
  pathname?: string;
  timeSincePreviousState?: number;
  metrics?: Record<string, unknown>;
  loadingInfo?: Record<string, unknown>;
  mutationInfo?: Record<string, unknown>;
  dom?: string;
}

interface LiveFeedProps {
  sessionId: string | null;
  isActiveSession?: boolean;
  maxItems?: number;
}

const LiveFeed: React.FC<LiveFeedProps> = ({ 
  sessionId, 
  isActiveSession = true,
  maxItems = 250
}) => {
  const { socket, isConnected, joinSession, leaveSession } = useSocket();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [domStates, setDomStates] = useState<DOMState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const feedEndRefLeft = useRef<HTMLDivElement | null>(null);
  const feedEndRefRight = useRef<HTMLDivElement | null>(null);
  
  // State for detail modal
  const [selectedItem, setSelectedItem] = useState<Activity | DOMState | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [fullDOMState, setFullDOMState] = useState<DOMState | null>(null);
  
  // Function to fetch detailed info for a state
  const fetchDetailedState = async (stateId: string) => {
    try {
      console.log(`[LiveFeed] Fetching detailed state: ${stateId}`);
      const response = await axios.get(`/api/extension/recorder/state/${stateId}`);
      if (response.data.success && response.data.state) {
        console.log('[LiveFeed] Received detailed state data:', response.data.state);
        setFullDOMState(response.data.state);
      }
    } catch (err) {
      console.error(`Failed to fetch detailed state for ${stateId}:`, err);
      setFullDOMState(null);
    }
  };
  
  // Function to handle click on an activity card
  const handleActivityClick = (item: Activity) => {
    console.log('[LiveFeed] Activity clicked:', item);
    setSelectedItem(item);
    
    // If it's a transition, fetch the full state
    if (item.eventType === 'transition' && item.details?.stateId) {
      fetchDetailedState(item.details.stateId as string);
    } else {
      setFullDOMState(null); // Reset for non-transition events
    }
    
    setShowModal(true);
  };
  
  // Join the session when component mounts
  useEffect(() => {
    if (!sessionId) return;
    
    // Join the session room
    joinSession(sessionId);
    
    // Also fetch DOM state transitions
    const fetchDOMStates = async () => {
      try {
        console.log('[LiveFeed] Fetching DOM states for session:', sessionId);
        // This endpoint should be available in your API based on your backend code
        const response = await axios.get(`/api/extension/recorder/session/${sessionId}/states`);
        if (response.data.success) {
          console.log('[LiveFeed] Received DOM states:', response.data.states.length);
          setDomStates(prevStates => {
            // Merge with existing states (avoid duplicates)
            const combined = [...prevStates, ...response.data.states];
            const uniqueStates = Array.from(
              new Map(combined.map(state => [state.stateId, state])).values()
            );
            return uniqueStates.sort((a, b) => 
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
          });
        }
      } catch (err) {
        console.error('Failed to fetch DOM states:', err);
      }
    };
    
    // Initial fetch
    fetchDOMStates();
    
    // Set up interval to refresh states every 5 seconds if session is active
    let refreshInterval: number | null = null;
    if (isActiveSession) {
      refreshInterval = setInterval(fetchDOMStates, 5000);
    }
    
    // Clean up when component unmounts
    return () => {
      leaveSession();
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [sessionId, joinSession, leaveSession, isActiveSession]);
  
  // Handle activity events from socket
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    // Listen for activity history
    const handleActivityHistory = (history: Activity[]) => {
      console.log('[LiveFeed] Received activity history:', history);
      setActivities(prevActivities => {
        const combined = [...prevActivities, ...history];
        const uniqueActivities = Array.from(new Map(combined.map(act => [act._id, act])).values());
        uniqueActivities.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        if (uniqueActivities.length > maxItems) {
          return uniqueActivities.slice(-maxItems);
        }
        return uniqueActivities;
      });
      setIsLoading(false);
    };
    
    // Listen for new activity
    const handleNewActivity = (activity: Activity) => {
      console.log('[LiveFeed] Received new activity:', activity);
      setActivities(prevActivities => {
        const combined = [...prevActivities, activity]; // Add the new one
        const uniqueActivities = Array.from(new Map(combined.map(act => [act._id, act])).values());
        uniqueActivities.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        if (uniqueActivities.length > maxItems) {
          return uniqueActivities.slice(-maxItems);
        }
        return uniqueActivities;
      });
    };
    
    // Listen for error events
    const handleError = (errorMessage: string) => {
      console.error('[LiveFeed] Socket error:', errorMessage);
      setError(errorMessage);
    };
    
    socket.on('activityHistory', handleActivityHistory);
    socket.on('activity', handleNewActivity);
    socket.on('error', handleError);
    
    // Clean up event listeners
    return () => {
      socket.off('activityHistory', handleActivityHistory);
      socket.off('activity', handleNewActivity);
      socket.off('error', handleError);
    };
  }, [socket, isConnected, maxItems]);
  
  // Auto-scroll to bottom when new activities arrive
  useEffect(() => {
    // if (feedEndRefLeft.current) {
    //   feedEndRefLeft.current.scrollIntoView({ behavior: 'smooth' });
    // }
    // if (feedEndRefRight.current) {
    //   feedEndRefRight.current.scrollIntoView({ behavior: 'smooth' });
    // }
  }, [activities, domStates]);
  
  // Helper to get icon and color for activity type
  const getActivityStyle = (eventType: string) => {
    switch (eventType) {
      case 'click':
        return { icon: '👆', color: 'bg-blue-100 text-blue-800', badge: 'bg-blue-500' };
      case 'hover':
        return { icon: '✋', color: 'bg-purple-100 text-purple-800', badge: 'bg-purple-500' };
      case 'keyTyping':
        return { icon: '⌨️', color: 'bg-green-100 text-green-800', badge: 'bg-green-500' };
      case 'navigation':
        return { icon: '🔀', color: 'bg-yellow-100 text-yellow-800', badge: 'bg-yellow-500' };
      case 'scroll':
        return { icon: '📜', color: 'bg-indigo-100 text-indigo-800', badge: 'bg-indigo-500' };
      case 'copy':
        return { icon: '📋', color: 'bg-pink-100 text-pink-800', badge: 'bg-pink-500' };
      case 'paste':
        return { icon: '📌', color: 'bg-red-100 text-red-800', badge: 'bg-red-500' };
      case 'inactivity':
        return { icon: '💤', color: 'bg-gray-100 text-gray-800', badge: 'bg-gray-500' };
      case 'transition':
        return { icon: '🚀', color: 'bg-yellow-100 text-yellow-800', badge: 'bg-yellow-500' };
      default:
        return { icon: '🔍', color: 'bg-gray-100 text-gray-800', badge: 'bg-gray-500' };
    }
  };
  
  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Check if an event is a mouse hover event
  const isHoverEvent = (eventType: string): boolean => {
    return eventType === 'hover';
  };

  const isOscillatingHoverEvent = (eventType: string): boolean => {
    return eventType === 'oscillating_hover';
  };
  
  // Combine DOM state transitions with regular activities for the left column
  const allLeftColumnActivities = [
    ...activities.filter(activity => 
      !isHoverEvent(activity.eventType) && 
      !isOscillatingHoverEvent(activity.eventType) &&
      activity.eventType !== 'inactivity' // Explicitly filter out inactivity
    ),
    // Include ALL state transitions, not just those with interactionInfo
    ...domStates.map(state => ({
      _id: state._id,
      sessionId: state.sessionId,
      userId: '', 
      eventType: 'transition',
      interaction: state.interactionInfo 
        ? `${state.interactionInfo.type || 'Clicked'} on ${state.interactionInfo.element || 'element'} - State ${state.stateNumber}`
        : `State Change ${state.stateNumber} - ${state.isNewState ? 'New State' : 'Update'} ${state.title ? `(${state.title})` : ''}`,
      details: {
        element: state.interactionInfo?.element,
        text: state.interactionInfo?.text,
        title: state.title,
        url: state.url,
        stateNumber: state.stateNumber,
        isNewState: state.isNewState,
        stateId: state.stateId, // Add this to help with fetching detailed info
        originalState: state // Store reference to original state
      },
      timestamp: state.timestamp
    }))
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Filter activities for right column - Limit to 15 most recent hover events
  const rightColumnHoverEvents = activities.filter(activity => 
    isHoverEvent(activity.eventType) || isOscillatingHoverEvent(activity.eventType)
  )
  // Take only the 15 most recent hover events
  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  .slice(0, 15);
  
  // Simplified activity card component for interactions
  const InteractionCard = ({ activity }: { activity: Activity }) => {
    const { icon, color } = getActivityStyle(activity.eventType);
    
    // Extract detailed information
    let detailText = '';
    if (activity.eventType === 'keyTyping' && activity.details) {
      const keyCount = activity.details.keyCount || 0;
      const field = activity.details.field || 'field';
      detailText = `Typed ${keyCount} characters in ${field}`;
    } else if (activity.eventType === 'transition' && activity.details) {
      const text = activity.details.text;
      const url = activity.details.url;
      detailText = text ? `Text: "${text}"${url ? ` • URL: ${url}` : ''}` : 
                   url ? `URL: ${url}` : '';
    }
    
    return (
      <div 
        className={`mb-2 bg-white rounded shadow-sm border-l-4 ${activity.eventType === 'transition' ? 'border-yellow-500' : 'border-blue-500'} hover:shadow-md p-2 cursor-pointer transition hover:bg-gray-50`}
        onClick={() => handleActivityClick(activity)}
      >
        <div className="flex items-center">
          <div className={`p-1.5 rounded-full mr-2 ${color} text-base flex-shrink-0`}>
            {icon}
          </div>
          <div className="flex-grow min-w-0">
            <div className="font-medium">{activity.interaction}</div>
            {detailText && (
              <div className="text-xs text-gray-600 mt-1">
                {detailText}
              </div>
            )}
            <div className="flex items-center text-xs text-gray-500 mt-0.5">
              <span>{formatTime(activity.timestamp)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // Simplified hover card component
  const SimpleHoverCard = ({ activity }: { activity: Activity }) => {
    const isOscillating = activity.eventType === 'oscillating_hover';
    return (
      <div 
        className={`p-2 mb-1 bg-white rounded shadow-sm border-l-4 ${isOscillating ? 'border-red-500' : 'border-purple-500'} hover:shadow-md cursor-pointer text-xs hover:bg-gray-50`}
        onClick={() => handleActivityClick(activity)}
      >
        <div className="font-medium truncate">{activity.interaction}</div>
        <div className="text-gray-500 mt-1">{formatTime(activity.timestamp)}</div>
      </div>
    );
  };
  
  // Modal Component for Detailed View
  const DetailModal = () => {
    if (!showModal) return null;
    
    // Determine what type of item we're dealing with
    const isFullState = !!fullDOMState;
    const isActivity = !!selectedItem && 'eventType' in selectedItem;
    const isTransition = isActivity && (selectedItem as Activity).eventType === 'transition';

    return (
      <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
          <div className="flex justify-between items-center border-b px-4 py-3">
            <h3 className="text-lg font-semibold">
              {isActivity 
                ? `${(selectedItem as Activity).eventType.charAt(0).toUpperCase() + (selectedItem as Activity).eventType.slice(1)} Details` 
                : 'State Details'}
            </h3>
            <button 
              onClick={() => setShowModal(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          
          <div className="overflow-auto flex-grow p-4">
            {isFullState && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500 mb-1">State ID</h4>
                    <p className="font-mono text-sm">{fullDOMState.stateId}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500 mb-1">State Number</h4>
                    <p>{fullDOMState.stateNumber}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500 mb-1">Timestamp</h4>
                    <p>{new Date(fullDOMState.timestamp).toLocaleString()}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500 mb-1">Is New State</h4>
                    <p>{fullDOMState.isNewState ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500 mb-1">URL</h4>
                    <p className="truncate">{fullDOMState.url}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500 mb-1">Title</h4>
                    <p>{fullDOMState.title}</p>
                  </div>
                  {fullDOMState.previousStateId && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-500 mb-1">Previous State</h4>
                      <p className="font-mono text-sm">{fullDOMState.previousStateId}</p>
                    </div>
                  )}
                  {fullDOMState.timeSincePreviousState !== undefined && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-500 mb-1">Time Since Previous State</h4>
                      <p>{fullDOMState.timeSincePreviousState}ms</p>
                    </div>
                  )}
                </div>
                
                {fullDOMState.interactionInfo && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-700 mb-2">Interaction Information</h4>
                    <div className="bg-gray-50 p-3 rounded">
                      <div><span className="font-semibold">Type:</span> {fullDOMState.interactionInfo.type}</div>
                      <div><span className="font-semibold">Element:</span> {fullDOMState.interactionInfo.element}</div>
                      {fullDOMState.interactionInfo.text && (
                        <div><span className="font-semibold">Text:</span> {fullDOMState.interactionInfo.text}</div>
                      )}
                    </div>
                  </div>
                )}
                
                {fullDOMState.metrics && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-700 mb-2 flex items-center justify-between">
                      <span>Metrics</span>
                      <span className="text-xs text-blue-500 cursor-pointer">View JSON</span>
                    </h4>
                    <div className="bg-gray-50 p-3 rounded">
                      <pre className="text-xs overflow-auto max-h-32">{JSON.stringify(fullDOMState.metrics, null, 2)}</pre>
                    </div>
                  </div>
                )}
                
                {fullDOMState.loadingInfo && Object.keys(fullDOMState.loadingInfo).length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-700 mb-2">Loading Information</h4>
                    <div className="bg-gray-50 p-3 rounded">
                      <pre className="text-xs overflow-auto max-h-32">{JSON.stringify(fullDOMState.loadingInfo, null, 2)}</pre>
                    </div>
                  </div>
                )}
                
                {fullDOMState.mutationInfo && Object.keys(fullDOMState.mutationInfo).length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-700 mb-2">Mutation Information</h4>
                    <div className="bg-gray-50 p-3 rounded">
                      <pre className="text-xs overflow-auto max-h-32">{JSON.stringify(fullDOMState.mutationInfo, null, 2)}</pre>
                    </div>
                  </div>
                )}
                
                <div className="mt-4">
                  <h4 className="font-semibold text-gray-700 mb-2 flex items-center justify-between">
                    <span>DOM Preview</span>
                    <button className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded">
                      View Full DOM
                    </button>
                  </h4>
                  <div className="bg-gray-800 p-3 rounded">
                    <pre className="text-xs text-green-400 overflow-auto max-h-40">
                      {fullDOMState.dom ? fullDOMState.dom.substring(0, 500) + '...' : 'No DOM content available'}
                    </pre>
                  </div>
                </div>
              </div>
            )}
            
            {!isFullState && isActivity && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500 mb-1">Event Type</h4>
                    <p>{(selectedItem as Activity).eventType}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500 mb-1">Interaction</h4>
                    <p>{(selectedItem as Activity).interaction}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500 mb-1">Timestamp</h4>
                    <p>{new Date((selectedItem as Activity).timestamp).toLocaleString()}</p>
                  </div>
                </div>
                
                {(selectedItem as Activity).details && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-700 mb-2">Details</h4>
                    <div className="bg-gray-50 p-3 rounded">
                      <pre className="text-xs overflow-auto max-h-64">{JSON.stringify((selectedItem as Activity).details, null, 2)}</pre>
                    </div>
                  </div>
                )}
                
                {isTransition && (
                  <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-yellow-700 mb-2">Loading detailed state information...</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="border-t px-4 py-3 bg-gray-50 flex justify-end">
            <button 
              onClick={() => setShowModal(false)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  if (!sessionId) {
    return (
      <div className="p-4 text-center text-gray-500">
        No session ID provided. Please select a session.
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        Error: {error}
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Live Activity Feed</h3>
          <p className="text-sm text-gray-500">
            {isActiveSession
              ? 'Showing real-time user interactions'
              : 'Historical session activities'}
          </p>
        </div>
        {isConnected ? (
          <span className="flex items-center text-green-600 text-xs">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span> Connected
          </span>
        ) : (
          <span className="flex items-center text-red-600 text-xs">
            <span className="w-2 h-2 bg-red-500 rounded-full mr-1"></span> Disconnected
          </span>
        )}
      </div>
      
      {isLoading && allLeftColumnActivities.length === 0 && rightColumnHoverEvents.length === 0 ? (
        <div className="flex-grow flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : allLeftColumnActivities.length > 0 || rightColumnHoverEvents.length > 0 ? (
        <div className="flex-grow grid grid-cols-4 gap-4">
          {/* Left Column - Main interactions (clicks, navigation, etc.) */}
          <div className="col-span-3 bg-gray-50 rounded-lg border overflow-y-auto p-2">
            <div className="sticky top-0 bg-blue-600 text-white py-2 px-3 rounded-md mb-2 shadow-sm z-10">
              <div className="font-medium">All Interactions</div>
              <div className="text-xs text-blue-100">Transitions, clicks, navigation, keyboard, etc.</div>
            </div>
            
            {allLeftColumnActivities.length > 0 ? (
              <div className="space-y-1">
                {allLeftColumnActivities.map((activity) => (
                  <InteractionCard key={activity._id} activity={activity} />
                ))}
                <div ref={feedEndRefLeft} />
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400">No interactions yet</div>
            )}
          </div>
          
          {/* Right Column - Small box for hover events (max 15) */}
          <div className="col-span-1 bg-gray-50 rounded-lg border overflow-hidden p-0 flex flex-col" style={{ maxHeight: '500px' }}>
            <div className="bg-purple-600 text-white py-2 px-3 shadow-sm z-10 sticky top-0">
              <div className="font-medium">Hover</div>
              <div className="text-xs text-purple-100">Most recent (max 15)</div>
            </div>
            
            <div className="overflow-y-auto flex-grow p-2">
              {rightColumnHoverEvents.length > 0 ? (
                <div className="space-y-1">
                  {rightColumnHoverEvents.map((activity) => (
                    <SimpleHoverCard key={activity._id} activity={activity} />
                  ))}
                  <div ref={feedEndRefRight} />
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400 text-xs">No hover events</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-grow flex items-center justify-center text-gray-500 p-4 text-center">
          <div>
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="font-medium">No activities recorded yet</p>
            {isActiveSession && (
              <p className="mt-2 text-sm">Waiting for user interactions...</p>
            )}
          </div>
        </div>
      )}
      
      {/* Detail Modal */}
      <DetailModal />
    </div>
  );
};

export default LiveFeed; 
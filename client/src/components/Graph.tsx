import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import ReactFlow, { 
  Background, 
  Controls, 
  Edge, 
  Node, 
  NodeChange, 
  EdgeChange, 
  applyNodeChanges, 
  applyEdgeChanges,
  MarkerType,
  NodeProps,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import React from 'react';

// Define types for state data
interface StateData {
  _id: string;
  stateId: string;
  sessionId: string;
  url: string;
  pathname: string;
  timestamp: string;
  stateNumber: number;
  hash: string;
  previousStateId: string;
  previousHash: string;
  title: string;
  isNewState: boolean;
  interactionInfo?: {
    type: string;
    element: string;
    text: string;
    timestamp: string;
  };
  loadingInfo?: {
    isNavigation: boolean;
    isReload: boolean;
  };
}

interface LocationState {
  serverIp: string;
  serverPort: string;
  sessionId: string;
}

// Define state node data type with history
interface StateNodeData {
  stateId: string;
  stateNumber: number;
  title: string;
  url: string;
  latestTimestamp: string;
  isNewState: boolean;
  hash: string;
  interaction?: {
    type: string;
    element: string;
    text?: string;
    timestamp: string;
  };
  isNavigation?: boolean;
  isReload?: boolean;
  // Store full history of the state
  history: StateData[];
  // Count of instances
  instanceCount: number;
}

// State history panel component
const StateHistoryPanel = ({ 
  state, 
  onClose 
}: { 
  state: StateNodeData | null, 
  onClose: () => void 
}) => {
  if (!state) return null;

  return (
    <div className="fixed top-0 right-0 h-screen w-96 bg-white shadow-lg z-50 overflow-y-auto">
      <div className="sticky top-0 bg-white p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-bold">State History</h2>
        <button 
          onClick={onClose}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="p-4">
        <div className="mb-4">
          <h3 className="font-bold text-lg">{state.title}</h3>
          <p className="text-sm text-gray-600">State #{state.stateNumber} • {state.instanceCount} instances</p>
          <p className="text-sm text-gray-600">URL: {state.url}</p>
        </div>
        
        <div className="border-t border-gray-200 pt-4">
          <h4 className="font-semibold mb-2">Timeline</h4>
          <div className="space-y-4">
            {state.history.map((instance, index) => (
              <div key={instance._id} className="bg-gray-50 p-3 rounded-md border border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <span className={`inline-block px-2 py-1 ${instance.isNewState ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'} rounded text-xs mb-2`}>
                      {instance.isNewState ? 'New State' : 'Duplicate'}
                    </span>
                    <p className="text-xs text-gray-500">
                      {new Date(instance.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-xs bg-gray-200 rounded-full px-2 py-1">
                    #{index + 1}
                  </span>
                </div>
                
                {instance.interactionInfo && (
                  <div className="mt-2 text-xs p-2 bg-blue-50 rounded border border-blue-100">
                    <div className="font-semibold text-blue-700">{instance.interactionInfo.type}</div>
                    <div>{instance.interactionInfo.text || instance.interactionInfo.element}</div>
                  </div>
                )}
                
                {instance.loadingInfo?.isNavigation && (
                  <div className="mt-2 text-xs p-2 bg-green-50 rounded border border-green-100">
                    <div className="font-semibold text-green-700">Navigation</div>
                  </div>
                )}
                
                {instance.loadingInfo?.isReload && (
                  <div className="mt-2 text-xs p-2 bg-yellow-50 rounded border border-yellow-100">
                    <div className="font-semibold text-yellow-700">Page Reload</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Custom node component for state nodes
const StateNode = ({ data }: NodeProps<StateNodeData>) => {
  const [showDetails, setShowDetails] = useState(false);
  // Format the timestamp for display
  const formattedTime = new Date(data.latestTimestamp).toLocaleTimeString();
  
  // Find the latest interaction or event
  const getLatestEvent = () => {
    // Sort history by timestamp (newest first)
    const sortedHistory = [...data.history].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    // Return the first item with an interaction or special loading info
    for (const item of sortedHistory) {
      if (item.interactionInfo) return { type: 'interaction', data: item.interactionInfo };
      if (item.loadingInfo?.isNavigation) return { type: 'navigation' };
      if (item.loadingInfo?.isReload) return { type: 'reload' };
    }
    
    return null;
  };
  
  const latestEvent = getLatestEvent();
  
  return (
    <div 
      className="px-4 py-2 shadow-md rounded-md bg-white border-2 border-gray-300 min-w-[180px] hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => setShowDetails(true)}
    >
      <div className="font-bold text-sm">{data.title || 'Untitled State'}</div>
      <div className="text-xs mt-1">State: {data.stateNumber}</div>
      <div className="text-xs text-gray-500">{formattedTime}</div>
      
      {data.instanceCount > 1 && (
        <div className="text-xs mt-1 bg-purple-100 text-purple-800 px-2 py-1 rounded">
          {data.instanceCount} instances
        </div>
      )}
      
      {latestEvent?.type === 'interaction' && latestEvent.data && (
        <div className="mt-2 text-xs p-1 bg-blue-50 rounded border border-blue-100">
          <div className="font-semibold text-blue-700">{latestEvent.data.type}</div>
          <div>{latestEvent.data.text || latestEvent.data.element}</div>
        </div>
      )}
      
      {latestEvent?.type === 'navigation' && (
        <div className="mt-1 text-xs bg-green-50 p-1 rounded border border-green-100 text-green-700">
          Navigation
        </div>
      )}
      
      {latestEvent?.type === 'reload' && (
        <div className="mt-1 text-xs bg-yellow-50 p-1 rounded border border-yellow-100 text-yellow-700">
          Page Reload
        </div>
      )}
      
      <div className="mt-2 text-xs text-center text-blue-600">
        Click to view history
      </div>

      {showDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={(e) => {
          e.stopPropagation();
          setShowDetails(false);
        }}>
          <div className="bg-white p-4 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <StateHistoryPanel state={data} onClose={() => setShowDetails(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

// Node types registration
const nodeTypes = {
  stateNode: StateNode,
};

const Graph = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const locationState = location.state as LocationState;

  const [nodes, setNodes] = useState<Node<StateNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get server details from location state
  const serverIp = locationState?.serverIp || 'localhost';
  const serverPort = locationState?.serverPort || '3001';
  const baseUrl = `http://${serverIp}:${serverPort}/api`;

  // Process the states data into consolidated nodes and edges
  const processStatesData = (states: StateData[]) => {
    if (!states || states.length === 0) {
      setError('No states found for this session');
      setLoading(false);
      return;
    }

    // Sort states by timestamp
    const sortedStates = [...states].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Group states by stateId to consolidate duplicates
    const stateGroups: { [stateId: string]: StateData[] } = {};
    sortedStates.forEach(state => {
      if (!stateGroups[state.stateId]) {
        stateGroups[state.stateId] = [];
      }
      stateGroups[state.stateId].push(state);
    });

    const newNodes: Node<StateNodeData>[] = [];
    const newEdges: Edge[] = [];
    const nodePositions: { [key: string]: { x: number, y: number } } = {};
    
    // Create nodes - one per logical state (stateId)
    Object.entries(stateGroups).forEach(([stateId, stateInstances]) => {
      // Sort instances by timestamp (newest first for getting latest data)
      const sortedInstances = [...stateInstances].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      const latestInstance = sortedInstances[0];
      
      // Calculate position - use stateNumber for vertical positioning
      const urlKey = latestInstance.pathname || latestInstance.url;
      
      // Group states by URL horizontally
      let xPos = 0;
      const existingUrl = Object.keys(nodePositions).find(key => key.includes(urlKey));
      
      if (existingUrl) {
        xPos = nodePositions[existingUrl].x;
      } else {
        // Find unique URLs to space them horizontally
        const uniqueUrls = new Set();
        for (const pos in nodePositions) {
          uniqueUrls.add(pos.split('_')[0]);
        }
        xPos = uniqueUrls.size * 350;
      }
      
      // Sort instances chronologically for history display
      const historyInstances = [...stateInstances].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Position vertically by stateNumber
      const yPos = latestInstance.stateNumber * 150;
      
      // Store the position
      nodePositions[`${urlKey}_${latestInstance.stateNumber}`] = { x: xPos, y: yPos };
      
      // Create the consolidated node
      newNodes.push({
        id: stateId,
        type: 'stateNode',
        position: { x: xPos, y: yPos },
        data: {
          stateId: latestInstance.stateId,
          stateNumber: latestInstance.stateNumber,
          title: latestInstance.title,
          url: latestInstance.url,
          latestTimestamp: latestInstance.timestamp,
          isNewState: latestInstance.isNewState,
          hash: latestInstance.hash,
          interaction: latestInstance.interactionInfo,
          isNavigation: latestInstance.loadingInfo?.isNavigation,
          isReload: latestInstance.loadingInfo?.isReload,
          history: historyInstances,
          instanceCount: stateInstances.length
        }
      });
    });

    // Create edges between states
    for (const state of sortedStates) {
      if (state.previousStateId) {
        // Only create one edge between each logical state pair
        const edgeId = `e-${state.previousStateId}-${state.stateId}`;
        const existingEdge = newEdges.find(e => e.id === edgeId);
        
        if (!existingEdge) {
          newEdges.push({
            id: edgeId,
            source: state.previousStateId,
            target: state.stateId,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20
            },
            style: {
              strokeWidth: 2
            }
          });
        }
      }
    }

    setNodes(newNodes);
    setEdges(newEdges);
    setLoading(false);
  };

  // Fetch states for the session
  const fetchSessionStates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${baseUrl}/extension/recorder/session/${sessionId}/states`);
      
      if (response.data.success) {
        processStatesData(response.data.states);
      } else {
        setError('Failed to load session states');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error fetching session states:', err);
      setError('Error connecting to server');
      setLoading(false);
    }
  }, [baseUrl, sessionId]);

  useEffect(() => {
    if (sessionId) {
      fetchSessionStates();
    }
  }, [sessionId, fetchSessionStates]);

  // Handle node changes (for dragging)
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  // Handle edge changes
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-700">Loading session data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-md">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error Loading Graph</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-gray-50 relative">
      <div className="absolute top-4 left-4 z-10 bg-white p-3 rounded-md shadow-md">
        <h2 className="font-bold text-gray-800">Session: {sessionId?.substring(0, 8)}...</h2>
        <p className="text-sm text-gray-600">{nodes.length} states • {edges.length} transitions</p>
      </div>
      
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

export default Graph; 
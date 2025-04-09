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
  NodeProps
} from 'reactflow';
import 'reactflow/dist/style.css';

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

// Define state node data type
interface StateNodeData {
  _id: string; // Added _id to track the actual MongoDB document
  stateId: string;
  stateNumber: number;
  title: string;
  url: string;
  timestamp: string;
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
}

// Custom node component for state nodes
const StateNode = ({ data }: NodeProps<StateNodeData>) => {
  // Format the timestamp for display
  const formattedTime = new Date(data.timestamp).toLocaleTimeString();
  
  return (
    <div className={`px-4 py-2 shadow-md rounded-md bg-white border-2 ${data.isNewState ? 'border-blue-300' : 'border-gray-200'} min-w-[180px]`}>
      <div className="font-bold text-sm">{data.title || 'Untitled State'}</div>
      <div className="text-xs mt-1">State: {data.stateNumber}</div>
      <div className="text-xs text-gray-500">{formattedTime}</div>
      <div className="text-xs mt-1">
        {data.isNewState ? (
          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">New State</span>
        ) : (
          <span className="inline-block px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">Duplicate</span>
        )}
      </div>
      {data.interaction && (
        <div className="mt-2 text-xs p-1 bg-blue-50 rounded border border-blue-100">
          <div className="font-semibold text-blue-700">{data.interaction.type}</div>
          <div>{data.interaction.text || data.interaction.element}</div>
        </div>
      )}
      {data.isNavigation && (
        <div className="mt-1 text-xs bg-green-50 p-1 rounded border border-green-100 text-green-700">
          Navigation
        </div>
      )}
      {data.isReload && (
        <div className="mt-1 text-xs bg-yellow-50 p-1 rounded border border-yellow-100 text-yellow-700">
          Page Reload
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

  // Process the states data into nodes and edges
  const processStatesData = (states: StateData[]) => {
    if (!states || states.length === 0) {
      setError('No states found for this session');
      setLoading(false);
      return;
    }

    // Sort states by timestamp to maintain chronological order
    const sortedStates = [...states].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const newNodes: Node<StateNodeData>[] = [];
    const newEdges: Edge[] = [];
    const nodePositions: { [key: string]: { x: number, y: number } } = {};
    
    // We'll use this map to track the most recent node created for each stateId
    // This is needed for edge creation, as previousStateId references the logical state, not the specific occurrence
    const lastNodeByStateId: { [stateId: string]: string } = {};
    
    // First pass: create nodes
    sortedStates.forEach((state, index) => {
      // Use MongoDB _id as the unique node identifier to ensure each database record is a separate node
      const nodeId = state._id;
      
      // Calculate position based on chronological sequence
      const yPos = index * 150;
      
      // Group states by URL horizontally
      let xPos = 0;
      const urlKey = state.pathname || state.url;
      const existingUrl = Object.keys(nodePositions).find(key => key.includes(urlKey));
      
      if (existingUrl) {
        xPos = nodePositions[existingUrl].x;
      } else {
        // Find unique URLs to space them horizontally
        const uniqueUrls = new Set();
        for (const pos in nodePositions) {
          uniqueUrls.add(pos.split('_')[0]);
        }
        xPos = uniqueUrls.size * 400;
      }
      
      // Store the position
      nodePositions[`${urlKey}_${index}`] = { x: xPos, y: yPos };
      
      // Create the node
      newNodes.push({
        id: nodeId,
        type: 'stateNode',
        position: { x: xPos, y: yPos },
        data: {
          _id: state._id,
          stateId: state.stateId,
          stateNumber: state.stateNumber,
          title: state.title,
          url: state.url,
          timestamp: state.timestamp,
          isNewState: state.isNewState,
          hash: state.hash,
          interaction: state.interactionInfo,
          isNavigation: state.loadingInfo?.isNavigation,
          isReload: state.loadingInfo?.isReload
        }
      });
      
      // Update the mapping of which node was last created for this stateId
      lastNodeByStateId[state.stateId] = nodeId;
    });

    // Second pass: create edges
    sortedStates.forEach(state => {
      if (state.previousStateId) {
        // Find the last node created for the previous state
        const sourceNodeId = lastNodeByStateId[state.previousStateId];
        // Use current state's MongoDB _id as the target
        const targetNodeId = state._id;
        
        if (sourceNodeId && targetNodeId) {
          newEdges.push({
            id: `e-${sourceNodeId}-${targetNodeId}`,
            source: sourceNodeId,
            target: targetNodeId,
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
    });

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
    <div className="w-full h-screen bg-gray-50">
      <div className="absolute top-4 left-4 z-10 bg-white p-3 rounded-md shadow-md">
        <h2 className="font-bold text-gray-800">Session: {sessionId?.substring(0, 8)}...</h2>
        <p className="text-sm text-gray-600">{nodes.length} states • {edges.length} transitions</p>
      </div>
      
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
    </div>
  );
};

export default Graph; 
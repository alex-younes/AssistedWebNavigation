import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import axios, { AxiosError } from 'axios';
import ReactFlow, { 
  Background, 
  Controls, 
  Edge, 
  Node, 
  NodeChange, 
  EdgeChange, 
  applyNodeChanges, 
  applyEdgeChanges,
  NodeProps,
  ReactFlowProvider,
  BaseEdge,
  BackgroundVariant,
  Handle,
  Position,
  ConnectionMode
} from 'reactflow';
import 'reactflow/dist/style.css';
import styled from 'styled-components';

// Define a styled component for the edges with more prominent styling
const StyledEdge = styled(BaseEdge)`
  stroke: #333;
  stroke-width: 3;
  pointer-events: all;

  path.react-flow__edge-path {
    stroke: #333;
    stroke-width: 3;
  }

  &.selected {
    stroke: #1a192b;
    stroke-width: 4;
  }
`;

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
  serverIp?: string;
  serverPort?: string;
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
  isLatest?: boolean;
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
  const formattedTime = new Date(data.latestTimestamp).toLocaleTimeString();
  
  const getLatestEvent = () => {
    const sortedHistory = [...data.history].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    for (const item of sortedHistory) {
      if (item.interactionInfo) return { type: 'interaction', data: item.interactionInfo };
      if (item.loadingInfo?.isNavigation) return { type: 'navigation' };
      if (item.loadingInfo?.isReload) return { type: 'reload' };
    }
    
    return null;
  };
  
  const latestEvent = getLatestEvent();
  
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#333', width: '10px', height: '10px' }}
        id={`target-${data.stateId}`}
      />
      
      <div 
        className={`px-4 py-2 shadow-md rounded-md bg-white border-2 ${
          data.isLatest 
            ? 'border-green-500 shadow-green-200' 
            : 'border-gray-300'
        } min-w-[180px] hover:shadow-lg transition-shadow cursor-pointer ${
          data.isLatest ? 'ring-4 ring-green-100' : ''
        }`}
        onClick={() => setShowDetails(true)}
      >
        <div className="font-bold text-sm flex items-center justify-between">
          <span>{data.title || 'Untitled State'}</span>
          {data.isLatest && (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
              Current
            </span>
          )}
        </div>
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
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#333', width: '10px', height: '10px' }}
        id={`source-${data.stateId}`}
      />

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
    </>
  );
};

// Define node and edge types outside the component and memoize them
const nodeTypes = {
  stateNode: StateNode,
};

const edgeTypes = {
  default: StyledEdge,
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

  const createNode = useCallback((state: StateData, index: number, allStates: StateData[]) => {
    // Find all instances of this state by stateId
    const stateInstances = allStates.filter(s => s.stateId === state.stateId);
    
    return {
      id: state.stateId,
      // Position nodes in a stair pattern - each node is offset both horizontally and vertically
      position: { 
        x: index * 300, 
        y: index * 100 
      },
      data: { 
        stateId: state.stateId,
        stateNumber: state.stateNumber,
        title: state.title,
        url: state.url,
        latestTimestamp: state.timestamp,
        isNewState: state.isNewState,
        hash: state.hash,
        interaction: state.interactionInfo,
        isNavigation: state.loadingInfo?.isNavigation,
        isReload: state.loadingInfo?.isReload,
        history: stateInstances,
        instanceCount: stateInstances.length,
        isLatest: false // Default value, will be updated in processStatesData
      },
      type: 'stateNode',
    };
  }, []);

  const createEdge = useCallback((sourceId: string, targetId: string) => {
    return {
      id: `e${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'smoothstep',
      animated: true,
      style: { 
        strokeWidth: 3,
        stroke: '#333'
      }
    };
  }, []);

  const processStatesData = useCallback((states: StateData[]) => {
    if (!states || states.length === 0) {
      setError('No states found for this session');
      setLoading(false);
      return;
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    
    // Sort states by timestamp to ensure correct order
    const sortedStates = [...states].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Find the latest activity timestamp across all states
    let latestActivityTime = 0;
    let latestActivityStateId = '';

    states.forEach(state => {
      let activityTime = new Date(state.timestamp).getTime();
      
      // Check for interaction timestamp
      if (state.interactionInfo?.timestamp) {
        const interactionTime = new Date(state.interactionInfo.timestamp).getTime();
        if (interactionTime > activityTime) {
          activityTime = interactionTime;
        }
      }

      // Check for navigation or reload events
      if (state.loadingInfo?.isNavigation || state.loadingInfo?.isReload) {
        // Use the state's timestamp for navigation/reload events
        if (activityTime > latestActivityTime) {
          latestActivityTime = activityTime;
          latestActivityStateId = state.stateId;
        }
      }
      
      // Update if this is the latest activity
      if (activityTime > latestActivityTime) {
        latestActivityTime = activityTime;
        latestActivityStateId = state.stateId;
      }
    });

    // Create a Map to track unique states and their order of appearance
    const uniqueStates = new Map<string, { state: StateData; index: number }>();
    
    // Keep track of state order while maintaining uniqueness
    sortedStates.forEach((state) => {
      if (!uniqueStates.has(state.stateId)) {
        uniqueStates.set(state.stateId, { state, index: uniqueStates.size });
      }
    });
    
    // Create nodes for unique states in order of appearance
    Array.from(uniqueStates.values()).forEach(({ state, index }) => {
      const nodeData = createNode(state, index, states);
      // Set isLatest based on latest activity
      nodeData.data.isLatest = state.stateId === latestActivityStateId;
      newNodes.push(nodeData);
    });

    // Create edges between consecutive unique states
    const uniqueStateArray = Array.from(uniqueStates.values());
    for (let i = 1; i < uniqueStateArray.length; i++) {
      const currentState = uniqueStateArray[i].state;
      const previousState = uniqueStateArray[i - 1].state;
      newEdges.push(createEdge(previousState.stateId, currentState.stateId));
    }

    setNodes(newNodes);
    setEdges(newEdges);
    setLoading(false);
  }, [createNode, createEdge]);

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
      const error = err as AxiosError;
      console.error('Error fetching session states:', error.message);
      setError(`Error connecting to server: ${error.message}`);
      setLoading(false);
    }
  }, [baseUrl, sessionId, processStatesData]);

  useEffect(() => {
    if (sessionId) {
      fetchSessionStates();
    }
  }, [sessionId, fetchSessionStates]);

  useEffect(() => {
    if (nodes.length > 0) {
      console.log('Current nodes:', nodes);
      console.log('Current edges:', edges);
    }
  }, [nodes, edges]);

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
      <div className="absolute top-4 left-4 z-10 bg-white p-4 rounded-md shadow-md max-w-md">
        <h2 className="font-bold text-gray-800 break-all">
          Session: {sessionId}
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          {nodes.length} states • {edges.length} transitions
        </p>
      </div>
      
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{
            type: 'default',
            animated: true,
            style: { 
              stroke: '#333',
              strokeWidth: 3,
            }
          }}
          fitView
          fitViewOptions={{ padding: 0.8 }}
          minZoom={0.3}
          maxZoom={1.5}
          attributionPosition="bottom-right"
          connectionMode={ConnectionMode.Loose}
          snapToGrid={true}
          snapGrid={[20, 20]}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

export default Graph; 
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
import LiveFeed from './LiveFeed';
import { useSocket } from '../contexts/SocketContext';

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
  sessionData?: {
    id: string;
    status: string;
  };
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
  openInteractionModal?: (stateId: string, sessionId: string) => void;
}

// Define interface for NonTransitionalData
interface NonTransitionalEventBase {
  timestamp: string;
  [key: string]: unknown; // Allow other properties, but require type checking
}

interface HoverEvent extends NonTransitionalEventBase {
  element: string;
  selector: string;
  duration: number;
}

interface MouseMoveData {
  heatmap: number[][];
  totalDistance: number;
  averageSpeed: number;
}

interface KeyTypingCadenceEvent extends NonTransitionalEventBase {
  field: string;
  key: string;
  timeSinceLast: number;
}

interface InactivityEvent extends NonTransitionalEventBase {
  duration: number;
  trigger: string;
}

// Add other specific event types as needed based on content.js
// For simplicity, others can be generic or `any[]` for now if their structure is complex or varies

interface NonTransitionalEventsData {
  hover: HoverEvent[];
  mousemove: MouseMoveData;
  keyTypingCadence: KeyTypingCadenceEvent[];
  inactivity: InactivityEvent[];
  escapeBackspace?: NonTransitionalEventBase[];
  tabNavigation?: NonTransitionalEventBase[];
  repeatedClicks?: NonTransitionalEventBase[];
  copyText?: NonTransitionalEventBase[];
  pasteWithoutTyping?: NonTransitionalEventBase[];
  repeatedInputs?: NonTransitionalEventBase[];
  oscillatingHovers?: NonTransitionalEventBase[];
  keydownWithoutSubmit?: NonTransitionalEventBase[];
  inputFieldIdle?: NonTransitionalEventBase[];
  // New event types based on the sample data
  allKeyPresses?: NonTransitionalEventBase[];
  deadClicks?: NonTransitionalEventBase[];
  dropdownToggle?: NonTransitionalEventBase[];
  scrollEvents?: NonTransitionalEventBase[];
}

interface NonTransitionalMetricsData {
  totalIdleTime: number;
  longestIdlePeriod: number;
  dwellTimeBeforeAction: number; // This might not be tracked anymore, verify
  totalMouseDistance: number;
  totalKeystrokes: number;
  totalClicks: number;
  totalHoverTime: number;
}

interface NonTransitionalAPIData {
  _id: string;
  stateId: string;
  sessionId: string;
  userId: string;
  events: NonTransitionalEventsData;
  metrics: NonTransitionalMetricsData;
  createdAt: string;
  lastUpdated: string;
  __v?: number;
}

// Modal component for displaying Non-Transitional Events
const InteractionDetailsModal = ({
  data,
  isLoading,
  onClose,
}: {
  data: NonTransitionalAPIData | null;
  isLoading: boolean;
  onClose: () => void;
}) => {
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-[100]">
        <div className="p-8 bg-white rounded-lg shadow-xl">
          <p className="text-lg font-medium">Loading interaction details...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    // This case should ideally not be hit if modal is only shown when data is present
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-[100]" onClick={onClose}>
        <div className="p-8 bg-white rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
          <p className="text-lg font-medium">No interaction details to display.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Close</button>
        </div>
      </div>
    );
  }

  // The detailed rendering logic from before, now inside the modal
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="relative p-8 bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={onClose} 
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-200 text-gray-600 hover:text-gray-800"
          aria-label="Close modal"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        {/* Enhanced header with context */}
        <div className="bg-indigo-50 -m-8 mb-6 p-8 border-b border-indigo-100">
          <h3 className="text-2xl font-bold text-indigo-800">Non-Transitional Events</h3>
          <div className="flex flex-wrap mt-2 gap-4">
            <div>
              <span className="text-xs text-indigo-500 font-semibold">STATE ID</span>
              <p className="text-sm font-medium">{data.stateId}</p>
            </div>
            <div>
              <span className="text-xs text-indigo-500 font-semibold">SESSION ID</span>
              <p className="text-sm font-medium">{data.sessionId}</p>
            </div>
            <div>
              <span className="text-xs text-indigo-500 font-semibold">RECORDED</span>
              <p className="text-sm font-medium">{new Date(data.createdAt).toLocaleString()}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-indigo-700">
            This panel shows detailed user interactions that don't cause page navigation but provide insight into user behavior
          </p>
        </div>
        
        <div className="space-y-6 text-sm">
          {/* Metrics Display with enhanced visuals */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <h4 className="font-semibold text-lg mb-3 text-gray-800">Non-Transitional Metrics</h4>            <p className="text-gray-600 mb-3">Summary of quantitative measurements of user behavior during this state</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Time metrics */}
              <div className="bg-white p-3 rounded shadow-sm">
                <h5 className="text-sm font-medium text-gray-700 mb-2">Time Metrics</h5>
                {Object.entries(data.metrics || {})
                  .filter(([key]) => 
                    key.toLowerCase().includes('time') || 
                    key.toLowerCase().includes('period') || 
                    key.toLowerCase().includes('dwell')
                  )
                  .map(([key, value]) => {
                    const displayValue = `${(Number(value) / 1000).toFixed(2)}s`;
                    return (
                      <div key={key} className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                        <span className="font-mono font-medium">{displayValue}</span>
                      </div>
                    );
                  })}
              </div>
              
              {/* Mouse metrics */}
              <div className="bg-white p-3 rounded shadow-sm">
                <h5 className="text-sm font-medium text-gray-700 mb-2">Mouse Metrics</h5>
                {Object.entries(data.metrics || {})
                  .filter(([key]) => 
                    key.toLowerCase().includes('mouse') || 
                    key.toLowerCase().includes('distance') ||
                    key.toLowerCase().includes('clicks') ||
                    key.toLowerCase().includes('hover')
                  )
                  .map(([key, value]) => {
                    let displayValue = String(value);
                    if (key.toLowerCase().includes('distance')) {
                      displayValue = `${Number(value).toFixed(0)}px`;
                    }
                    if (key.toLowerCase().includes('hover') && key.toLowerCase().includes('time')) {
                      displayValue = `${(Number(value) / 1000).toFixed(2)}s`;
                    }
                    return (
                      <div key={key} className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-600">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                        <span className="font-mono font-medium">{displayValue}</span>
                      </div>
                    );
                  })}
              </div>
              
              {/* Keyboard metrics */}
              <div className="bg-white p-3 rounded shadow-sm">
                <h5 className="text-sm font-medium text-gray-700 mb-2">Keyboard Metrics</h5>
                {Object.entries(data.metrics || {})
                  .filter(([key]) => 
                    key.toLowerCase().includes('key') || 
                    key.toLowerCase().includes('input')
                  )
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between py-1 border-b border-gray-100">
                      <span className="text-gray-600">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                      <span className="font-mono font-medium">{value}</span>
                    </div>
                  ))}
              </div>
              
              {/* Other metrics that didn't fit in categories */}
              {Object.entries(data.metrics || {})
                .filter(([key]) => 
                  !key.toLowerCase().includes('time') && 
                  !key.toLowerCase().includes('period') && 
                  !key.toLowerCase().includes('dwell') &&
                  !key.toLowerCase().includes('mouse') && 
                  !key.toLowerCase().includes('distance') &&
                  !key.toLowerCase().includes('clicks') &&
                  !key.toLowerCase().includes('hover') &&
                  !key.toLowerCase().includes('key') && 
                  !key.toLowerCase().includes('input')
                )
                .length > 0 && (
                <div className="bg-white p-3 rounded shadow-sm md:col-span-3">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Other Metrics</h5>
                  <div className="grid grid-cols-2">
                    {Object.entries(data.metrics || {})
                      .filter(([key]) => 
                        !key.toLowerCase().includes('time') && 
                        !key.toLowerCase().includes('period') && 
                        !key.toLowerCase().includes('dwell') &&
                        !key.toLowerCase().includes('mouse') && 
                        !key.toLowerCase().includes('distance') &&
                        !key.toLowerCase().includes('clicks') &&
                        !key.toLowerCase().includes('hover') &&
                        !key.toLowerCase().includes('key') && 
                        !key.toLowerCase().includes('input')
                      )
                      .map(([key, value]) => (
                        <div key={key} className="flex justify-between py-1 border-b border-gray-100">
                          <span className="text-gray-600">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                          <span className="font-mono font-medium">{value}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
            
            {Object.keys(data.metrics || {}).length === 0 && 
              <div className="text-center py-6 text-gray-500">No metrics recorded for this state</div>
            }
          </div>

          {/* Events Display with enhanced structure */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <h4 className="font-semibold text-lg mb-3 text-gray-800">Non-Transitional Events</h4>            <p className="text-gray-600 mb-3">Detailed record of specific user interactions that don't cause page navigation</p>
            
            {/* No events case */}
            {(!data.events || Object.keys(data.events).length === 0 || 
              Object.values(data.events).every(val => 
                Array.isArray(val) ? val.length === 0 : 
                (val as MouseMoveData)?.totalDistance === 0 && !(val as MouseMoveData)?.heatmap?.flat().some(h => h > 0)
              )) && (
              <div className="text-center py-10 text-gray-500">
                <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                                <p className="font-medium">No non-transitional events were recorded for this state</p>                <p className="mt-1">User may have viewed the page without detailed interaction</p>
              </div>
            )}

            <div className="space-y-6">
              {/* Hover Events */}
              {data.events?.hover?.length > 0 && (
                <div className="bg-white p-4 rounded-md border border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <h5 className="font-semibold text-blue-700">
                      <span className="bg-blue-50 px-3 py-1 rounded-full mr-2">
                        <i className="fas fa-mouse-pointer text-xs mr-1"></i>
                        {data.events.hover.length}
                      </span>
                      Hover Events
                    </h5>
                    <span className="text-xs text-gray-500">{(data.events.hover.reduce((sum, h) => sum + h.duration, 0) / 1000).toFixed(2)}s total hover time</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2 text-left">Element</th>
                          <th className="px-4 py-2 text-left">Selector</th>
                          <th className="px-4 py-2 text-right">Duration</th>
                          <th className="px-4 py-2 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.events.hover.map((event, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="px-4 py-2 font-medium">{event.element}</td>
                            <td className="px-4 py-2 font-mono text-xs truncate max-w-[200px]" title={event.selector}>
                              {event.selector}
                            </td>
                            <td className="px-4 py-2 text-right font-mono">{(event.duration / 1000).toFixed(2)}s</td>
                            <td className="px-4 py-2 text-right text-gray-500">{new Date(event.timestamp).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Mouse Movement */}
              {data.events?.mousemove && (data.events.mousemove.totalDistance > 0 || data.events.mousemove.heatmap?.flat().some(h => h > 0)) && (
                <div className="bg-white p-4 rounded-md border border-gray-200">
                  <h5 className="font-semibold text-green-700 mb-3">Mouse Movement</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-3 rounded-md">
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-600">Total Distance:</span>
                        <span className="font-mono font-medium">{data.events.mousemove.totalDistance.toFixed(0)}px</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Average Speed:</span>
                        <span className="font-mono font-medium">{data.events.mousemove.averageSpeed.toFixed(2)}px/s</span>
                      </div>
                    </div>
                    
                    {data.events.mousemove.heatmap?.flat().some(h => h > 0) && (
                      <div className="bg-gray-50 p-3 rounded-md">
                        <h6 className="font-medium text-gray-700 mb-2">Heatmap Data</h6>
                        <p className="text-xs text-gray-600">
                          The heatmap shows areas where the user's mouse spent the most time. 
                          The mouse activity is distributed across a 10x10 grid overlaying the page.
                        </p>
                        <div className="mt-3 border border-gray-200 rounded overflow-hidden">
                          <div className="grid grid-cols-10 gap-0">
                            {data.events.mousemove.heatmap.map((row, rowIdx) => (
                              row.map((value, colIdx) => {
                                // Calculate color intensity based on value
                                const intensity = Math.min(value / 5, 1); // normalize between 0-1
                                let bgColor = 'rgb(249, 250, 251)'; // light gray for zero
                                
                                if (value > 0) {
                                  // Values from 1-2 will be blue
                                  if (value <= 2) {
                                    bgColor = `rgba(59, 130, 246, ${intensity})`;
                                  } 
                                  // Values from 3-5 will be green
                                  else if (value <= 5) {
                                    bgColor = `rgba(16, 185, 129, ${intensity})`;
                                  }
                                  // Values > 5 will be red
                                  else {
                                    bgColor = `rgba(239, 68, 68, ${intensity})`;
                                  }
                                }
                                
                                return (
                                  <div 
                                    key={`${rowIdx}-${colIdx}`} 
                                    className="w-full aspect-square flex items-center justify-center"
                                    style={{ backgroundColor: bgColor }}
                                    title={`Position (${colIdx},${rowIdx}): ${value} events`}
                                  >
                                    {value > 0 && value >= 5 && (
                                      <span className="text-[6px] text-white font-bold">{value}</span>
                                    )}
                                  </div>
                                );
                              })
                            ))}
                          </div>
                        </div>
                        <div className="flex justify-between mt-2 text-xs">
                          <div className="flex items-center">
                            <div className="w-3 h-3 bg-blue-400 rounded-sm mr-1"></div>
                            <span>Low</span>
                          </div>
                          <div className="flex items-center">
                            <div className="w-3 h-3 bg-green-400 rounded-sm mr-1"></div>
                            <span>Medium</span>
                          </div>
                          <div className="flex items-center">
                            <div className="w-3 h-3 bg-red-400 rounded-sm mr-1"></div>
                            <span>High</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Key Typing Cadence */}
              {data.events?.keyTypingCadence?.length > 0 && (
                <div className="bg-white p-4 rounded-md border border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <h5 className="font-semibold text-purple-700">
                      <span className="bg-purple-50 px-3 py-1 rounded-full mr-2">
                        <i className="fas fa-keyboard text-xs mr-1"></i>
                        {data.events.keyTypingCadence.length}
                      </span>
                      Keyboard Events
                    </h5>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2 text-left">Field</th>
                          <th className="px-4 py-2 text-left">Key</th>
                          <th className="px-4 py-2 text-right">Time Since Last</th>
                          <th className="px-4 py-2 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.events.keyTypingCadence.slice(0, 10).map((event, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="px-4 py-2 font-mono text-xs truncate max-w-[200px]" title={event.field}>
                              {event.field}
                            </td>
                            <td className="px-4 py-2">
                              <span className="px-2 py-1 bg-gray-100 rounded font-mono">{event.key}</span>
                            </td>
                            <td className="px-4 py-2 text-right font-mono">{(event.timeSinceLast / 1000).toFixed(2)}s</td>
                            <td className="px-4 py-2 text-right text-gray-500">{new Date(event.timestamp).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {data.events.keyTypingCadence.length > 10 && (
                      <div className="text-center mt-2 text-gray-500">
                        ...and {data.events.keyTypingCadence.length - 10} more keystrokes
                        <button className="ml-2 text-blue-500 hover:underline">
                          Show All
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Inactivity Periods */}
              {data.events?.inactivity?.length > 0 && (
                <div className="bg-white p-4 rounded-md border border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <h5 className="font-semibold text-amber-700">
                      <span className="bg-amber-50 px-3 py-1 rounded-full mr-2">
                        <i className="fas fa-pause text-xs mr-1"></i>
                        {data.events.inactivity.length}
                      </span>
                      Inactivity Periods
                    </h5>
                    <span className="text-xs text-gray-500">
                      {(data.events.inactivity.reduce((sum, i) => sum + i.duration, 0) / 1000).toFixed(2)}s total idle time
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2 text-left">Trigger</th>
                          <th className="px-4 py-2 text-right">Duration</th>
                          <th className="px-4 py-2 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.events.inactivity.map((event, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="px-4 py-2">{event.trigger}</td>
                            <td className="px-4 py-2 text-right font-mono">{(event.duration / 1000).toFixed(2)}s</td>
                            <td className="px-4 py-2 text-right text-gray-500">{new Date(event.timestamp).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Other Event Types */}
              {Object.entries(data.events || {}).map(([eventType, eventArray]) => {
                if (!['hover', 'mousemove', 'keyTypingCadence', 'inactivity'].includes(eventType) && 
                    Array.isArray(eventArray) && eventArray.length > 0) {
                  
                  // Determine icon and color based on event type
                  let icon = "circle";
                  let color = "gray";
                  
                  if (eventType.includes('Escape') || eventType.includes('Backspace')) {
                    icon = "undo";
                    color = "red";
                  } else if (eventType.includes('Tab')) {
                    icon = "arrow-right";
                    color = "green";
                  } else if (eventType.includes('Click')) {
                    icon = "mouse-pointer";
                    color = "blue";
                  } else if (eventType.includes('Copy')) {
                    icon = "copy";
                    color = "indigo";
                  } else if (eventType.includes('Paste')) {
                    icon = "paste";
                    color = "purple";
                  } else if (eventType.includes('Input')) {
                    icon = "pen";
                    color = "pink";
                  } else if (eventType.includes('Hover')) {
                    icon = "hand-pointer";
                    color = "orange";
                  } else if (eventType.includes('Key') || eventType === 'allKeyPresses') {
                    icon = "keyboard";
                    color = "teal";
                  } else if (eventType === 'deadClicks') {
                    icon = "times-circle";
                    color = "red";
                  } else if (eventType === 'dropdownToggle') {
                    icon = "caret-down";
                    color = "blue";
                  } else if (eventType === 'scrollEvents') {
                    icon = "arrows-alt-v";
                    color = "purple";
                  }
                  
                  return (
                    <div key={eventType} className="bg-white p-4 rounded-md border border-gray-200 mb-4">
                      <div className="flex justify-between items-center mb-3">
                        <h5 className={`font-semibold text-${color}-700`}>
                          <span className={`bg-${color}-50 px-3 py-1 rounded-full mr-2`}>
                            <i className={`fas fa-${icon} text-xs mr-1`}></i>
                            {eventArray.length}
                          </span>
                          {eventType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </h5>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(eventArray as NonTransitionalEventBase[]).slice(0, 4).map((event, idx) => (
                          <div key={idx} className="bg-gray-50 p-2 rounded">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-500">Timestamp:</span>
                              <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                            </div>
                            {Object.entries(event)
                              .filter(([key]) => key !== 'timestamp' && key !== '_id' && key !== '__v')
                              .map(([key, value]) => (
                                <div key={key} className="flex justify-between text-xs">
                                  <span className="text-gray-500">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</span>
                                  <span className="font-mono truncate max-w-[150px]" title={String(value)}>
                                    {String(value).substring(0, 30)}{String(value).length > 30 ? '...' : ''}
                                  </span>
                                </div>
                              ))}
                          </div>
                        ))}
                      </div>
                      {eventArray.length > 4 && (
                        <div className="text-center mt-2 text-xs text-gray-500">
                          ...and {eventArray.length - 4} more events
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })}
              
              {/* Empty Arrays Information */}
              {['keyTypingCadence', 'keydownWithoutSubmit', 'escapeBackspace', 
                'tabNavigation', 'repeatedClicks', 'repeatedInputs', 
                'oscillatingHovers', 'inactivity', 'inputFieldIdle', 
                'pasteWithoutTyping', 'copyText', 'allKeyPresses',
                'deadClicks', 'dropdownToggle', 'scrollEvents'].map(eventType => {
                  // Only show if the array doesn't exist or is empty
                  if (!data.events?.[eventType as keyof NonTransitionalEventsData] || 
                      (Array.isArray(data.events[eventType as keyof NonTransitionalEventsData]) && 
                       (data.events[eventType as keyof NonTransitionalEventsData] as NonTransitionalEventBase[]).length === 0)) {
                    return (
                      <div key={eventType} className="bg-white p-4 rounded-md border border-gray-200 mb-4">
                        <h5 className="font-semibold text-gray-700 mb-2">
                          {eventType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </h5>
                        <div className="text-center py-3 text-gray-500">
                          <p>Array (empty)</p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
            </div>
          </div>

          {/* Data Summary */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
            <h4 className="font-semibold text-lg mb-2 text-gray-800">Data Summary</h4>
            
            <div className="flex flex-wrap gap-2">
              {/* Render event badges using a type-safe approach */}
              {(() => {
                // Helper function to render event badges
                const renderEventBadge = (
                  events: NonTransitionalEventBase[] | undefined,
                  label: string,
                  bgColor: string,
                  textColor: string
                ) => {
                  if (!events || events.length === 0) return null;
                  return (
                    <div className={`${bgColor} ${textColor} px-3 py-1 rounded-full text-xs font-medium`}>
                      {events.length} {label}
                    </div>
                  );
                };

                // Array to collect all badges
                const badges = [];
                
                // Add badges for each event type
                if (data.events?.hover && data.events.hover.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.hover, "Hover Events", "bg-blue-50", "text-blue-700")
                  );
                }
                
                if (data.events?.mousemove && data.events.mousemove.totalDistance > 0) {
                  badges.push(
                    <div key="mousemove" className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                      {data.events.mousemove.totalDistance.toFixed(0)}px Mouse Movement
                    </div>
                  );
                }
                
                if (data.events?.keyTypingCadence && data.events.keyTypingCadence.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.keyTypingCadence, "Keyboard Events", "bg-purple-50", "text-purple-700")
                  );
                }
                
                if (data.events?.inactivity && data.events.inactivity.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.inactivity, "Inactivity Periods", "bg-amber-50", "text-amber-700")
                  );
                }
                
                if (data.events?.tabNavigation && data.events.tabNavigation.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.tabNavigation, "Tab Navigations", "bg-indigo-50", "text-indigo-700")
                  );
                }
                
                if (data.events?.repeatedClicks && data.events.repeatedClicks.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.repeatedClicks, "Repeated Clicks", "bg-red-50", "text-red-700")
                  );
                }
                
                if (data.events?.oscillatingHovers && data.events.oscillatingHovers.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.oscillatingHovers, "Oscillating Hovers", "bg-orange-50", "text-orange-700")
                  );
                }
                
                if (data.events?.escapeBackspace && data.events.escapeBackspace.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.escapeBackspace, "Escape/Backspace", "bg-rose-50", "text-rose-700")
                  );
                }
                
                if (data.events?.copyText && data.events.copyText.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.copyText, "Copy Events", "bg-sky-50", "text-sky-700")
                  );
                }
                
                if (data.events?.pasteWithoutTyping && data.events.pasteWithoutTyping.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.pasteWithoutTyping, "Paste Events", "bg-emerald-50", "text-emerald-700")
                  );
                }
                
                if (data.events?.keydownWithoutSubmit && data.events.keydownWithoutSubmit.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.keydownWithoutSubmit, "Keys Without Submit", "bg-teal-50", "text-teal-700")
                  );
                }
                
                if (data.events?.inputFieldIdle && data.events.inputFieldIdle.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.inputFieldIdle, "Input Field Idle", "bg-gray-50", "text-gray-700")
                  );
                }
                
                if (data.events?.repeatedInputs && data.events.repeatedInputs.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.repeatedInputs, "Repeated Inputs", "bg-pink-50", "text-pink-700")
                  );
                }
                
                // Add badges for new event types
                if (data.events?.allKeyPresses && data.events.allKeyPresses.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.allKeyPresses, "All Key Presses", "bg-teal-50", "text-teal-700")
                  );
                }
                
                if (data.events?.deadClicks && data.events.deadClicks.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.deadClicks, "Dead Clicks", "bg-red-50", "text-red-700")
                  );
                }
                
                if (data.events?.dropdownToggle && data.events.dropdownToggle.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.dropdownToggle, "Dropdown Toggles", "bg-blue-50", "text-blue-700")
                  );
                }
                
                if (data.events?.scrollEvents && data.events.scrollEvents.length > 0) {
                  badges.push(
                    renderEventBadge(data.events.scrollEvents, "Scroll Events", "bg-purple-50", "text-purple-700")
                  );
                }
                
                // Return all badges or a message if no events
                return badges.length > 0 ? badges : (
                                    <div className="text-center py-3 text-gray-500 font-medium">                    No non-transitional events recorded                  </div>
                );
              })()}
            </div>
          </div>
          
          {/* Additional Help Context */}
          <div className="bg-indigo-50 p-4 rounded-lg mb-6">
            <div className="flex justify-between">
              <h5 className="font-medium text-indigo-800 mb-2">Understanding Non-Transitional Events</h5>
            </div>
            <p className="text-sm text-indigo-700 mb-2">
              Non-transitional events are interactions that don't cause page navigation but provide insight into user behavior:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-indigo-800">
              <div>
                <span className="font-medium">Hover Events:</span> Elements the user's mouse hovered over and for how long
              </div>
              <div>
                <span className="font-medium">Mouse Movement:</span> Tracking of mouse cursor position and distance traveled
              </div>
              <div>
                <span className="font-medium">Key Typing Cadence:</span> Individual keystrokes and timing between them
              </div>
              <div>
                <span className="font-medium">Inactivity Periods:</span> Times when the user was idle on the page
              </div>
              <div>
                <span className="font-medium">Tab Navigation:</span> User navigating between form fields using Tab key
              </div>
              <div>
                <span className="font-medium">Repeated Clicks:</span> Multiple clicks in close succession
              </div>
              <div>
                <span className="font-medium">Oscillating Hovers:</span> Mouse moving repeatedly between elements
              </div>
              <div>
                <span className="font-medium">Escape/Backspace:</span> User hitting escape or backspace, often indicating correction
              </div>
              <div>
                <span className="font-medium">All Key Presses:</span> Complete record of all keyboard inputs
              </div>
              <div>
                <span className="font-medium">Dead Clicks:</span> Clicks on non-interactive elements
              </div>
              <div>
                <span className="font-medium">Dropdown Toggle:</span> User opening and closing dropdown menus
              </div>
              <div>
                <span className="font-medium">Scroll Events:</span> User scrolling behavior on the page
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// State history panel component
const StateHistoryPanel = ({ 
  state, 
  onClose,
}: { 
  state: StateNodeData | null, 
  onClose: () => void,
}) => {
  if (!state) return null;

  // Function to handle click on View Non-Transitional Events button
  const handleViewInteractionDetails = () => {
    if (state && state.history && state.history.length > 0) {
      // Call the openInteractionModal function that was passed down via state.openInteractionModal
      if (state.openInteractionModal) {
        state.openInteractionModal(state.stateId, state.history[0].sessionId);
      }
    }
  };

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

        {/* Button to open Non-Transitional Events */}
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h4 className="font-semibold mb-2">Non-Transitional Events</h4>
          <button 
            onClick={handleViewInteractionDetails}
            className="w-full mt-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            View Non-Transitional Events
          </button>
        </div>
      </div>
    </div>
  );
};

// Custom node component for state nodes
const StateNode = ({ data: graphNodeData }: NodeProps<StateNodeData>) => {
  const [showDetails, setShowDetails] = useState(false);
  const formattedTime = new Date(graphNodeData.latestTimestamp).toLocaleTimeString();
  
  const getLatestEvent = () => {
    const sortedHistory = [...graphNodeData.history].sort((a, b) => 
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
        id={`target-${graphNodeData.stateId}`}
      />
      
      <div 
        className={`px-4 py-2 shadow-md rounded-md bg-white border-2 ${
          graphNodeData.isLatest 
            ? 'border-green-500 shadow-green-200' 
            : 'border-gray-300'
        } min-w-[180px] hover:shadow-lg transition-shadow cursor-pointer ${
          graphNodeData.isLatest ? 'ring-4 ring-green-100' : ''
        }`}
        onClick={() => setShowDetails(true)}
      >
        <div className="font-bold text-sm flex items-center justify-between">
          <span>{graphNodeData.title || 'Untitled State'}</span>
          {graphNodeData.isLatest && (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
              Current
            </span>
          )}
        </div>
        <div className="text-xs mt-1">State: {graphNodeData.stateNumber}</div>
        <div className="text-xs text-gray-500">{formattedTime}</div>
        
        {graphNodeData.instanceCount > 1 && (
          <div className="text-xs mt-1 bg-purple-100 text-purple-800 px-2 py-1 rounded">
            {graphNodeData.instanceCount} instances
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
        id={`source-${graphNodeData.stateId}`}
      />

      {/* Modal for StateHistoryPanel */}
      {showDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={(e) => {
          e.stopPropagation();
          setShowDetails(false);
        }}>
          <div className="bg-white p-4 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <StateHistoryPanel 
              state={graphNodeData} 
              onClose={() => setShowDetails(false)}
            />
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
  const { socket, isConnected, joinSession, leaveSession } = useSocket();
  
  const [nodes, setNodes] = useState<Node<StateNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'graph' | 'feed'>('graph');
  
  // Session status tracking
  const [currentSessionStatus, setCurrentSessionStatus] = useState<string | null>(
    locationState?.sessionData?.status || null
  );
  
  // Global modal state
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<NonTransitionalAPIData | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);
  
  // New state notification
  const [showNewStateNotification, setShowNewStateNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('New state detected! Graph updated.');
  
  // Real-time updates toggle
  const [realTimeUpdatesEnabled, setRealTimeUpdatesEnabled] = useState(true);

  // Toggle real-time updates and show a notification
  const toggleRealTimeUpdates = useCallback(() => {
    const newState = !realTimeUpdatesEnabled;
    setRealTimeUpdatesEnabled(newState);
    
    // Show notification for status change
    if (!newState) {
      // Leave the session when turning off
      if (socket && isConnected) {
        leaveSession();
      }
      
      // Show temporary notification
      setNotificationMessage('Real-time updates paused. Refresh manually to see new states.');
      setShowNewStateNotification(true);
      setTimeout(() => setShowNewStateNotification(false), 3000);
    } else {
      // Show temporary notification for enabling updates
      setNotificationMessage('Real-time updates enabled. You will see new states automatically.');
      setShowNewStateNotification(true);
      setTimeout(() => setShowNewStateNotification(false), 3000);
    }
  }, [realTimeUpdatesEnabled, socket, isConnected, leaveSession]);

  // Get server details from location state
  const serverIp = locationState?.serverIp || 'localhost';
  const serverPort = locationState?.serverPort || '3001';
  const baseUrl = `http://${serverIp}:${serverPort}/api`;

  // Function to open modal with data - will be passed down to StateNode
  const openInteractionModal = useCallback((stateId: string, sessionId: string) => {
    setIsModalLoading(true);
    setShowModal(true);
    
    // Fetch data
    axios.get(`${baseUrl}/admin/states/${stateId}/nontransitional?sessionId=${sessionId}`)
      .then(response => {
        setModalData(response.data);
        setIsModalLoading(false);
      })
      .catch(error => {
        console.error('Error fetching interaction data:', error);
        setModalData(null);
        setIsModalLoading(false);
      });
  }, [baseUrl]);

  // Function to close modal
  const closeInteractionModal = useCallback(() => {
    setShowModal(false);
    // Optional: clear data when modal closes
    // setModalData(null);
  }, []);

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
        isLatest: false, // Default value, will be updated in processStatesData
        openInteractionModal: openInteractionModal // Pass the function down
      },
      type: 'stateNode',
    };
  }, [openInteractionModal]);

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
    console.log('[DEBUG] Processing states data:', states);
    
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

    console.log('[DEBUG] Generated nodes:', newNodes.length, newNodes);
    console.log('[DEBUG] Generated edges:', newEdges.length, newEdges);
    
    setNodes(newNodes);
    setEdges(newEdges);
    setLoading(false);
    }, [createNode, createEdge]);

  // Setup socket connection for real-time updates
  useEffect(() => {
    if (!sessionId || !socket || !isConnected || !realTimeUpdatesEnabled) return;
    
    console.log('[Socket] Joining session for real-time graph updates:', sessionId);
    joinSession(sessionId);
    
    // Listen for new state events
    const handleNewState = (newState: StateData) => {
      console.log('[Socket] Received new state:', newState.stateId);
      
      // Show notification when new state arrives
      setNotificationMessage(`New state detected: "${newState.title || 'Untitled'}"!`);
      setShowNewStateNotification(true);
      setTimeout(() => setShowNewStateNotification(false), 3000);
      
      // Update the nodes and edges with the new state
      setNodes(prevNodes => {
        // Check if we already have this state
        const existingNodeIndex = prevNodes.findIndex(node => node.id === newState.stateId);
        
        if (existingNodeIndex >= 0) {
          // Update existing node
          const updatedNodes = [...prevNodes];
          const nodeToUpdate = { ...updatedNodes[existingNodeIndex] };
          
          // Add the new state to history if not already present
          const nodeData = nodeToUpdate.data;
          const stateExists = nodeData.history.some(state => 
            state.timestamp === newState.timestamp
          );
          
          if (!stateExists) {
            nodeData.history = [...nodeData.history, newState];
            nodeData.instanceCount = nodeData.history.length;
          }
          
          // Update the latest timestamp if needed
          if (new Date(newState.timestamp) > new Date(nodeData.latestTimestamp)) {
            nodeData.latestTimestamp = newState.timestamp;
          }
          
          updatedNodes[existingNodeIndex] = { ...nodeToUpdate, data: nodeData };
          return updatedNodes;
        } else {
          // It's a new state, add it to the graph
          // Find the max position of existing nodes to place the new one
          let maxX = 0;
          let maxY = 0;
          
          prevNodes.forEach(node => {
            if (node.position.x > maxX) maxX = node.position.x;
            if (node.position.y > maxY) maxY = node.position.y;
          });
          
          // Create a new node
          const newNode = createNode(newState, prevNodes.length, [newState]);
          
          // Position it to the right of the last node
          newNode.position = { x: maxX + 300, y: maxY + 100 };
          
          // Mark previous nodes as not latest
          const updatedNodes = prevNodes.map(node => ({
            ...node,
            data: { ...node.data, isLatest: false }
          }));
          
          // Mark the new node as latest
          newNode.data.isLatest = true;
          
          return [...updatedNodes, newNode];
        }
      });
      
      // Add edge from the latest previous node if it exists
      setEdges(prevEdges => {
        if (prevEdges.length === 0 || !newState.previousStateId) return prevEdges;
        
        // Check if the edge already exists
        const existingEdge = prevEdges.find(edge => 
          edge.source === newState.previousStateId && edge.target === newState.stateId
        );
        
        if (existingEdge) return prevEdges;
        
        // Create a new edge
        const newEdge = createEdge(newState.previousStateId, newState.stateId);
        return [...prevEdges, newEdge];
      });
    };
    
    socket.on('newState', handleNewState);
    
    // Cleanup on unmount
    return () => {
      console.log('[Socket] Leaving session:', sessionId);
      socket.off('newState', handleNewState);
      leaveSession();
    };
  }, [socket, isConnected, sessionId, joinSession, leaveSession, createNode, createEdge, realTimeUpdatesEnabled]);

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

  // Fetch session details if we don't have status information
  useEffect(() => {
    if (sessionId && !currentSessionStatus) {
      axios.get(`${baseUrl}/extension/recorder/session/${sessionId}`)
        .then(response => {
          if (response.data.success && response.data.session) {
            setCurrentSessionStatus(response.data.session.status);
          } else {
            setCurrentSessionStatus('unknown');
          }
        })
        .catch(error => {
          console.error('Error fetching session details:', error);
          setCurrentSessionStatus('error');
        });
    }
  }, [sessionId, baseUrl, currentSessionStatus]);

  // Derived value for determining if the session is active
  const isSessionActive = currentSessionStatus === 'active';

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
    <div className="w-full h-full bg-gray-50 relative flex flex-col">
      {/* Navigation Bar */}
      <div className="bg-white w-full shadow-md p-4 mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg">Session: {sessionId}</h2>
          <p className="text-sm text-gray-600">
            {nodes.length} states • {edges.length} transitions
            <span className="ml-3">
              Status: <span className={currentSessionStatus === 'active' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                {currentSessionStatus || 'Unknown'}
              </span>
            </span>
            {isConnected && currentSessionStatus === 'active' && realTimeUpdatesEnabled && (
              <span className="ml-3 inline-flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                <span className="text-green-600 font-semibold">Real-time updates enabled</span>
              </span>
            )}
            {isConnected && currentSessionStatus === 'active' && !realTimeUpdatesEnabled && (
              <span className="ml-3 inline-flex items-center">
                <span className="w-2 h-2 bg-gray-400 rounded-full mr-1"></span>
                <span className="text-gray-600 font-medium">Real-time updates paused</span>
              </span>
            )}
          </p>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setView('graph')}
            className={`px-4 py-2 rounded font-medium transition ${
              view === 'graph' 
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
            }`}
          >
            Graph View
          </button>
          {isSessionActive && (
            <button
              onClick={() => setView('feed')}
              className={`px-4 py-2 rounded font-medium transition ${
                view === 'feed' 
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-green-100 text-green-800 hover:bg-green-200'
              }`}
            >
              Live Feed
            </button>
          )}
          {(!isSessionActive || (isSessionActive && !realTimeUpdatesEnabled)) && (
            <button
              onClick={fetchSessionStates}
              className="px-4 py-2 rounded font-medium transition bg-gray-100 text-gray-800 hover:bg-gray-200 flex items-center"
              title="Refresh graph to see latest states"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          )}
          {isSessionActive && (
            <div className="flex items-center bg-gray-100 hover:bg-gray-200 rounded px-3 py-1 transition-colors duration-200" title={realTimeUpdatesEnabled ? "Disable real-time updates" : "Enable real-time updates"}>
              <span className="text-sm text-gray-700 mr-2">{realTimeUpdatesEnabled ? "Live" : "Paused"}</span>
              <button
                onClick={toggleRealTimeUpdates}
                className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  realTimeUpdatesEnabled ? 'bg-green-600 focus:ring-green-500' : 'bg-gray-400 focus:ring-gray-400'
                }`}
                role="switch"
                aria-checked={realTimeUpdatesEnabled}
                aria-label={realTimeUpdatesEnabled ? "Disable real-time updates" : "Enable real-time updates"}
              >
                <span className="sr-only">{realTimeUpdatesEnabled ? "Disable" : "Enable"} real-time updates</span>
                <span 
                  className={`inline-block w-4 h-4 transform bg-white rounded-full transition ease-in-out duration-200 ${
                    realTimeUpdatesEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} 
                />
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Main content area - conditionally show Graph or LiveFeed */}
      <div className="flex-grow flex relative">
        {/* New State Notification */}
        {showNewStateNotification && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded shadow-md z-50">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p>{notificationMessage}</p>
            </div>
          </div>
        )}
        <div className="flex-grow h-full relative">
          {(() => {
            console.log('[DEBUG] Rendering view:', view, 'nodes:', nodes.length, 'edges:', edges.length);
            return view === 'graph' ? (
              <ReactFlowProvider>
                <div style={{ width: '100%', height: '85vh' }}>
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    connectionMode={ConnectionMode.Loose}
                    className="bg-gradient-to-br from-gray-100 to-gray-200"
                  >
                    <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#ccc" />
                    <Controls className="react-flow__controls-custom" />
                  </ReactFlow>
                </div>
              </ReactFlowProvider>
            ) : (
              <div className="p-6 h-full">
                <LiveFeed sessionId={sessionId || null} isActiveSession={isSessionActive} />
              </div>
            );
          })()}
        </div>
      </div>

      {/* Mobile floating action buttons for toggling views */}
      <div className="md:hidden fixed bottom-4 right-4 flex flex-col space-y-2 z-30">
        <button
          onClick={() => setView(view === 'graph' ? 'feed' : 'graph')}
          className="w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center"
          title={view === 'graph' ? 'Switch to Feed View' : 'Switch to Graph View'}
        >
          {view === 'graph' ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12 0a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          )}
        </button>
      </div>

      {/* Modals */}
      {showModal && (
        <InteractionDetailsModal
          data={modalData}
          isLoading={isModalLoading}
          onClose={closeInteractionModal}
        />
      )}
    </div>
  );
};

export default Graph; 
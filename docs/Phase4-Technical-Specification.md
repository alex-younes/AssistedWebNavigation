# Phase 4: State Comparison and Transition Logic - Technical Specification

## Overview
Phase 4 implements the state comparison and transition logic of the FSM(DOMs) model. This includes state equivalence checking, transition function implementation, and state history management.

## 1. Core Data Structures

### 1.1 State Transition Interface
```typescript
interface StateTransition {
    sourceStateId: string;
    targetStateId: string;
    event: {
        type: string;
        timestamp: number;
        metadata: any;
    };
    changes: {
        dom: DOMChange[];
        attributes: AttributeChange[];
        events: EventChange[];
        context: ContextChange[];
    };
}

interface DOMChange {
    type: 'add' | 'remove' | 'modify';
    path: string;        // XPath
    oldValue?: any;
    newValue?: any;
}
```

### 1.2 State History Interface
```typescript
interface StateHistory {
    states: Map<string, FSMState>;
    transitions: StateTransition[];
    timeline: {
        stateId: string;
        timestamp: number;
        duration: number;
    }[];
    checkpoints: {
        stateId: string;
        timestamp: number;
        label: string;
    }[];
}
```

## 2. State Comparison Implementation

### 2.1 StateComparator Class
```typescript
class StateComparator {
    private equivalenceRules: Map<string, EquivalenceRule>;

    constructor() {
        this.equivalenceRules = new Map();
        this.setupDefaultRules();
    }

    async compareStates(state1: FSMState, state2: FSMState): Promise<boolean> {
        // DOMi ≡ DOMj iff: Ti = Tj ∧ Ai_static = Aj_static ∧ Ei = Ej ∧ Ci = Cj ∧ Pi = Pj
        return (
            await this.compareDOMTrees(state1.metadata.domTree, state2.metadata.domTree) &&
            this.compareStaticAttributes(state1.metadata.staticAttributes, state2.metadata.staticAttributes) &&
            this.compareEventListeners(state1.metadata.eventListeners, state2.metadata.eventListeners) &&
            this.compareSecurityContext(state1.metadata.securityContext, state2.metadata.securityContext) &&
            this.comparePerformanceMetrics(state1.metadata.performanceMetrics, state2.metadata.performanceMetrics)
        );
    }

    private async compareDOMTrees(tree1: DOMTreeNode, tree2: DOMTreeNode): Promise<boolean> {
        // Implement efficient DOM tree comparison
        // Consider structure and relevant attributes only
        const normalizedTree1 = await this.normalizeDOMTree(tree1);
        const normalizedTree2 = await this.normalizeDOMTree(tree2);
        return this.deepEqual(normalizedTree1, normalizedTree2);
    }

    private async normalizeDOMTree(tree: DOMTreeNode): Promise<any> {
        // Remove transient attributes and normalize for comparison
        return this.removeTransientAttributes(
            this.sortChildren(
                this.normalizeAttributes(tree)
            )
        );
    }
}
```

### 2.2 TransitionManager Class
```typescript
class TransitionManager {
    private currentState: FSMState;
    private stateHistory: StateHistory;
    private comparator: StateComparator;

    constructor() {
        this.stateHistory = this.initializeHistory();
        this.comparator = new StateComparator();
    }

    async handleTransition(event: Event): Promise<void> {
        const newState = await this.captureCurrentState();
        
        // Check if this state already exists
        const existingStateId = await this.findEquivalentState(newState);
        if (existingStateId) {
            // Create transition to existing state
            await this.createTransition(this.currentState.id, existingStateId, event);
            this.currentState = this.stateHistory.states.get(existingStateId)!;
        } else {
            // Create new state and transition
            const stateId = this.generateStateId(newState);
            this.stateHistory.states.set(stateId, newState);
            await this.createTransition(this.currentState.id, stateId, event);
            this.currentState = newState;
        }
    }

    private async findEquivalentState(state: FSMState): Promise<string | null> {
        for (const [stateId, existingState] of this.stateHistory.states) {
            if (await this.comparator.compareStates(state, existingState)) {
                return stateId;
            }
        }
        return null;
    }
}
```

## 3. State History Implementation

### 3.1 HistoryManager Class
```typescript
class HistoryManager {
    private history: StateHistory;
    private compression: StateCompression;

    constructor() {
        this.history = this.initializeHistory();
        this.compression = new StateCompression();
    }

    addState(state: FSMState): void {
        this.history.states.set(state.id, state);
        this.updateTimeline(state);
        this.compressHistoryIfNeeded();
    }

    addTransition(transition: StateTransition): void {
        this.history.transitions.push(transition);
        this.updateCheckpoints(transition);
    }

    private compressHistoryIfNeeded(): void {
        if (this.shouldCompress()) {
            this.compression.compressHistory(this.history);
        }
    }

    getStateAtTime(timestamp: number): FSMState {
        // Find state active at given timestamp
        const timelineEntry = this.history.timeline.find(
            entry => entry.timestamp <= timestamp &&
                    timestamp <= entry.timestamp + entry.duration
        );
        return timelineEntry ? this.history.states.get(timelineEntry.stateId)! : null;
    }
}
```

## 4. Frontend Integration

### 4.1 State Visualization Components
```typescript
interface StateGraphProps {
    history: StateHistory;
    selectedStateId?: string;
    onStateSelect: (stateId: string) => void;
}

const StateGraph: React.FC<StateGraphProps> = ({ history, selectedStateId, onStateSelect }) => {
    const nodes = useMemo(() => createGraphNodes(history), [history]);
    const edges = useMemo(() => createGraphEdges(history), [history]);

    return (
        <div className="state-graph">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodeClick={(_, node) => onStateSelect(node.id)}
            >
                <Controls />
                <Background />
            </ReactFlow>
        </div>
    );
};

interface StateDiffViewerProps {
    state1: FSMState;
    state2: FSMState;
}

const StateDiffViewer: React.FC<StateDiffViewerProps> = ({ state1, state2 }) => {
    const diff = useMemo(() => computeStateDiff(state1, state2), [state1, state2]);

    return (
        <div className="state-diff">
            <DiffTree diff={diff} />
        </div>
    );
};
```

## 5. Implementation Steps

### 5.1 State Comparison
1. Implement StateComparator
2. Add DOM tree comparison
3. Implement attribute comparison
4. Add context comparison

### 5.2 Transition Management
1. Implement TransitionManager
2. Add transition detection
3. Implement state equivalence checking
4. Add transition history tracking

### 5.3 History Management
1. Implement HistoryManager
2. Add compression logic
3. Implement timeline tracking
4. Add checkpoint management

## 6. Testing Strategy

### 6.1 Unit Tests
```typescript
describe('StateComparator', () => {
    let comparator: StateComparator;
    
    beforeEach(() => {
        comparator = new StateComparator();
    });

    test('should identify equivalent states', async () => {
        const state1 = createTestState();
        const state2 = createTestState();
        expect(await comparator.compareStates(state1, state2)).toBe(true);
    });

    test('should detect different states', async () => {
        const state1 = createTestState();
        const state2 = modifyTestState(state1);
        expect(await comparator.compareStates(state1, state2)).toBe(false);
    });
});

describe('TransitionManager', () => {
    let manager: TransitionManager;
    
    beforeEach(() => {
        manager = new TransitionManager();
    });

    test('should handle state transitions', async () => {
        const event = new Event('click');
        await manager.handleTransition(event);
        expect(manager.getCurrentState()).toBeDefined();
    });
});
```

## 7. Success Criteria

1. State Comparison
   - Accurate equivalence detection
   - Efficient comparison algorithm
   - Handles all state components

2. Transition Management
   - Correct transition tracking
   - Proper state updates
   - Event correlation

3. History Management
   - Efficient storage
   - Fast retrieval
   - Proper compression

## 8. Dependencies

1. Backend
   - FSM core implementation
   - Event tracking system
   - State storage system

2. Frontend
   - React components
   - Visualization libraries
   - State management

## 9. Timeline

1. State Comparison: 3 days
2. Transition Management: 2 days
3. History Management: 2 days
4. Integration and Testing: 1 day

Total: 8 working days

## 10. Risks and Mitigations

1. Risk: Performance of state comparison
   - Mitigation: Optimize comparison algorithms
   - Mitigation: Implement caching

2. Risk: Memory usage of history
   - Mitigation: Implement efficient compression
   - Mitigation: Add cleanup strategies

3. Risk: Complex state transitions
   - Mitigation: Robust error handling
   - Mitigation: Comprehensive logging
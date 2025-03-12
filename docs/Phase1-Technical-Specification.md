# Phase 1: Core FSM Implementation - Technical Specification

## Overview
Phase 1 implements the foundational FSM(DOMs) structure by introducing state management, DOM capture, and basic transition handling.

## 1. Core Data Structures

### 1.1 FSM State Interface
```typescript
interface FSMState {
    id: string;                    // Unique state identifier
    timestamp: string;             // State capture timestamp
    url: string;                   // URL associated with this state
    metadata: StateMetadata;       // State metadata components
    hash: string;                  // State hash for comparison
}
```

### 1.2 State Metadata Interface
```typescript
interface StateMetadata {
    domTree: DOMTreeNode;         // DOM tree structure (T)
    staticAttributes: {            // Static attributes (A_static)
        [elementId: string]: {
            [attribute: string]: string;
        }
    };
    transientAttributes: {         // Transient attributes (A_transient)
        [elementId: string]: {
            [attribute: string]: string;
        }
    };
    eventListeners: EventInfo[];   // Event listeners (E)
    securityContext: {            // Security context (C)
        userId: string | null;
        sessionId: string | null;
        roles: string[];
    };
    performanceMetrics: {         // Performance metrics (P)
        loadTime: number;
        renderTime: number;
        timestamp: number;
    };
}
```

### 1.3 DOM Tree Node Interface
```typescript
interface DOMTreeNode {
    tagName: string;
    id?: string;
    className?: string;
    attributes: {
        [key: string]: string;
    };
    children: DOMTreeNode[];
    xpath: string;                // XPath for element location
    contentDescription?: string;  // Text content if relevant
}
```

## 2. FSM Manager Implementation

### 2.1 FSM Manager Class
```typescript
class FSMDOMsManager {
    private states: Map<string, FSMState>;
    private currentStateId: string | null;
    private stateHistory: string[];  // Ordered list of state IDs
    
    constructor() {
        this.states = new Map();
        this.currentStateId = null;
        this.stateHistory = [];
    }

    async captureState(): Promise<FSMState> {
        const newState = await this.createStateSnapshot();
        const stateId = this.computeStateId(newState);
        
        // Check if equivalent state exists
        const existingStateId = this.findEquivalentState(newState);
        if (existingStateId) {
            return this.states.get(existingStateId)!;
        }
        
        // Store new state
        this.states.set(stateId, newState);
        this.currentStateId = stateId;
        this.stateHistory.push(stateId);
        
        return newState;
    }

    private computeStateId(state: FSMState): string {
        // Create deterministic hash of state metadata
        const relevantData = {
            domTree: state.metadata.domTree,
            staticAttributes: state.metadata.staticAttributes,
            eventListeners: state.metadata.eventListeners,
            securityContext: state.metadata.securityContext
        };
        return createHash('sha256')
            .update(JSON.stringify(relevantData))
            .digest('hex');
    }

    private findEquivalentState(newState: FSMState): string | null {
        // Implement state equivalence checking based on formal model
        // DOMi ≡ DOMj iff: Ti = Tj ∧ Ai_static = Aj_static ∧ Ei = Ej ∧ Ci = Cj ∧ Pi = Pj
        return null; // Implement equivalence check
    }
}
```

## 3. Integration with BrowserService

### 3.1 Enhanced BrowserService
```typescript
class BrowserService {
    private fsmManager: FSMDOMsManager;
    
    constructor() {
        super();
        this.fsmManager = new FSMDOMsManager();
    }

    async captureDom(): Promise<DOMTreeNode> {
        // Existing DOM capture logic enhanced with FSM state tracking
        const domTree = await super.captureDom();
        await this.fsmManager.captureState();
        return domTree;
    }

    async handleInteraction(interaction: Interaction): Promise<void> {
        // Track interaction as potential state transition
        await super.handleInteraction(interaction);
        await this.fsmManager.captureState();
    }
}
```

## 4. Implementation Steps

### 4.1 Create Core Files
1. Create `src/fsm/types.ts` for interfaces
2. Create `src/fsm/FSMDOMsManager.ts` for manager implementation
3. Create `src/fsm/utils/stateComparison.ts` for comparison logic

### 4.2 Modify BrowserService
1. Add FSMDOMsManager integration
2. Enhance DOM capture with metadata collection
3. Add state tracking to interaction handling

### 4.3 Add Basic State Visualization
1. Enhance DOMVisualizer to show state information
2. Add state transition visualization
3. Create basic state history view

## 5. Testing Plan

### 5.1 Unit Tests
```typescript
describe('FSMDOMsManager', () => {
    let manager: FSMDOMsManager;
    
    beforeEach(() => {
        manager = new FSMDOMsManager();
    });

    test('should capture initial state', async () => {
        const state = await manager.captureState();
        expect(state).toBeDefined();
        expect(state.id).toBeDefined();
    });

    test('should detect equivalent states', async () => {
        const state1 = await manager.captureState();
        const state2 = await manager.captureState();
        expect(state1.id).toBe(state2.id);
    });
});
```

### 5.2 Integration Tests
1. Test BrowserService with FSM integration
2. Verify state capture during interactions
3. Test state equivalence detection

## 6. Success Criteria
1. Successful state capture and storage
2. Accurate state equivalence detection
3. Proper integration with existing functionality
4. All tests passing
5. No performance degradation in core features

## 7. Dependencies
1. TypeScript 4.x+
2. Existing BrowserService implementation
3. DOM manipulation utilities
4. Hashing library (e.g., crypto-js)

## 8. Timeline
- Core FSM implementation: 3 days
- BrowserService integration: 2 days
- Testing and refinement: 2 days
- Documentation: 1 day

Total: 8 working days

## 9. Risks and Mitigations
1. Risk: Performance impact of state tracking
   - Mitigation: Implement efficient state comparison
   - Mitigation: Add caching for state computations

2. Risk: Memory usage from state storage
   - Mitigation: Implement state cleanup strategy
   - Mitigation: Use efficient data structures

3. Risk: Integration issues with existing code
   - Mitigation: Comprehensive testing
   - Mitigation: Gradual feature rollout
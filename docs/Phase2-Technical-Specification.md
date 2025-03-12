# Phase 2: Transient Attribute Handling - Technical Specification

## Overview
Phase 2 focuses on implementing the transient attribute handling system, which is crucial for preventing state explosion from form inputs and other temporary DOM changes.

## 1. Core Data Structures

### 1.1 Transient Rule Interface
```typescript
interface TransientRule {
    selector: string;                 // CSS/XPath selector
    attributes: string[];             // Attributes to treat as transient
    commitEvents: string[];           // Events that promote to static
    timeout?: number;                 // Optional auto-commit timeout
    validationRules?: ValidationRule[]; // Optional input validation
}

interface ValidationRule {
    type: 'regex' | 'function' | 'length';
    value: string | Function | number;
    errorMessage?: string;
}
```

### 1.2 Transient Change Interface
```typescript
interface TransientChange {
    elementId: string;
    attribute: string;
    value: any;
    timestamp: number;
    lastModified: number;
    validationState?: {
        isValid: boolean;
        errors: string[];
    };
}
```

## 2. TransientManager Implementation

### 2.1 Transient Manager Class
```typescript
class TransientManager {
    private rules: Map<string, TransientRule>;
    private changes: Map<string, TransientChange>;
    private commitCallbacks: Set<(changes: TransientChange[]) => void>;

    constructor() {
        this.rules = new Map();
        this.changes = new Map();
        this.commitCallbacks = new Set();
    }

    addRule(rule: TransientRule): void {
        const ruleId = `${rule.selector}-${rule.attributes.join(',')}`;
        this.rules.set(ruleId, rule);
        this.setupCommitEventListeners(rule);
    }

    handleChange(element: Element, attribute: string, value: any): void {
        const rule = this.findMatchingRule(element, attribute);
        if (!rule) return;

        const changeId = this.getChangeId(element, attribute);
        const change: TransientChange = {
            elementId: element.id || this.generateElementId(element),
            attribute,
            value,
            timestamp: Date.now(),
            lastModified: Date.now()
        };

        if (rule.validationRules) {
            change.validationState = this.validateChange(change, rule.validationRules);
        }

        this.changes.set(changeId, change);
        
        if (rule.timeout) {
            this.setupAutoCommit(changeId, rule.timeout);
        }
    }

    private setupCommitEventListeners(rule: TransientRule): void {
        const elements = document.querySelectorAll(rule.selector);
        elements.forEach(element => {
            rule.commitEvents.forEach(eventName => {
                element.addEventListener(eventName, () => this.handleCommit(element));
            });
        });
    }

    private handleCommit(element: Element): void {
        const changes = Array.from(this.changes.values())
            .filter(change => change.elementId === element.id);
        
        this.commitCallbacks.forEach(callback => callback(changes));
        changes.forEach(change => {
            const changeId = this.getChangeId(element, change.attribute);
            this.changes.delete(changeId);
        });
    }
}
```

## 3. Integration with FSMDOMsManager

### 3.1 Enhanced FSM State Interface
```typescript
interface FSMState {
    // ... existing properties
    transientChanges: TransientChange[];
    lastCommitTimestamp: number;
}

class FSMDOMsManager {
    private transientManager: TransientManager;

    constructor() {
        // ... existing initialization
        this.transientManager = new TransientManager();
        this.setupTransientRules();
    }

    private setupTransientRules(): void {
        // Form input fields
        this.transientManager.addRule({
            selector: 'input[type="text"], input[type="password"], textarea',
            attributes: ['value'],
            commitEvents: ['blur', 'change', 'submit'],
            timeout: 3000 // Auto-commit after 3 seconds of inactivity
        });

        // Select elements
        this.transientManager.addRule({
            selector: 'select',
            attributes: ['value', 'selectedIndex'],
            commitEvents: ['change']
        });

        // Checkboxes and radios
        this.transientManager.addRule({
            selector: 'input[type="checkbox"], input[type="radio"]',
            attributes: ['checked'],
            commitEvents: ['change']
        });
    }
}
```

## 4. Frontend Integration

### 4.1 Enhanced DOM Visualizer
```typescript
interface DOMVisualizerProps {
    showTransientChanges: boolean;
    highlightTransient: boolean;
}

class DOMVisualizer extends React.Component<DOMVisualizerProps> {
    private renderNode(node: DOMTreeNode): React.ReactNode {
        const hasTransientChanges = this.checkTransientChanges(node);
        
        return (
            <div className={`node ${hasTransientChanges ? 'transient' : ''}`}>
                {this.props.showTransientChanges && hasTransientChanges && (
                    <TransientIndicator changes={this.getTransientChanges(node)} />
                )}
                {/* Existing node rendering logic */}
            </div>
        );
    }
}
```

## 5. Implementation Steps

### 5.1 Backend Implementation
1. Create TransientManager class
2. Implement rule matching and change tracking
3. Add commit event handling
4. Integrate with FSMDOMsManager

### 5.2 Frontend Implementation
1. Add transient change visualization
2. Implement commit event handling
3. Add transient state indicators
4. Update state transition visualization

### 5.3 Extension Integration
1. Add transient change tracking
2. Implement commit event forwarding
3. Update DOM capture logic

## 6. Testing Strategy

### 6.1 Unit Tests
```typescript
describe('TransientManager', () => {
    let manager: TransientManager;
    
    beforeEach(() => {
        manager = new TransientManager();
    });

    test('should track transient changes', () => {
        const input = document.createElement('input');
        manager.handleChange(input, 'value', 'test');
        expect(manager.hasTransientChanges(input)).toBe(true);
    });

    test('should commit changes on event', () => {
        const input = document.createElement('input');
        manager.handleChange(input, 'value', 'test');
        input.dispatchEvent(new Event('blur'));
        expect(manager.hasTransientChanges(input)).toBe(false);
    });
});
```

### 6.2 Integration Tests
1. Test form handling scenarios
2. Verify state transition behavior
3. Test auto-commit functionality
4. Validate visualization updates

## 7. Success Criteria

1. State Explosion Prevention
   - Verify input changes don't create unnecessary states
   - Confirm state transitions occur only on commit

2. Form Handling
   - Test complex form interactions
   - Verify data consistency after commits

3. Performance
   - Monitor memory usage
   - Track state transition latency

## 8. Dependencies

1. Backend
   - DOM mutation observer
   - Event handling system
   - State management system

2. Frontend
   - React state management
   - DOM visualization components
   - Event handling system

## 9. Timeline

1. Core Implementation: 3 days
2. Integration: 2 days
3. Testing: 2 days
4. Documentation: 1 day

Total: 8 working days

## 10. Risks and Mitigations

1. Risk: Complex form handling edge cases
   - Mitigation: Comprehensive test suite
   - Mitigation: Fallback mechanisms

2. Risk: Performance impact of change tracking
   - Mitigation: Efficient change storage
   - Mitigation: Cleanup of committed changes

3. Risk: Race conditions in commit handling
   - Mitigation: Proper event ordering
   - Mitigation: Transaction-like commits
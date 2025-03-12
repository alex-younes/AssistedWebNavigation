# Phase 3: Event and Context Integration - Technical Specification

## Overview
Phase 3 implements the event listener tracking, security context integration, and performance metrics collection components of the FSM(DOMs) model. This phase ensures comprehensive state tracking beyond just DOM structure.

## 1. Core Data Structures

### 1.1 Event Tracking Interfaces
```typescript
interface EventInfo {
    type: string;                 // Event type (e.g., 'click', 'submit')
    target: string;              // XPath or selector of target element
    handler: string;             // Stringified handler for tracking
    options: AddEventListenerOptions;
    timestamp: number;
    isActive: boolean;
}

interface EventHistoryEntry {
    eventId: string;
    type: string;
    timestamp: number;
    target: string;
    state: string;              // State ID when event occurred
}
```

### 1.2 Security Context Interface
```typescript
interface SecurityContext {
    user: {
        id: string | null;
        roles: string[];
        permissions: string[];
    };
    session: {
        id: string;
        startTime: number;
        lastActive: number;
        isAuthenticated: boolean;
    };
    environment: {
        userAgent: string;
        platform: string;
        timestamp: number;
    };
}
```

### 1.3 Performance Metrics Interface
```typescript
interface PerformanceMetrics {
    timing: {
        navigationStart: number;
        loadTime: number;
        domContentLoaded: number;
        firstPaint: number;
        firstContentfulPaint: number;
    };
    memory: {
        jsHeapSize: number;
        domNodes: number;
    };
    resources: {
        requests: number;
        failures: number;
        totalSize: number;
    };
    interactions: {
        timeToFirstInteraction: number;
        averageResponseTime: number;
    };
}
```

## 2. Event Tracking Implementation

### 2.1 EventTracker Class
```typescript
class EventTracker {
    private events: Map<string, EventInfo>;
    private history: EventHistoryEntry[];
    
    constructor() {
        this.events = new Map();
        this.history = [];
        this.setupGlobalListeners();
    }

    trackEvent(element: Element, eventType: string, handler: EventListener): void {
        const eventId = this.generateEventId(element, eventType);
        const eventInfo: EventInfo = {
            type: eventType,
            target: this.getElementPath(element),
            handler: handler.toString(),
            options: {},
            timestamp: Date.now(),
            isActive: true
        };
        
        this.events.set(eventId, eventInfo);
        this.wrapEventHandler(element, eventType, handler);
    }

    private wrapEventHandler(
        element: Element,
        eventType: string,
        handler: EventListener
    ): void {
        const wrappedHandler = (event: Event) => {
            const entry: EventHistoryEntry = {
                eventId: this.generateEventId(element, eventType),
                type: eventType,
                timestamp: Date.now(),
                target: this.getElementPath(element),
                state: this.getCurrentStateId()
            };
            
            this.history.push(entry);
            handler(event);
        };
        
        element.addEventListener(eventType, wrappedHandler);
    }
}
```

### 2.2 SecurityContextManager Class
```typescript
class SecurityContextManager {
    private context: SecurityContext;
    private observers: Set<(context: SecurityContext) => void>;

    constructor() {
        this.context = this.initializeContext();
        this.observers = new Set();
        this.setupContextMonitoring();
    }

    private initializeContext(): SecurityContext {
        return {
            user: {
                id: null,
                roles: [],
                permissions: []
            },
            session: {
                id: crypto.randomUUID(),
                startTime: Date.now(),
                lastActive: Date.now(),
                isAuthenticated: false
            },
            environment: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                timestamp: Date.now()
            }
        };
    }

    updateContext(updates: Partial<SecurityContext>): void {
        this.context = {...this.context, ...updates};
        this.notifyObservers();
    }

    private notifyObservers(): void {
        this.observers.forEach(observer => observer(this.context));
    }
}
```

### 2.3 PerformanceMonitor Class
```typescript
class PerformanceMonitor {
    private metrics: PerformanceMetrics;
    private observer: PerformanceObserver;

    constructor() {
        this.metrics = this.initializeMetrics();
        this.setupObservers();
    }

    private setupObservers(): void {
        this.observer = new PerformanceObserver(this.handlePerformanceEntries);
        this.observer.observe({
            entryTypes: ['navigation', 'resource', 'paint', 'largest-contentful-paint']
        });
    }

    private handlePerformanceEntries(entries: PerformanceObserverEntryList): void {
        entries.getEntries().forEach(entry => {
            switch (entry.entryType) {
                case 'navigation':
                    this.updateNavigationMetrics(entry as PerformanceNavigationTiming);
                    break;
                case 'paint':
                    this.updatePaintMetrics(entry as PerformancePaintTiming);
                    break;
                // Handle other entry types
            }
        });
    }

    getMetrics(): PerformanceMetrics {
        return {
            ...this.metrics,
            memory: this.getMemoryMetrics(),
            interactions: this.getInteractionMetrics()
        };
    }
}
```

## 3. Integration with FSM Manager

### 3.1 Enhanced FSM State
```typescript
interface EnhancedFSMState extends FSMState {
    events: EventInfo[];
    securityContext: SecurityContext;
    performanceMetrics: PerformanceMetrics;
}

class FSMDOMsManager {
    private eventTracker: EventTracker;
    private securityManager: SecurityContextManager;
    private performanceMonitor: PerformanceMonitor;

    constructor() {
        this.eventTracker = new EventTracker();
        this.securityManager = new SecurityContextManager();
        this.performanceMonitor = new PerformanceMonitor();
    }

    async captureState(): Promise<EnhancedFSMState> {
        const baseState = await super.captureState();
        return {
            ...baseState,
            events: Array.from(this.eventTracker.getEvents().values()),
            securityContext: this.securityManager.getContext(),
            performanceMetrics: this.performanceMonitor.getMetrics()
        };
    }
}
```

## 4. Frontend Integration

### 4.1 Context Visualization Components
```typescript
interface MetricsVisualizerProps {
    metrics: PerformanceMetrics;
    showHistory: boolean;
}

const MetricsVisualizer: React.FC<MetricsVisualizerProps> = ({ metrics, showHistory }) => {
    return (
        <Card>
            <CardContent>
                <Typography variant="h6">Performance Metrics</Typography>
                <Grid container spacing={2}>
                    <Grid item xs={6}>
                        <Paper>
                            <Typography>Load Time: {metrics.timing.loadTime}ms</Typography>
                            <Typography>FCP: {metrics.timing.firstContentfulPaint}ms</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={6}>
                        <Paper>
                            <Typography>DOM Nodes: {metrics.memory.domNodes}</Typography>
                            <Typography>JS Heap: {metrics.memory.jsHeapSize}MB</Typography>
                        </Paper>
                    </Grid>
                </Grid>
            </CardContent>
        </Card>
    );
};
```

## 5. Implementation Steps

### 5.1 Event Tracking
1. Implement EventTracker class
2. Set up global event listeners
3. Integrate with FSM state capture

### 5.2 Security Context
1. Implement SecurityContextManager
2. Add authentication integration
3. Set up session monitoring

### 5.3 Performance Monitoring
1. Implement PerformanceMonitor
2. Set up metrics collection
3. Add visualization components

## 6. Testing Strategy

### 6.1 Unit Tests
```typescript
describe('EventTracker', () => {
    let tracker: EventTracker;
    
    beforeEach(() => {
        tracker = new EventTracker();
    });

    test('should track new event listeners', () => {
        const element = document.createElement('button');
        const handler = () => {};
        tracker.trackEvent(element, 'click', handler);
        expect(tracker.getEvents().size).toBe(1);
    });
});

describe('SecurityContextManager', () => {
    let manager: SecurityContextManager;
    
    beforeEach(() => {
        manager = new SecurityContextManager();
    });

    test('should update security context', () => {
        manager.updateContext({
            user: { id: 'test', roles: ['admin'] }
        });
        const context = manager.getContext();
        expect(context.user.id).toBe('test');
    });
});
```

## 7. Success Criteria

1. Event Tracking
   - All event listeners properly tracked
   - Event history maintained
   - No memory leaks from wrapped handlers

2. Security Context
   - Authentication state tracked
   - Session management working
   - Role-based state variations captured

3. Performance Metrics
   - Accurate metrics collection
   - Minimal overhead
   - Useful visualizations

## 8. Dependencies

1. Backend
   - Performance API
   - Event handling system
   - Authentication system

2. Frontend
   - React components
   - Visualization libraries
   - Context API

## 9. Timeline

1. Event Tracking: 3 days
2. Security Context: 2 days
3. Performance Monitoring: 2 days
4. Integration and Testing: 1 day

Total: 8 working days

## 10. Risks and Mitigations

1. Risk: Event handler memory leaks
   - Mitigation: Proper cleanup in EventTracker
   - Mitigation: Regular memory monitoring

2. Risk: Performance impact of tracking
   - Mitigation: Efficient data structures
   - Mitigation: Sampling for high-frequency events

3. Risk: Security context synchronization
   - Mitigation: Atomic updates
   - Mitigation: Version tracking for contexts
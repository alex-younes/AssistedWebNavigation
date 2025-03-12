# Phase 1: FSM(DOMs) Pre-Implementation Setup Guide

## Directory Structure Setup

### Backend Structure
```
backend/
├── fsm/                          # New FSM core functionality
│   ├── types/
│   │   ├── FSMState.ts
│   │   ├── StateMetadata.ts
│   │   └── index.ts
│   ├── managers/
│   │   ├── FSMDOMsManager.ts
│   │   └── TransientManager.ts
│   ├── utils/
│   │   ├── stateComparison.ts
│   │   └── hashGenerator.ts
│   └── index.ts
├── services/
│   └── FSMService.ts            # New service for FSM operations
└── routes/
    └── fsmRoutes.js            # New routes for FSM endpoints
```

### Frontend Structure
```
frontend/src/
├── fsm/                         # New FSM frontend functionality
│   ├── types/
│   │   ├── FSMState.ts
│   │   └── index.ts
│   ├── hooks/
│   │   └── useFSMState.ts
│   └── context/
│       └── FSMContext.tsx
├── services/
│   └── fsmApi.js               # New API service for FSM
└── components/
    └── FSMVisualizer/          # New FSM visualization component
        ├── index.js
        ├── StateNode.js
        └── TransitionEdge.js
```

## Pre-Implementation Checklist

### 1. Backend Dependencies
Add to package.json:
```json
{
  "dependencies": {
    "crypto-js": "^4.x.x",      // For state hashing
    "typescript": "^4.x.x",     // For TypeScript support
    "@types/node": "^16.x.x"    // TypeScript Node types
  }
}
```

### 2. Frontend Dependencies
Add to frontend/package.json:
```json
{
  "dependencies": {
    "@types/react": "^17.x.x",
    "@types/react-dom": "^17.x.x",
    "dagre-d3": "^0.6.4",       // For FSM visualization
    "react-flow-renderer": "^9.x.x"  // For state transition visualization
  }
}
```

### 3. TypeScript Configuration
Create backend/tsconfig.json:
```json
{
  "compilerOptions": {
    "target": "es2018",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./",
    "baseUrl": "./",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "**/*"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
```

### 4. Initial Files to Create

#### Backend Core Files
1. FSM Types (backend/fsm/types/FSMState.ts):
```typescript
export interface FSMState {
    id: string;
    timestamp: string;
    metadata: StateMetadata;
}

export interface StateMetadata {
    domTree: DOMTreeNode;
    staticAttributes: Record<string, any>;
    transientAttributes: Record<string, any>;
    eventListeners: EventInfo[];
    securityContext: SecurityContext;
    performanceMetrics: PerformanceMetrics;
}
```

2. FSM Manager (backend/fsm/managers/FSMDOMsManager.ts):
```typescript
import { FSMState, StateMetadata } from '../types';

export class FSMDOMsManager {
    private states: Map<string, FSMState>;
    private currentStateId: string | null;

    constructor() {
        this.states = new Map();
        this.currentStateId = null;
    }

    // Implementation will follow in next step
}
```

#### Frontend Core Files
1. FSM Context (frontend/src/fsm/context/FSMContext.tsx):
```typescript
import React, { createContext, useContext, useState } from 'react';
import { FSMState } from '../types';

interface FSMContextType {
    currentState: FSMState | null;
    stateHistory: FSMState[];
    updateState: (state: FSMState) => void;
}

export const FSMContext = createContext<FSMContextType | undefined>(undefined);

export const FSMProvider: React.FC = ({ children }) => {
    const [currentState, setCurrentState] = useState<FSMState | null>(null);
    const [stateHistory, setStateHistory] = useState<FSMState[]>([]);

    // Implementation will follow in next step
};
```

## Implementation Order

1. Backend Core Structure
   - Create directory structure
   - Set up TypeScript configuration
   - Create initial type definitions
   - Implement basic FSM manager

2. Frontend Core Structure
   - Create directory structure
   - Set up TypeScript configuration
   - Create context and hooks
   - Set up basic visualization component

3. Integration Points
   - Modify BrowserService to use FSM manager
   - Update DOMVisualizer to show FSM states
   - Add FSM controls to InteractionRecorder

## Next Steps

1. Create the directory structure
2. Install dependencies
3. Create initial TypeScript configuration
4. Create the base files
5. Begin implementing the FSM manager

Would you like to proceed with creating these directories and files?
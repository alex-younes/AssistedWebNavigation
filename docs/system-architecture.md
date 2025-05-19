# Complete System Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Data Flow Architecture](#data-flow-architecture)
4. [AI Analysis Pipeline](#ai-analysis-pipeline)
5. [State Management](#state-management)
6. [Technical Stack](#technical-stack)
7. [Security Architecture](#security-architecture)
8. [Performance Considerations](#performance-considerations)
9. [Integration Points](#integration-points)

## System Overview

This system is a comprehensive web application for tracking, recording, and analyzing DOM state changes and user interactions. It consists of four main components:

```mermaid
graph TB
    subgraph "User Browser"
        CE[Chrome Extension]
        W[Web Application]
    end
    
    subgraph "Backend Services"
        BE[Backend Server]
        AI[AI Analysis Server]
        DB[(MongoDB)]
    end
    
    CE -->|DOM Events| BE
    W -->|Visualization Requests| BE
    BE -->|Session Data| W
    BE -->|Store Data| DB
    BE -->|Analysis Requests| AI
    AI -->|Analysis Results| BE
    DB -->|Query Results| BE
```

### Key Components
1. **Chrome Extension**: Captures DOM states and user interactions
2. **Frontend Client**: React/TypeScript visualization interface
3. **Backend Server**: Node.js/Express API server
4. **AI Analysis Server**: Specialized server for behavioral analysis

## Component Architecture

### 1. Chrome Extension Architecture

```mermaid
graph TB
    subgraph "Chrome Extension"
        BG[Background Script]
        CS[Content Script]
        PI[Popup Interface]
        
        CS -->|DOM Events| BG
        PI -->|Controls| BG
        BG -->|Status| PI
    end
    
    subgraph "State Management"
        SM[Session Manager]
        SQ[State Queue]
        
        BG -->|States| SM
        SM -->|Queue| SQ
    end
```

Key Features:
- Background Script: Session and state management
- Content Script: Real-time DOM monitoring
- Popup Interface: User controls
- State Queue: Efficient state processing

### 2. Frontend Client Architecture

```mermaid
graph TB
    subgraph "React Components"
        L[Layout]
        G[Graph]
        S[Session]
        LF[LiveFeed]
    end
    
    subgraph "Services"
        AS[API Service]
        AdS[Admin Service]
    end
    
    subgraph "Contexts"
        AC[Auth Context]
        SC[Socket Context]
    end
    
    L --> G
    L --> S
    L --> LF
    G --> AS
    S --> AS
    LF --> SC
    AS --> AC
```

Key Features:
- React/TypeScript implementation
- Component-based architecture
- Context-based state management
- Service abstraction layer

### 3. Backend Server Architecture

```mermaid
graph TB
    subgraph "API Routes"
        BR[Browser Routes]
        RR[Recorder Routes]
        AR[Admin Routes]
        ER[Extension Routes]
    end
    
    subgraph "Models"
        DS[DOM State]
        UA[User Activity]
        NE[Non-Transitional Events]
        U[User]
    end
    
    subgraph "Services"
        SM[Service Manager]
        DB[(MongoDB)]
    end
    
    BR --> SM
    RR --> SM
    AR --> SM
    ER --> SM
    SM --> DS
    SM --> UA
    SM --> NE
    SM --> U
    DS --> DB
    UA --> DB
    NE --> DB
    U --> DB
```

### 4. AI Analysis Server Architecture

```mermaid
graph TB
    subgraph "Analysis Pipeline"
        S1[Stage 1: Detailed Event Processing]
        S2[Stage 2: Non-Transitional Event Processing]
        AO[Analysis Orchestrator]
    end
    
    subgraph "AI Models"
        GM[Gemini Model]
        GQ[Groq Model]
    end
    
    subgraph "Analysis Components"
        EP[Event Processor]
        TP[Transition Processor]
        BP[Behavior Processor]
    end
    
    AO --> S1
    AO --> S2
    S1 --> EP
    S2 --> TP
    EP --> GM
    TP --> GM
    EP --> GQ
    TP --> GQ
    GM --> BP
    GQ --> BP
```

## Data Flow Architecture

```mermaid
sequenceDiagram
    participant CE as Chrome Extension
    participant BE as Backend Server
    participant AI as AI Analysis Server
    participant DB as MongoDB
    participant FC as Frontend Client
    
    CE->>BE: Send DOM state changes
    BE->>DB: Store state data
    BE->>AI: Request analysis
    AI->>BE: Return behavior analysis
    BE->>DB: Store analysis results
    FC->>BE: Request visualization data
    BE->>FC: Send processed data
    FC->>FC: Render visualizations
```

## AI Analysis Pipeline

The AI analysis system processes user sessions through multiple stages:

1. **Stage 1: Detailed Event Processing**
   - Event sequence analysis
   - State transition mapping
   - User interaction patterns
   - Form interaction analysis

2. **Stage 2: Non-Transitional Event Processing**
   - Loading state analysis
   - Network performance correlation
   - DOM fingerprint analysis
   - Form behavior patterns

Key Features:
- Multi-model support (Gemini/Groq)
- Comprehensive session analysis
- Behavior pattern detection
- Performance impact analysis

## State Management

### DOM State Processing

```mermaid
stateDiagram-v2
    [*] --> Capturing
    Capturing --> Processing: DOM Change
    Processing --> Analyzing: State Processed
    Analyzing --> Storing: Analysis Complete
    Storing --> [*]
```

### Session Management

```mermaid
stateDiagram-v2
    [*] --> Initialized
    Initialized --> Recording: Start Session
    Recording --> Paused: Pause
    Paused --> Recording: Resume
    Recording --> Completed: Stop
    Completed --> [*]
```

## Technical Stack

### Frontend
- React 18+
- TypeScript
- Vite
- Socket.IO Client

### Backend
- Node.js
- Express
- MongoDB
- Socket.IO

### AI Analysis
- Gemini AI
- Groq
- Custom Analysis Pipeline

### Extension
- Chrome Extensions API
- JavaScript
- DOM Mutation Observer

## Security Architecture

1. **Authentication**
   - JWT-based auth
   - Protected routes
   - Role-based access

2. **Data Protection**
   - CORS configuration
   - Request validation
   - Sanitized inputs

3. **API Security**
   - Rate limiting
   - API key management
   - Request validation

## Performance Considerations

1. **State Processing**
   - Efficient state diffing
   - Duplicate state detection
   - Batch processing

2. **Data Storage**
   - Optimized schemas
   - Indexed queries
   - Efficient data structures

3. **Analysis Pipeline**
   - Parallel processing
   - Caching mechanisms
   - Resource management

## Integration Points

1. **Extension Integration**
   - Chrome Web Store deployment
   - Browser compatibility
   - Update management

2. **API Integration**
   - RESTful endpoints
   - WebSocket connections
   - Event streams

3. **AI Service Integration**
   - Model API integration
   - Analysis pipeline hooks
   - Result processing

This architecture documentation provides a comprehensive overview of the system's components, their interactions, and key technical considerations. The system is designed to be scalable, maintainable, and efficient in processing and analyzing user interaction data.
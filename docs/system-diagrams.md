# System Architecture Diagrams

## 1. Complete System Overview

```mermaid
graph TB
    classDef frontend fill:#e1f5fe,stroke:#01579b
    classDef backend fill:#e8f5e9,stroke:#1b5e20
    classDef database fill:#fce4ec,stroke:#880e4f
    classDef ai fill:#fff3e0,stroke:#e65100

    %% Frontend Components
    subgraph Browser["User Browser Environment"]
        direction TB
        CE["Chrome Extension"]:::frontend
        UI["Frontend UI"]:::frontend
        
        subgraph Extension["Extension Components"]
            BS["Background Script"]
            CS["Content Script"]
            Pop["Popup UI"]
        end
        
        subgraph React["React Application"]
            VC["View Components"]
            RC["Route Components"]
            SC["Service Components"]
        end
    end

    %% Backend Components
    subgraph Server["Server Environment"]
        direction TB
        API["API Server"]:::backend
        AIS["AI Analysis Server"]:::ai
        
        subgraph Services["Backend Services"]
            Auth["Authentication"]
            SM["Session Manager"]
            EM["Event Manager"]
        end
        
        subgraph AI["AI Pipeline"]
            S1["Stage 1: Event Processing"]
            S2["Stage 2: Pattern Analysis"]
            S3["Stage 3: Behavior Analysis"]
        end
    end

    %% Database Layer
    subgraph Data["Data Layer"]
        DB[("MongoDB")]:::database
        Cache["Redis Cache"]:::database
    end

    %% Connections
    CS --> BS
    BS --> Pop
    CE --> API
    UI --> API
    API --> Auth
    Auth --> SM
    SM --> EM
    EM --> DB
    API --> AIS
    AIS --> S1
    S1 --> S2
    S2 --> S3
    S3 --> DB
    DB --> Cache
```

## 2. Data Flow Pipeline

```mermaid
flowchart TB
    classDef input fill:#e3f2fd,stroke:#1565c0
    classDef process fill:#f1f8e9,stroke:#33691e
    classDef output fill:#fce4ec,stroke:#880e4f
    classDef storage fill:#fff3e0,stroke:#e65100

    %% Input Sources
    U["User Interaction"]:::input
    D["DOM Changes"]:::input
    F["Form Events"]:::input

    %% Processing Steps
    E["Event Capture"]:::process
    P["Processing Pipeline"]:::process
    A["Analysis Engine"]:::process

    %% Storage Steps
    S["Session Storage"]:::storage
    C["Cache Layer"]:::storage
    DB["Database"]:::storage

    %% Output Generation
    V["Visualization"]:::output
    R["Reports"]:::output
    M["Metrics"]:::output

    %% Flow Definition
    U --> E
    D --> E
    F --> E
    E --> P
    P --> A
    A --> S
    S --> C
    C --> DB
    DB --> V
    DB --> R
    DB --> M
```

## 3. Extension Architecture Detail

```mermaid
flowchart TB
    classDef monitor fill:#bbdefb,stroke:#0d47a1
    classDef process fill:#c8e6c9,stroke:#1b5e20
    classDef storage fill:#f8bbd0,stroke:#880e4f
    classDef output fill:#ffe0b2,stroke:#e65100

    %% Monitoring Components
    subgraph Monitor["DOM Monitoring"]
        direction LR
        MO["Mutation Observer"]:::monitor
        EL["Event Listeners"]:::monitor
        ST["State Tracker"]:::monitor
    end

    %% Processing Components
    subgraph Process["State Processing"]
        direction LR
        DP["DOM Processor"]:::process
        SP["State Processor"]:::process
        EP["Event Processor"]:::process
    end

    %% Storage Components
    subgraph Storage["Local Storage"]
        direction LR
        SQ["State Queue"]:::storage
        SC["State Cache"]:::storage
        LC["Local Cache"]:::storage
    end

    %% Output Components
    subgraph Output["Data Output"]
        direction LR
        API["API Client"]:::output
        SYNC["State Sync"]:::output
        LOG["Logger"]:::output
    end

    %% Connections
    MO --> DP
    EL --> EP
    ST --> SP
    DP --> SQ
    EP --> SQ
    SP --> SC
    SQ --> SYNC
    SC --> API
    LC --> LOG
```

## 4. AI Analysis Pipeline Detail

```mermaid
flowchart TB
    classDef input fill:#e8eaf6,stroke:#1a237e
    classDef process fill:#e0f2f1,stroke:#004d40
    classDef model fill:#fff3e0,stroke:#e65100
    classDef output fill:#fce4ec,stroke:#880e4f

    %% Input Layer
    subgraph Input["Data Input"]
        direction LR
        RD["Raw Data"]:::input
        SD["Session Data"]:::input
        ED["Event Data"]:::input
    end

    %% Processing Layer
    subgraph Process["Processing Layer"]
        direction LR
        PP["Data Preprocessing"]:::process
        FE["Feature Extraction"]:::process
        NP["Pattern Normalization"]:::process
    end

    %% Model Layer
    subgraph Models["AI Models"]
        direction LR
        GM["Gemini Model"]:::model
        GR["Groq Model"]:::model
    end

    %% Analysis Layer
    subgraph Analysis["Analysis Stages"]
        direction LR
        S1["Stage 1: Event Analysis"]:::process
        S2["Stage 2: Pattern Detection"]:::process
        S3["Stage 3: Behavior Analysis"]:::process
    end

    %% Output Layer
    subgraph Output["Analysis Output"]
        direction LR
        BR["Behavior Report"]:::output
        PR["Pattern Report"]:::output
        MR["Metrics Report"]:::output
    end

    %% Connections
    RD --> PP
    SD --> PP
    ED --> PP
    PP --> FE
    FE --> NP
    NP --> GM
    NP --> GR
    GM --> S1
    GR --> S1
    S1 --> S2
    S2 --> S3
    S3 --> BR
    S3 --> PR
    S3 --> MR
```

## 5. State Management Flow

```mermaid
stateDiagram-v2
    [*] --> Initialized
    
    state "DOM Monitoring" as DM {
        Initialized --> Active
        Active --> Processing: DOM Change
        Processing --> Active: Process Complete
        Active --> Paused: Pause Recording
        Paused --> Active: Resume Recording
    }
    
    state "State Processing" as SP {
        Processing --> Queued: New State
        Queued --> Analyzing: Process Start
        Analyzing --> Validated: Validation
        Validated --> Stored: Storage
        Stored --> Synced: API Sync
    }
    
    state "Error Handling" as EH {
        Processing --> Error: Failed
        Error --> Retry: Attempt Retry
        Retry --> Processing: Retry Success
        Retry --> Failed: Max Retries
    }
    
    Synced --> [*]
    Failed --> [*]
```

## 6. Component Interaction Detail

```mermaid
sequenceDiagram
    participant U as User
    participant E as Extension
    participant B as Backend
    participant AI as AI Server
    participant DB as Database
    
    U->>E: Interact with page
    activate E
    E->>E: Process DOM changes
    E->>B: Send state update
    activate B
    B->>DB: Store state
    activate DB
    DB-->>B: Confirm storage
    deactivate DB
    B->>AI: Request analysis
    activate AI
    AI->>AI: Process state
    AI->>AI: Run analysis
    AI-->>B: Return analysis
    deactivate AI
    B->>DB: Store analysis
    activate DB
    DB-->>B: Confirm storage
    deactivate DB
    B-->>E: Confirm update
    deactivate B
    E-->>U: Update UI
    deactivate E
```

## 7. Database Schema Overview

```mermaid
erDiagram
    USER ||--o{ SESSION : has
    SESSION ||--o{ STATE : contains
    STATE ||--o{ EVENT : includes
    SESSION ||--o{ ANALYSIS : generates
    
    USER {
        string id
        string username
        string email
        datetime created_at
    }
    
    SESSION {
        string id
        string user_id
        datetime start_time
        datetime end_time
        string status
    }
    
    STATE {
        string id
        string session_id
        string url
        json dom_state
        datetime timestamp
    }
    
    EVENT {
        string id
        string state_id
        string type
        json details
        datetime timestamp
    }
    
    ANALYSIS {
        string id
        string session_id
        json results
        datetime created_at
        string model_used
    }
```

## 8. Network Architecture

```mermaid
graph TB
    classDef client fill:#e3f2fd,stroke:#1565c0
    classDef server fill:#f1f8e9,stroke:#33691e
    classDef service fill:#fff3e0,stroke:#e65100
    classDef storage fill:#fce4ec,stroke:#880e4f

    %% Client Layer
    subgraph CL["Client Layer"]
        BE["Browser Extension"]:::client
        WA["Web Application"]:::client
    end

    %% Load Balancer
    LB["Load Balancer"]

    %% Application Servers
    subgraph AS["Application Servers"]
        AS1["App Server 1"]:::server
        AS2["App Server 2"]:::server
        AS3["App Server 3"]:::server
    end

    %% Services Layer
    subgraph SL["Services Layer"]
        AIS["AI Service"]:::service
        CS["Cache Service"]:::service
        MS["Metrics Service"]:::service
    end

    %% Database Layer
    subgraph DL["Database Layer"]
        MDB["MongoDB Primary"]:::storage
        MDB_S1["MongoDB Secondary 1"]:::storage
        MDB_S2["MongoDB Secondary 2"]:::storage
    end

    %% Connections
    BE --> LB
    WA --> LB
    LB --> AS1
    LB --> AS2
    LB --> AS3
    AS1 --> AIS
    AS2 --> AIS
    AS3 --> AIS
    AS1 --> CS
    AS2 --> CS
    AS3 --> CS
    AIS --> MDB
    CS --> MDB
    MDB --> MDB_S1
    MDB --> MDB_S2
```

This comprehensive set of diagrams provides a detailed visual representation of the system's architecture, showing component relationships, data flows, and system interactions at various levels of abstraction.

Each diagram focuses on a specific aspect of the system while maintaining consistency in the representation of components and their relationships. The color coding and clear hierarchical structure help in understanding the system's organization and flow.
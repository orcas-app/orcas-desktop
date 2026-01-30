# Orcas Agent Manager - User Flows

This document provides visual diagrams of the core user flows in the Orcas Agent Manager application.

## Table of Contents
- [Application Architecture](#application-architecture)
- [Task Management Flow](#task-management-flow)
- [AI Task Planning Flow](#ai-task-planning-flow)
- [Agent Chat Interaction Flow](#agent-chat-interaction-flow)
- [Document Edit Lock & Review Flow](#document-edit-lock--review-flow)
- [Agent Management Flow](#agent-management-flow)
- [Provider Configuration Flow](#provider-configuration-flow)

---

## Application Architecture

```mermaid
graph TB
    subgraph "Frontend (React + Vite)"
        UI[User Interface]
        Router[React Router]

        subgraph "Main Views"
            Home[ProjectHome View]
            TaskDetail[TaskDetail View]
            Agents[AgentsManager]
            Settings[Settings]
        end

        subgraph "Key Components"
            PlanCard[PlanCard]
            ChatInterface[ChatInterface]
            AgentSelector[AgentSelector]
            MDXEditor[MDXEditor]
        end
    end

    subgraph "Tauri Backend (Rust)"
        Commands[Tauri Commands]
        DB[(SQLite Database)]
        MCP[MCP Server Process]

        subgraph "Core Modules"
            Chat[chat.rs - AI Integration]
            Planning[planning_agent.rs]
            EditLocks[edit_locks.rs]
            TaskNotes[task_notes.rs]
        end
    end

    subgraph "External Services"
        Claude[Claude API]
        LiteLLM[LiteLLM Gateway]
    end

    UI --> Router
    Router --> Home
    Router --> TaskDetail
    Router --> Agents
    Router --> Settings

    TaskDetail --> PlanCard
    TaskDetail --> ChatInterface
    TaskDetail --> MDXEditor
    ChatInterface --> AgentSelector

    UI --> Commands
    Commands --> DB
    Commands --> Chat
    Commands --> Planning
    Commands --> EditLocks
    Commands --> TaskNotes
    Commands --> MCP

    Chat --> Claude
    Chat --> LiteLLM
    MCP -.->|Tool Calls| TaskNotes

    style UI fill:#e1f5ff
    style Commands fill:#fff4e1
    style DB fill:#f0f0f0
    style Claude fill:#ffe1e1
    style LiteLLM fill:#ffe1e1
```

---

## Task Management Flow

```mermaid
flowchart TD
    Start([User Opens App]) --> Home[View ProjectHome]
    Home --> ViewTasks{Choose Action}

    ViewTasks -->|Create New| NewTask[Click 'New Task' Button]
    ViewTasks -->|View Existing| SelectTask[Click on Task Card]

    NewTask --> EnterTitle[Enter Task Title in Dialog]
    EnterTitle --> CreateDB[Task Created in Database<br/>Status: 'todo']
    CreateDB --> ShowInHome[Task Appears in 'Todo' Section]
    ShowInHome --> SelectTask

    SelectTask --> LoadDetail[Load TaskDetail View]
    LoadDetail --> Display{Display Two-Panel Layout}

    Display --> LeftPanel[Left: Shared Document<br/>MDXEditor]
    Display --> RightPanel[Right: Agent Panel<br/>PlanCard + ChatInterface]

    LeftPanel --> EditDoc{User Action}
    EditDoc -->|Edit| WriteContent[Write/Edit Document Content]
    EditDoc -->|Auto-save| SaveNotes[Save to task_notes Table]

    RightPanel --> AgentAction{User Action}
    AgentAction -->|Plan Task| PlanFlow[Go to AI Planning Flow]
    AgentAction -->|Chat with Agent| ChatFlow[Go to Agent Chat Flow]

    SaveNotes --> UpdateStatus{Update Task Status}
    UpdateStatus -->|Manual| ChangeStatus[User Changes Status<br/>todo → in_progress → for_review → done]
    ChangeStatus --> RefreshHome[Home View Refreshes]
    RefreshHome --> Home

    style Start fill:#e1ffe1
    style LoadDetail fill:#e1f5ff
    style SaveNotes fill:#fff4e1
    style ChangeStatus fill:#ffe1f5
```

---

## AI Task Planning Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as PlanCard Component
    participant Backend as Tauri Backend
    participant Agent as Planning Agent (Claude)
    participant DB as SQLite Database

    User->>UI: Click "Plan Task" Button
    UI->>Backend: start_task_planning(task_id, title, description)
    Backend->>Backend: Spawn Async Planning Task
    Backend-->>UI: Return Immediately

    Backend->>Agent: Send Task Context + System Prompt
    Note over Backend,Agent: System Prompt: "You are a planning agent..."<br/>Task: title + description

    loop Planning Iteration
        Agent->>Agent: Analyze Task
        Agent->>Backend: Use create_subtask Tool
        Backend->>DB: INSERT subtask
        Backend-->>Agent: Tool Result: Success
        Backend->>UI: Emit 'task-planning-progress' Event
        UI->>UI: Update Progress Bar
        UI->>UI: Add Subtask to List
    end

    Agent->>Backend: Planning Complete
    Backend->>UI: Emit 'task-planning-complete' Event
    UI->>UI: Show Success Message
    UI->>UI: Display All Subtasks

    alt User Cancels Planning
        User->>UI: Click "Cancel Planning"
        UI->>Backend: cancel_task_planning(task_id)
        Backend->>Agent: Abort Planning Task
        Backend->>UI: Emit 'task-planning-cancelled' Event
        UI->>UI: Show Cancelled Message
    end

    Note over User,DB: Result: Task has structured subtasks<br/>ready for execution
```

---

## Agent Chat Interaction Flow

```mermaid
flowchart TD
    Start([User in TaskDetail View]) --> SelectAgent[Click Agent from AgentSelector]
    SelectAgent --> LoadAgent[Load Agent Details<br/>name, model, system_role]
    LoadAgent --> InitChat[Initialize ChatInterface]

    InitChat --> ShowHistory{Load Message History}
    ShowHistory -->|From localStorage| DisplayMsgs[Display Previous Messages]
    ShowHistory -->|Empty| ReadyForInput[Ready for New Conversation]

    DisplayMsgs --> ReadyForInput
    ReadyForInput --> UserTypes[User Types Message]
    UserTypes --> SendMsg[User Clicks Send]

    SendMsg --> AddToUI[Add User Message to Chat UI]
    AddToUI --> CheckMCP{MCP Server Running?}

    CheckMCP -->|No| StartMCP[Start MCP Server]
    CheckMCP -->|Yes| PrepareCall[Prepare API Call]
    StartMCP --> PrepareCall

    PrepareCall --> BuildRequest[Build Request:<br/>- messages array<br/>- system prompt from agent<br/>- MCP tools if available]

    BuildRequest --> CallAPI[send_chat_message to Backend]
    CallAPI --> RouteProvider{Active Provider}

    RouteProvider -->|Anthropic| AnthropicAPI[Claude API Direct]
    RouteProvider -->|LiteLLM| LiteLLMAPI[LiteLLM Gateway]

    AnthropicAPI --> StreamResponse[Stream Response Chunks]
    LiteLLMAPI --> StreamResponse

    StreamResponse --> DisplayChunk[Display Chunk in Real-time]
    DisplayChunk --> CheckTool{Tool Use?}

    CheckTool -->|Yes| ExecuteTool[Execute MCP Tool]
    ExecuteTool --> ToolResult{Tool Name}

    ToolResult -->|read_task_notes| ReadNotes[Read from task_notes]
    ToolResult -->|append_task_notes| AppendNotes[Append to task_notes]
    ToolResult -->|replace_task_notes| ReplaceNotes[Acquire Edit Lock<br/>Replace task_notes]

    ReadNotes --> ReturnToAgent[Return Result to Agent]
    AppendNotes --> ReturnToAgent
    ReplaceNotes --> TriggerLock[Trigger Edit Lock Flow]

    TriggerLock --> ReturnToAgent
    ReturnToAgent --> StreamResponse

    CheckTool -->|No| Complete[Message Complete]
    Complete --> SaveLocal[Save to localStorage]
    SaveLocal --> WaitNext[Wait for Next User Message]
    WaitNext --> UserTypes

    style Start fill:#e1ffe1
    style CallAPI fill:#e1f5ff
    style ExecuteTool fill:#fff4e1
    style TriggerLock fill:#ffe1e1
```

---

## Document Edit Lock & Review Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as TaskDetail UI
    participant Editor as MDXEditor
    participant Backend as Tauri Backend
    participant DB as SQLite Database
    participant Agent as AI Agent

    Note over User,DB: Agent Acquires Lock Scenario

    Agent->>Backend: acquire_edit_lock(task_id, "agent")
    Backend->>DB: Check existing locks
    alt Lock Available
        Backend->>DB: INSERT INTO agent_edit_locks<br/>Store original_content
        Backend-->>Agent: Lock Granted
        Backend->>UI: Emit 'agent-edit-lock-changed' Event
        UI->>Editor: Set Read-Only Mode
        UI->>UI: Display Banner: "Agent is editing..."
    else Lock Held
        Backend-->>Agent: Error: Lock held by [user/agent]
        Agent->>Agent: Wait and Retry
    end

    Note over Agent,DB: Agent Makes Changes

    Agent->>Backend: write_task_notes(task_id, new_content)
    Backend->>DB: UPDATE task_notes SET content = new_content
    Backend-->>Agent: Write Success

    Agent->>Backend: release_edit_lock(task_id)
    Backend->>DB: UPDATE agent_edit_locks<br/>SET pending_review = TRUE
    Backend->>UI: Emit 'agent-edit-lock-changed' Event

    Note over User,DB: User Reviews Changes

    UI->>Backend: get_original_content(task_id)
    Backend->>DB: SELECT original_content
    Backend-->>UI: Return Original
    UI->>Backend: read_task_notes(task_id)
    Backend->>DB: SELECT content
    Backend-->>UI: Return New Content

    UI->>UI: Activate Diff View<br/>Show Original vs New
    UI->>User: Display Review Panel<br/>"Accept" or "Revert" buttons

    alt User Accepts
        User->>UI: Click "Accept Changes"
        UI->>Backend: release_edit_lock(task_id)<br/>[Finalize]
        Backend->>DB: DELETE FROM agent_edit_locks
        Backend->>UI: Emit 'agent-edit-lock-changed' Event
        UI->>Editor: Exit Read-Only Mode
        UI->>UI: Hide Review Panel
        Note over User,DB: New content becomes permanent
    else User Reverts
        User->>UI: Click "Revert Changes"
        UI->>Backend: get_original_content(task_id)
        Backend-->>UI: Return Original
        UI->>Backend: write_task_notes(task_id, original_content)
        Backend->>DB: UPDATE task_notes<br/>Restore original
        UI->>Backend: release_edit_lock(task_id)
        Backend->>DB: DELETE FROM agent_edit_locks
        Backend->>UI: Emit 'agent-edit-lock-changed' Event
        UI->>Editor: Exit Read-Only Mode
        UI->>UI: Hide Review Panel
        Note over User,DB: Original content restored
    end

    Note over Backend,DB: Background Cleanup

    Backend->>Backend: cleanup_stale_locks() [Every 60s]
    Backend->>DB: SELECT locks older than threshold
    Backend->>DB: DELETE stale locks
    Backend->>UI: Emit events for cleaned locks
```

---

## Agent Management Flow

```mermaid
flowchart TD
    Start([User Opens App]) --> NavSettings[Navigate to Settings]
    NavSettings --> ClickAgents[Click 'Agents' Tab]
    ClickAgents --> LoadAgents[Load AgentsManager Component]

    LoadAgents --> FetchAgents[Fetch All Agents from Database]
    FetchAgents --> DisplayList[Display Agent List]
    DisplayList --> SplitView{Categorize Agents}

    SplitView -->|System Agents| ShowSystem[Show Read-Only System Agents<br/>e.g., Planning Agent]
    SplitView -->|User Agents| ShowUser[Show User-Created Agents<br/>with Edit/Delete Options]

    ShowSystem --> UserAction{User Action}
    ShowUser --> UserAction

    UserAction -->|Create New| CreateFlow[Create New Agent Flow]
    UserAction -->|Edit Existing| EditFlow[Edit Agent Flow]
    UserAction -->|Delete| DeleteFlow[Delete Agent Flow]
    UserAction -->|Done| Exit([Return to App])

    CreateFlow --> ClickCreate[Click 'Create Agent' Button]
    ClickCreate --> ShowForm[Show Agent Form Dialog]
    ShowForm --> EnterDetails[Enter Agent Details:<br/>- Name<br/>- Model Selection<br/>- System Prompt]

    EnterDetails --> FetchModels{Models Available?}
    FetchModels -->|No| GetModels[get_available_models()<br/>from Active Provider]
    FetchModels -->|Yes| ShowModelDropdown[Display Model Dropdown]
    GetModels --> ShowModelDropdown

    ShowModelDropdown --> SelectModel[User Selects Model]
    SelectModel --> SaveAgent[Click 'Save']
    SaveAgent --> ValidateInput{Validate Input}

    ValidateInput -->|Invalid| ShowError[Show Validation Error]
    ValidateInput -->|Valid| InsertDB[INSERT INTO agents TABLE]
    ShowError --> EnterDetails

    InsertDB --> RefreshList[Refresh Agent List]
    RefreshList --> DisplayList

    EditFlow --> SelectAgent[Click on Agent Card]
    SelectAgent --> LoadEditForm[Load Agent in Edit Form]
    LoadEditForm --> ModifyDetails[Modify Name/Model/Prompt]
    ModifyDetails --> SaveChanges[Click 'Save']
    SaveChanges --> UpdateDB[UPDATE agents TABLE]
    UpdateDB --> RefreshList

    DeleteFlow --> ClickDelete[Click Delete Button]
    ClickDelete --> ConfirmDelete{Confirm Deletion?}
    ConfirmDelete -->|No| UserAction
    ConfirmDelete -->|Yes| RemoveDB[DELETE FROM agents TABLE]
    RemoveDB --> RefreshList

    style Start fill:#e1ffe1
    style InsertDB fill:#fff4e1
    style UpdateDB fill:#fff4e1
    style RemoveDB fill:#ffe1e1
    style Exit fill:#e1ffe1
```

---

## Provider Configuration Flow

```mermaid
flowchart TD
    Start([User Opens Settings]) --> LoadSettings[Load Settings Component]
    LoadSettings --> FetchProvider[Fetch Current Provider<br/>get_setting('provider')]
    FetchProvider --> DisplayForm[Display Provider Configuration Form]

    DisplayForm --> SelectProvider{User Selects Provider}

    SelectProvider -->|Anthropic| ShowAnthropicForm[Show Anthropic Config Form]
    SelectProvider -->|LiteLLM| ShowLiteLLMForm[Show LiteLLM Config Form]

    ShowAnthropicForm --> AnthropicFields[Fields:<br/>- API Key<br/>- Model Preferences]
    ShowLiteLLMForm --> LiteLLMFields[Fields:<br/>- API Key<br/>- Base URL<br/>- Model Preferences]

    AnthropicFields --> EnterCreds[User Enters Credentials]
    LiteLLMFields --> EnterCreds

    EnterCreds --> ClickSave[Click 'Save Settings']
    ClickSave --> ValidateFields{Validate Input}

    ValidateFields -->|Missing Required| ShowError[Show Error Message]
    ValidateFields -->|Valid| SaveToDB[Save to settings TABLE]

    ShowError --> EnterCreds

    SaveToDB --> SetProvider[set_setting('provider', selected)]
    SetProvider --> SetAPIKey[set_setting('anthropic_api_key', ...)<br/>or<br/>set_setting('litellm_api_key', ...)]
    SetAPIKey --> SetBaseURL{Is LiteLLM?}

    SetBaseURL -->|Yes| SaveBaseURL[set_setting('litellm_base_url', ...)]
    SetBaseURL -->|No| SettingsSaved[Settings Saved Successfully]
    SaveBaseURL --> SettingsSaved

    SettingsSaved --> ShowSuccess[Display Success Message]
    ShowSuccess --> ReloadModels[Trigger Model List Reload]
    ReloadModels --> CallGetModels[get_available_models()]

    CallGetModels --> ProviderCheck{Which Provider?}

    ProviderCheck -->|Anthropic| AnthropicAPI[Call Anthropic Models API<br/>List all Claude models]
    ProviderCheck -->|LiteLLM| LiteLLMAPI[Call LiteLLM Models Endpoint<br/>GET /v1/models]

    AnthropicAPI --> ParseResponse[Parse Model Response]
    LiteLLMAPI --> ParseResponse

    ParseResponse --> StoreModels[Store Available Models in Memory]
    StoreModels --> UpdateUI[Update AgentsManager Model Dropdown]
    UpdateUI --> Ready[Provider Configured & Ready]
    Ready --> End([User Can Use AI Features])

    style Start fill:#e1ffe1
    style SaveToDB fill:#fff4e1
    style AnthropicAPI fill:#e1f5ff
    style LiteLLMAPI fill:#e1f5ff
    style End fill:#e1ffe1
```

---

## Data Model Hierarchy

```mermaid
erDiagram
    PROJECT ||--o{ TASK : contains
    TASK ||--o{ SUBTASK : "broken into"
    TASK ||--|| TASK_NOTES : has
    TASK ||--o| AGENT_EDIT_LOCK : "may have"
    SUBTASK }o--o| AGENT : "assigned to"
    TASK }o--o{ AGENT : "interacts via"

    PROJECT {
        int id PK
        string title
        string description
        string color
        datetime created_at
        datetime updated_at
    }

    TASK {
        int id PK
        int project_id FK
        string title
        string description
        string status
        int priority
        date due_date
        string notes_file_path
        datetime created_at
        datetime updated_at
    }

    SUBTASK {
        int id PK
        int task_id FK
        string title
        string description
        boolean completed
        int agent_id FK
        datetime created_at
        datetime updated_at
    }

    AGENT {
        int id PK
        string name
        string model_name
        text agent_prompt
        string system_role
        datetime created_at
        datetime updated_at
    }

    TASK_NOTES {
        int task_id PK_FK
        text content
        datetime updated_at
    }

    AGENT_EDIT_LOCK {
        int task_id PK_FK
        string locked_by
        text original_content
        boolean pending_review
        datetime locked_at
    }
```

---

## Status Flow

```mermaid
stateDiagram-v2
    [*] --> Todo: Task Created
    Todo --> InProgress: User Starts Work
    InProgress --> ForReview: User Requests Review
    InProgress --> Todo: User Moves Back
    ForReview --> Done: Review Approved
    ForReview --> InProgress: Revisions Needed
    Done --> [*]: Task Archived

    note right of Todo
        Task defined,
        not yet started
    end note

    note right of InProgress
        User or agent
        actively working
    end note

    note right of ForReview
        Completed work
        awaiting approval
    end note

    note right of Done
        Task completed
        and approved
    end note
```

---

## Key User Journeys

### Journey 1: First-Time User Setup
1. Open Orcas application
2. Navigate to Settings
3. Select AI provider (Anthropic or LiteLLM)
4. Enter API credentials
5. System validates and loads available models
6. Navigate to Agents tab
7. Create first custom agent with selected model
8. Ready to create tasks and delegate to agents

### Journey 2: Task Execution with AI Planning
1. Create new task with title and description
2. Open task in TaskDetail view
3. Click "Plan Task" to invoke AI planning
4. Planning agent analyzes task and creates subtasks
5. User reviews generated subtasks
6. User selects agent from AgentSelector
7. User sends instructions via chat
8. Agent executes subtask and updates shared document
9. User reviews changes (diff view)
10. User accepts changes
11. User marks subtask as complete
12. Repeat for remaining subtasks
13. User marks task as "done"

### Journey 3: Direct Agent Collaboration
1. Open existing task
2. Write initial context in shared document (left pane)
3. Select specialized agent from AgentSelector (right pane)
4. Engage in chat conversation about the task
5. Agent requests to edit document (acquires lock)
6. User sees "agent editing" indicator
7. Agent makes changes to shared document
8. User enters review mode (diff view)
9. User accepts or reverts changes
10. Continue iteration or move to next task

---

## Event-Driven Architecture

```mermaid
sequenceDiagram
    participant UI as Frontend Components
    participant Events as Tauri Event System
    participant Backend as Rust Backend
    participant DB as SQLite

    Note over UI,DB: Event Types & Flow

    Backend->>Events: Emit 'task-planning-progress'
    Events->>UI: PlanCard receives event
    UI->>UI: Update progress bar & message list

    Backend->>Events: Emit 'task-planning-complete'
    Events->>UI: PlanCard receives event
    UI->>UI: Show success, refresh subtasks

    Backend->>Events: Emit 'task-planning-cancelled'
    Events->>UI: PlanCard receives event
    UI->>UI: Show cancelled message

    Backend->>Events: Emit 'agent-edit-lock-changed'
    Events->>UI: TaskDetail receives event
    UI->>Backend: check_edit_lock(task_id)
    Backend->>DB: Query lock status
    DB-->>Backend: Lock details
    Backend-->>UI: Lock state
    UI->>UI: Update UI mode<br/>(read-only/review/normal)

    Note over UI,DB: All events enable real-time<br/>UI updates without polling
```

---

## Summary

The Orcas Agent Manager provides a structured workflow for:

1. **Task Organization**: Hierarchical project → task → subtask structure
2. **AI-Powered Planning**: Automated task breakdown using Claude AI
3. **Human-AI Collaboration**: Shared document editing with review workflows
4. **Agent Management**: Customizable AI agents with different models and prompts
5. **Flexible Integration**: Support for multiple AI providers (Anthropic, LiteLLM)

The application emphasizes:
- Clear separation between planning and execution
- Safe concurrent editing with lock mechanisms
- Real-time updates via event-driven architecture
- User control over AI suggestions through review workflows

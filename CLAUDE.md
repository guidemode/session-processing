# Session Processing Package

AI-powered session analysis and processing for coding agent interactions.

## Development Standards

**CRITICAL: This package MUST maintain strict type safety and code quality.**

### Before ANY Code Changes

All code changes MUST pass ALL of the following checks:

```bash
# 1. Type checking (REQUIRED - zero errors allowed)
pnpm typecheck

# 2. Linting (REQUIRED - zero errors allowed)
pnpm lint

# 3. Building (REQUIRED - must complete successfully)
pnpm build

# 4. Testing (REQUIRED when tests exist)
pnpm test
```

### Type Safety Requirements

1. **NO `any` types** - Use proper TypeScript types for all parameters, return values, and variables
2. **NO type assertions without justification** - Use type guards and narrowing instead of `as` casts when possible
3. **Proper generic constraints** - All generic types must have appropriate constraints
4. **Strict null checks** - Handle `null` and `undefined` explicitly
5. **Import types correctly** - Use `import type` for type-only imports

### Common Type Issues to Avoid

❌ **DON'T:**
```typescript
// Using 'any'
function process(data: any) { ... }

// Unsafe type assertions
const result = data as SomeType

// Comparing incompatible types
if (message.type === 'custom-type-not-in-union') { ... }

// Missing type imports
const components = { ... }  // No types for react-markdown
```

✅ **DO:**
```typescript
// Proper types with generics
function process<T extends BaseType>(data: T): ProcessedResult { ... }

// Type guards and narrowing
if (typeof data === 'string') { ... }
if ('propertyName' in object) { ... }

// Only check types in the union
if (message.content?.type === 'valid-content-type') { ... }

// Import and use proper types
import type { Components } from 'react-markdown'
const components: Partial<Components> = { ... }
```

### File-Specific Type Requirements

**UI Components (`src/ui/components/**`):**
- All React component props must have explicit interfaces
- Event handlers must use proper React event types
- No `any` in JSX prop types

**Processors (`src/ui/utils/processors/**`):**
- All message types must extend `BaseSessionMessage`
- Content types must match defined `ContentBlock` unions
- Parser methods must have explicit return types

**Parsers (`src/ui/utils/sessionParser.ts`):**
- Raw message content must be properly typed or use `unknown` with type guards
- All adapter methods must match `ProviderAdapter` interface
- Content processing must return defined content types

**AI Models (`src/ai-models/**`):**
- Task inputs must extend proper base types
- LLM responses must be validated and typed
- Error handling must be explicit

### Quick Type Check Command

```bash
# Run all quality checks in sequence (from packages/session-processing/)
pnpm typecheck && pnpm lint && pnpm build
```

If this fails, your code MUST NOT be committed. Fix all errors before proceeding.

### Local Workflow Examples

When working on this package:

```bash
# 1. Navigate to the package
cd packages/session-processing

# 2. Make your changes to source files

# 3. Run quality checks locally (fast feedback)
pnpm typecheck  # Check types
pnpm lint       # Check code style
pnpm build      # Verify build works

# 4. If tests exist, run them
pnpm test

# 5. Only then commit your changes
```

### From Workspace Root

To check this package from the workspace root:

```bash
pnpm --filter @guidemode/session-processing typecheck
pnpm --filter @guidemode/session-processing lint
pnpm --filter @guidemode/session-processing build
pnpm --filter @guidemode/session-processing test
```

**Remember**: After building this package, rebuild dependent packages (server, cli) that import it.

---

## Canonical Parser Architecture

**Single parser for all AI providers—replaces 5+ provider-specific parsers.**

### Core Concept

**Location:** `src/parsers/canonical/parser.ts`

The canonical parser handles all providers using the universal canonical JSONL format produced by the CLI. This major simplification replaced individual parser implementations with one unified parser. Sessions from providers the CLI does not yet support (Gemini, Copilot, OpenCode) exist from the retired desktop app and parse identically.

**Key Benefits:**
- One parser instead of 5+ provider parsers
- Consistent message processing across all providers
- Provider-specific features preserved via `providerMetadata`
- Easy to add new providers (no TypeScript parser needed)

### Message Processing

**Format Detection:**
```typescript
canParse(jsonlContent: string): boolean {
    // Checks for canonical structure:
    // - uuid field
    // - sessionId field
    // - message.role field
    // - type in ['user', 'assistant', 'meta']
}
```

**Message Parsing:**
```typescript
parseMessage(rawMessage: RawLogMessage): ParsedMessage[] {
    // Returns array for multi-block messages (e.g., Gemini thinking)
    // Determines intelligent message types
    // Handles both text and structured content blocks
}
```

### Content Block Types

The parser handles four core content block types:

- **Text** - Simple text messages
- **ToolUse** - Function calls, commands (`id`, `name`, `input`)
- **ToolResult** - Function outputs (`tool_use_id`, `content`, `is_error`)
- **Thinking** - Extended reasoning (Gemini, Claude)

### Message Type Detection

The parser transforms canonical `message_type` into specific UI types:

**User Messages:**
- `tool_result` - Contains tool result blocks
- `compact` - Short messages < 100 chars
- `interruption` - User interruptions
- `command` - Command outputs (from `<local-command-stdout>`)
- `user` - Default user messages

**Assistant Messages:**
- `tool_use` - Contains tool use blocks
- `assistant` - Default assistant responses

**Meta Messages:**
- `meta` - System events, metadata

### Provider Metadata Preservation

All provider-specific data is preserved in `metadata.providerMetadata`:

```typescript
metadata: {
    role: string,
    sessionId: string,
    provider: string, // "claude-code", "gemini-code", etc.
    providerMetadata: any, // Provider-specific fields
    // ... standard fields
}
```

**Examples:**
- **Gemini**: Thinking block counts, thought metadata
- **Copilot**: Intentions for tools, execution status
- **Codex**: Payload types, event metadata
- **Claude**: File snapshots, summary blocks

### Parser Registry

**Location:** `src/parsers/registry.ts`

```typescript
export class ParserRegistry {
    constructor() {
        const canonicalParser = new CanonicalParser()
        this.register(canonicalParser)

        // All providers use the same parser
        const providerAliases = [
            'claude-code', 'gemini-code', 'github-copilot',
            'codex', 'opencode'
        ]

        for (const alias of providerAliases) {
            this.parsers.set(alias, canonicalParser)
        }
    }
}
```

### Session Processing

**Location:** `src/processors/canonical/index.ts`

The canonical session processor uses 6 metric processors:

- **Performance** - Response times, session duration
- **Engagement** - Turn counts, user interactions
- **Quality** - Success rates, error handling
- **Usage** - Token consumption, model usage
- **Error** - Error detection and categorization
- **Context** - Context window usage, file tracking

All providers are processed uniformly with provider-specific adaptations in the UI layer.

### Adding New Providers

To support a new provider:

1. **Converter** (the CLI) - Converts the provider's native format to canonical
2. **Registry alias** (here) - Add to `providerAliases` array

**That's it!** The canonical parser automatically handles the new provider.

No provider-specific TypeScript parser needed.

### UI Message Processing

**Location:** `src/ui/utils/processors/CanonicalMessageProcessor.ts`

The UI processor handles provider-specific display features:

- **Gemini** - Thought display with count badges
- **Copilot** - Intention badges for tools
- **Codex** - Payload type-based icons
- **Claude** - Thinking blocks, images, special content

Provider-specific features are read from `providerMetadata` and rendered appropriately.

---

## Session Phase Analysis Task

The `SessionPhaseAnalysisTask` analyzes complete AI coding session transcripts and breaks them down into meaningful phases based on the flow of conversation.

### Phase Types

The task identifies 11 distinct phase types:

| Phase Type | Description |
|------------|-------------|
| `initial_specification` | User describes what they want to accomplish |
| `analysis_planning` | AI analyzes requirements and creates a plan |
| `plan_modification` | User requests changes or clarifications to the plan |
| `plan_agreement` | Both parties agree on the approach |
| `execution` | AI executes the plan, making changes |
| `interruption` | User interrupts or redirects the AI |
| `task_assignment` | Multiple tasks being worked on simultaneously |
| `completion` | Initial task is completed |
| `correction` | Issues found that need fixing (not working, not right) |
| `final_completion` | All issues resolved and task is done |
| `other` | Any phase that doesn't fit the above patterns |

### Output Structure

#### TypeScript Interfaces

```typescript
interface SessionPhase {
  phaseType: SessionPhaseType
  startStep: number        // 1-based message index where phase starts
  endStep: number          // 1-based message index where phase ends
  stepCount: number        // Number of messages in this phase
  summary: string          // 1-2 sentence description of what happened
  durationMs: number       // Approximate duration of this phase in milliseconds
  timestamp?: string       // ISO 8601 timestamp when phase started
}

interface SessionPhaseAnalysis {
  phases: SessionPhase[]
  totalPhases: number
  totalSteps: number
  sessionDurationMs: number
  pattern: string          // High-level flow pattern (e.g., "initial_specification -> analysis_planning -> execution -> completion")
}
```

#### Example Output

Real example from a styling fix session:

```json
{
  "phases": [
    {
      "phaseType": "initial_specification",
      "startStep": 1,
      "endStep": 3,
      "stepCount": 3,
      "summary": "Clifton initiated the session and specified several styling issues with the SessionCard component in the session-processing package.",
      "durationMs": 12051,
      "timestamp": "2025-10-05T05:43:26.538Z"
    },
    {
      "phaseType": "analysis_planning",
      "startStep": 4,
      "endStep": 33,
      "stepCount": 30,
      "summary": "The assistant analyzed the problem, read relevant files, and created an execution plan to fix the identified styling issues.",
      "durationMs": 62346,
      "timestamp": "2025-10-05T05:45:43.150Z"
    },
    {
      "phaseType": "execution",
      "startStep": 34,
      "endStep": 79,
      "stepCount": 46,
      "summary": "The assistant executed the plan by modifying files and applied the initial styling fixes, including replacing emojis with heroicons and increasing icon visibility.",
      "durationMs": 214398,
      "timestamp": "2025-10-05T05:47:41.809Z"
    },
    {
      "phaseType": "completion",
      "startStep": 78,
      "endStep": 79,
      "stepCount": 2,
      "summary": "Assistant reported the initial completion of the styling updates and provided a summary of changes made.",
      "durationMs": 11478,
      "timestamp": "2025-10-05T05:50:03.729Z"
    }
  ],
  "totalPhases": 4,
  "totalSteps": 79,
  "sessionDurationMs": 300273,
  "pattern": "initial_specification -> analysis_planning -> execution -> completion"
}
```

### Field Descriptions

#### SessionPhase Fields

- **phaseType**: One of 11 predefined phase types (see table above)
- **startStep**: 1-based index of the first message in this phase
- **endStep**: 1-based index of the last message in this phase
- **stepCount**: Number of messages/steps in this phase (`endStep - startStep + 1`)
- **summary**: Human-readable 1-2 sentence summary of what happened in this phase
- **durationMs**: Estimated duration of this phase in milliseconds
- **timestamp**: ISO 8601 timestamp indicating when this phase started (optional)

#### SessionPhaseAnalysis Fields

- **phases**: Array of all detected phases in chronological order
- **totalPhases**: Total count of phases (same as `phases.length`)
- **totalSteps**: Total number of messages/steps in the entire session
- **sessionDurationMs**: Total duration of the session in milliseconds
- **pattern**: Human-readable description of the overall session flow (e.g., `"initial_specification -> analysis_planning -> execution -> completion"`)

### Important Notes for UI Development

1. **Phase Ordering**: Phases are always returned in chronological order
2. **Step Numbering**: Steps use 1-based indexing (first message is step 1)
3. **Non-overlapping**: Phases are sequential and do not overlap
4. **Variable Phases**: Not all sessions will have all phase types
5. **Pattern String**: Useful for quick visualization of session flow
6. **Duration**: Phase durations are estimates based on message timestamps

### UI Visualization Recommendations

#### Timeline View
- Use `durationMs` to size phase blocks proportionally
- Color-code by `phaseType` for visual distinction
- Show `summary` on hover or in expanded view

#### Phase Distribution Chart
- Count phases by type across multiple sessions
- Show average duration per phase type
- Identify common patterns

#### Session Flow Diagram
- Use `pattern` string for high-level overview
- Expand to show individual phases with details
- Link phases to actual message ranges via `startStep`/`endStep`

#### Phase Type Colors (Suggestion)

```javascript
const phaseColors = {
  initial_specification: '#3B82F6',  // Blue - Starting point
  analysis_planning: '#8B5CF6',      // Purple - Thinking
  plan_modification: '#EC4899',      // Pink - Iteration
  plan_agreement: '#10B981',         // Green - Agreement
  execution: '#F59E0B',              // Orange - Action
  interruption: '#EF4444',           // Red - Disruption
  task_assignment: '#06B6D4',        // Cyan - Parallel work
  completion: '#84CC16',             // Lime - Initial done
  correction: '#F97316',             // Deep orange - Fixing
  final_completion: '#22C55E',       // Bright green - All done
  other: '#6B7280'                   // Gray - Miscellaneous
}
```

### Database Storage

**Server (PostgreSQL):**
- Column: `ai_model_phase_analysis` (JSONB)
- Stored in `agent_sessions` table

### Usage Example

```typescript
import { SessionPhaseAnalysisTask } from '@guidemode/session-processing/ai-models'

// The task is automatically registered and executed as part of the processing pipeline
// Results are stored in the database column ai_model_phase_analysis

// To retrieve and use:
const session = await db.getSession(sessionId)
if (session.aiModelPhaseAnalysis) {
  const analysis = JSON.parse(session.aiModelPhaseAnalysis)
  console.log(`Session had ${analysis.totalPhases} phases`)
  console.log(`Pattern: ${analysis.pattern}`)

  // Render each phase
  analysis.phases.forEach(phase => {
    console.log(`${phase.phaseType}: ${phase.summary}`)
  })
}
```

## Other Tasks

This package also includes:
- `SessionSummaryTask` - Generates human-readable session summaries
- `QualityAssessmentTask` - Scores session quality (0-100)
- `IntentExtractionTask` - Extracts user intents and goals

See examples in `examples/` directory for detailed usage.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCut is a free, open-source video editor built with Next.js, focusing on privacy (no server processing), multi-track timeline editing, and real-time preview. The project is a monorepo using Turborepo with multiple apps including a web application, desktop app (Tauri), background remover tools, and transcription services.

## Essential Commands

**Development:**
```bash
# Root level development
bun dev                    # Start all apps in development mode
bun build                  # Build all apps
bun lint                   # Lint all code using Ultracite
bun format                 # Format all code using Ultracite

# Web app specific (from apps/web/)
cd apps/web
bun run dev                # Start Next.js development server with Turbopack
bun run build              # Build for production
bun run lint               # Run Biome linting
bun run lint:fix           # Fix linting issues automatically
bun run format             # Format code with Biome

# Database operations (from apps/web/)
bun run db:generate        # Generate Drizzle migrations
bun run db:migrate         # Run migrations
bun run db:push:local      # Push schema to local development database
bun run db:push:prod       # Push schema to production database
```

**Testing:**
- No unified test commands are currently configured
- Individual apps may have their own test setups

## Architecture & Key Components

### State Management
The application uses **Zustand** for state management with separate stores for different concerns:
- **editor-store.ts**: Canvas presets, layout guides, app initialization
- **timeline-store.ts**: Timeline tracks, elements, playback state
- **media-store.ts**: Media files and asset management
- **playback-store.ts**: Video playback controls and timing
- **project-store.ts**: Project-level data and persistence
- **panel-store.ts**: UI panel visibility and layout
- **keybindings-store.ts**: Keyboard shortcut management
- **sounds-store.ts**: Audio effects and sound management
- **stickers-store.ts**: Sticker/graphics management

### Storage System
**Multi-layer storage approach:**
- **IndexedDB**: Projects, saved sounds, and structured data
- **OPFS (Origin Private File System)**: Large media files for better performance
- **Storage Service** (`lib/storage/`): Abstraction layer managing both storage types

### Editor Architecture
**Core editor components:**
- **Timeline Canvas**: Custom canvas-based timeline with tracks and elements
- **Preview Panel**: Real-time video preview (currently DOM-based, planned binary refactor)
- **Media Panel**: Asset management with drag-and-drop support
- **Properties Panel**: Context-sensitive element properties

### Media Processing
- **FFmpeg Integration**: Client-side video processing using @ffmpeg/ffmpeg
- **Background Removal**: Python-based tools with multiple AI models (U2Net, SAM, Gemini)
- **Transcription**: Separate service for audio-to-text conversion

## Development Focus Areas

**✅ Recommended contribution areas:**
- Timeline functionality and UI improvements
- Project management features
- Performance optimizations
- Bug fixes in existing functionality
- UI/UX improvements outside preview panel
- Documentation and testing

**⚠️ Areas to avoid (pending refactor):**
- Preview panel enhancements (fonts, stickers, effects)
- Export functionality improvements
- Preview rendering optimizations

**Reason:** The preview system is planned for a major refactor from DOM-based rendering to binary rendering for consistency with export and better performance.

## Code Quality Standards

**Linting & Formatting:**
- Uses **Biome** for JavaScript/TypeScript linting and formatting
- Extends **Ultracite** configuration for strict type safety and AI-friendly code
- Comprehensive accessibility (a11y) rules enforced
- Zero configuration approach with subsecond performance

**Key coding standards from Ultracite:**
- Strict TypeScript with no `any` types
- No React imports (uses automatic JSX runtime)
- Comprehensive accessibility requirements
- Use `for...of` instead of `Array.forEach`
- No TypeScript enums, use const objects
- Always include error handling with try-catch

## Coding Guidelines & Rules

### Comment Guidelines

**Good Comments (Human-style):**
- Explain WHY, not WHAT
- Document non-obvious behavior or edge cases
- Warn about performance implications or side effects
- Explain business logic that isn't clear from code

Examples:
```javascript
// transfer, not copy; sender buffer detaches
// satisfies: check shape; keep literals  
// keep multibyte across chunks
// timingSafeEqual throws on length mismatch
```

**Bad Comments (AI-style):**
- Don't explain what the code literally does
- Don't add changelog-style comments in code
- Don't comment every line or obvious operations

Avoid:
```javascript
// Prevent duplicate initialization
// Check if project is already loaded  
// Mark as initializing to prevent race conditions
// (changed from blah to blah)
```

**Rule:** Only add comments when there's genuinely non-obvious behavior, performance considerations, or business logic that needs context. Code should be self-documenting through naming and structure.

### Separation of Concerns

**Core Principle:** Each file should have one single purpose/responsibility. Related functionality should be grouped together, unrelated functionality should be separated.

**Good Separation:**
- One file per major concern (auth, validation, data transformation)
- Group related utilities together
- Extract shared logic into dedicated files
- Keep API routes focused on their specific endpoint logic

Examples:
```javascript
// ✅ Good: Each file has clear responsibility
/lib/rate-limit.ts          // Rate limiting utilities
/lib/validation.ts          // Input validation schemas
/lib/freesound-api.ts       // External API integration
/api/sounds/search/route.ts // Route handler only
```

**When to Separate:**
- File is getting long (>500 lines)
- Multiple distinct responsibilities in one file
- Logic could be reused elsewhere
- Complex utilities that distract from main purpose

**Rule:** One file, one responsibility. Extract shared concerns into focused utility files.

### Scannable Code Guidelines

**Core Principle:** Code should be scannable through proper abstraction, not comments. Use variables and helper functions to make intent clear at a glance.

**Good Scannable Code:**
- Extract complex logic into well-named variables
- Create helper functions for multi-step operations
- Use descriptive names that explain intent

Examples:
```javascript
// ✅ Scannable: Intent is clear from variable names
const isValidUser = user.isActive && user.hasPermissions;
const shouldProcessPayment = amount > 0 && !order.isPaid;

// ✅ Scannable: Complex logic extracted to helper
const searchParams = buildFreesoundSearchParams({ query, filters, pagination });
const transformedResults = transformFreesoundResults({ rawResults });
```

**Bad Unscannable Code:**
```javascript
// ❌ Hard to scan: What does this condition mean?
if (type === "effects" || !type) {
  params.append("filter", "duration:[* TO 30.0]");
  params.append("filter", `avg_rating:[${min_rating} TO *]`);
  if (commercial_only) {
    params.append("filter", 'license:("Attribution" OR "Creative Commons 0")');
  }
}

// ❌ Hard to scan: Complex ternary
const sortParam = query
  ? sort === "score"
    ? "score"
    : `${sort}_desc`
  : `${sort}_desc`;
```

**Rule:** Make code scannable by extracting intent into variables and helper functions. If you need to think about what code does, extract it. The reader should understand the flow without diving into implementation details.

### Ultracite Rules (Extended)

**Accessibility (a11y):**
- Always include a `title` element for icons unless there's text beside the icon
- Always include a `type` attribute for button elements
- Accompany `onClick` with at least one of: `onKeyUp`, `onKeyDown`, or `onKeyPress`
- Accompany `onMouseOver`/`onMouseOut` with `onFocus`/`onBlur`

**Code Complexity and Quality:**
- Don't use primitive type aliases or misleading types
- Don't use the comma operator
- Use for...of statements instead of Array.forEach
- Don't initialize variables to undefined
- Use .flatMap() instead of map().flat() when possible

**React and JSX Best Practices:**
- Don't import `React` itself
- Don't define React components inside other components
- Don't use both `children` and `dangerouslySetInnerHTML` props on the same element
- Don't insert comments as text nodes
- Use `<>...</>` instead of `<Fragment>...</Fragment>`

**Function Parameters and Props:**
- Always use destructured props objects instead of individual parameters in functions
- Example: `function helloWorld({ prop }: { prop: string })` instead of `function helloWorld(param: string)`
- This applies to all functions, not just React components

**Correctness and Safety:**
- Don't assign a value to itself
- Avoid unused imports and variables
- Don't use await inside loops
- Don't hardcode sensitive data like API keys and tokens
- Don't use the TypeScript directive @ts-ignore
- Make sure the `preconnect` attribute is used when using Google Fonts
- Don't use the `delete` operator
- Don't use `require()` in TypeScript/ES modules - use proper `import` statements

**TypeScript Best Practices:**
- Don't use TypeScript enums
- Use either `T[]` or `Array<T>` consistently
- Don't use the `any` type

**Style and Consistency:**
- Don't use global `eval()`
- Use `String.slice()` instead of `String.substr()` and `String.substring()`
- Don't use `else` blocks when the `if` block breaks early
- Put default function parameters and optional function parameters last
- Use `new` when throwing an error
- Use `String.trimStart()` and `String.trimEnd()` over `String.trimLeft()` and `String.trimRight()`

**Next.js Specific Rules:**
- Don't use `<img>` elements in Next.js projects
- Don't use `<head>` elements in Next.js projects

## Environment Setup

**Required environment variables (apps/web/.env.local):**
```bash
# Database
DATABASE_URL="postgresql://opencut:opencut@localhost:5432/opencut"

# Authentication
BETTER_AUTH_SECRET="your-generated-secret-here"
BETTER_AUTH_URL="http://localhost:3000"

# Redis
UPSTASH_REDIS_REST_URL="http://localhost:8079"
UPSTASH_REDIS_REST_TOKEN="example_token"

# Content Management
MARBLE_WORKSPACE_KEY="workspace-key"
NEXT_PUBLIC_MARBLE_API_URL="https://api.marblecms.com"
```

**Docker services:**
```bash
# Start local database and Redis
docker-compose up -d
```

## Project Structure

**Monorepo layout:**
- `apps/web/` - Main Next.js application
- `apps/desktop/` - Tauri desktop application
- `apps/bg-remover/` - Python background removal tools
- `apps/transcription/` - Audio transcription service
- `packages/` - Shared packages (auth, database)

**Web app structure:**
- `src/components/` - React components organized by feature
- `src/stores/` - Zustand state management
- `src/hooks/` - Custom React hooks
- `src/lib/` - Utility functions and services
- `src/types/` - TypeScript type definitions
- `src/app/` - Next.js app router pages and API routes

## Common Patterns

**Error handling:**
```typescript
try {
  const result = await processData();
  return { success: true, data: result };
} catch (error) {
  console.error('Operation failed:', error);
  return { success: false, error: error.message };
}
```

**Store usage:**
```typescript
const { tracks, addTrack, updateTrack } = useTimelineStore();
```

**Media processing:**
```typescript
import { processVideo } from '@/lib/ffmpeg-utils';
const processedVideo = await processVideo(inputFile, options);
```
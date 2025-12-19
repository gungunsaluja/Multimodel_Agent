# Setup Instructions

## Prerequisites

1. Install Bun: https://bun.sh
   ```bash
   # On Windows (PowerShell)
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

## Installation

1. Install dependencies:
   ```bash
   bun install
   ```

2. Run the development server:
   ```bash
   bun run dev
   ```

3. Open your browser to: http://localhost:3000

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── api/ws/            # WebSocket simulation endpoint
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── components/            # React components
│   ├── AgentSidebar.tsx   # Agent selection sidebar
│   ├── PromptInput.tsx    # Prompt input form
│   ├── ActionStream.tsx   # Real-time action viewer
│   ├── ToolCallInspector.tsx  # Tool call inspector
│   └── FileDiffViewer.tsx # File diff viewer
├── lib/                   # Utilities
│   ├── types.ts           # TypeScript types
│   ├── agents.ts          # Agent definitions
│   ├── dummyData.ts       # Dummy data generators
│   └── diffUtils.ts       # Diff utilities
└── package.json           # Dependencies
```

## Features

- ✅ Multi-agent selection (5 agents: Claude Code, OpenCode, Cline, Codex, Gemini CLI)
- ✅ Real-time action streaming (simulated with delays)
- ✅ Tool call inspection
- ✅ File diff viewer with syntax highlighting
- ✅ Multi-modal input support (text + files)
- ✅ Dark mode support
- ✅ Responsive UI

## Current Implementation

- **WebSocket-based** real-time communication
- **True streaming** from OpenRouter API
- **Custom Next.js server** with integrated WebSocket server

## Architecture

The application uses a custom Next.js server (`server.ts`) that:
- Handles HTTP requests for Next.js pages
- Runs a WebSocket server on `/api/ws`
- Streams agent responses in real-time
- Automatically reconnects on connection loss
3. Add authentication if needed
4. Handle actual file system operations


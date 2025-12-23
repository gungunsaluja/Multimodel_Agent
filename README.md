# Multi-Agent Coding Interface

A Next.js app that lets you chat with multiple AI coding assistants (Claude, Gemini, ChatGPT) at the same time. They can create and edit files in your workspace, and you get to see all their responses side by side.

## Setup

### Prerequisites

You'll need [Bun](https://bun.sh) installed. If you don't have it:

```bash
curl -fsSL https://bun.sh/install | bash
```

Or on Windows:
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

### Installation

Clone the repo and install dependencies:

```bash
git clone <your-repo-url>
cd chat-gpt-copy
bun install
```

### Environment Variables

Create a `.env.local` file in the root directory:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

You'll need an OpenRouter API key. Sign up at [openrouter.ai](https://openrouter.ai) and get your key from the dashboard.

### Running the App

Start the dev server:

```bash
bun run dev
```

The app should be running at `http://localhost:3000`.

For production:

```bash
bun run build
bun run start
```

## How It Works

The app connects to OpenRouter API which gives you access to different AI models. You can:

- **Chat with multiple agents**: Send the same prompt to Claude, Gemini, and ChatGPT simultaneously
- **File operations**: Agents can create and edit files in the workspace directory
- **Compare responses**: See how different models approach the same problem
- **File explorer**: Upload files, browse your workspace, and view/edit files
- **Diff viewer**: When agents suggest file changes, you can see the diff and accept/reject them

## Project Structure

```
├── app/
│   ├── api/              # API routes
│   │   ├── agents/       # Agent streaming endpoints
│   │   └── files/        # File operations (read, write, upload, etc.)
│   ├── page.tsx          # Main app page
│   └── layout.tsx
├── components/           # React components
│   ├── AgentPanel.tsx    # Individual agent chat panel
│   ├── FileExplorer.tsx  # File browser
│   ├── FileView.tsx      # File editor
│   └── ...
├── lib/                  # Utilities and config
│   ├── agents.ts         # Agent definitions
│   ├── config.ts         # App configuration
│   ├── fileParser.ts     # Parse file operations from agent responses
│   ├── openrouter.ts     # OpenRouter API client
│   └── ...
└── workspace/            # User workspace (files created by agents)
```

## Features

- **Multi-agent chat**: All three agents respond in parallel
- **Real-time streaming**: Responses stream in as they're generated
- **File management**: Upload, create, edit files through the UI
- **Diff visualization**: See exactly what changed in files
- **Resizable panels**: Adjust the layout to your preference
- **Auto-save**: Files auto-save as you type (1 second debounce)

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Bun** - Package manager and runtime
- **OpenRouter** - AI model API gateway

## Notes

- The workspace directory is where agents create/edit files
- File operations are parsed from agent responses using regex patterns
- All file paths are validated to prevent path traversal attacks
- The app uses Server-Sent Events (SSE) for streaming responses

## Troubleshooting

If you're getting API errors, make sure:
- Your OpenRouter API key is set correctly in `.env.local`
- You have credits in your OpenRouter account
- The models you're using support the features you need (some free models don't support image input)

If file operations aren't working:
- Check that agents are using the correct format: `Create file: path/to/file.ts` followed by a code block
- Make sure the workspace directory has write permissions

## License

MIT


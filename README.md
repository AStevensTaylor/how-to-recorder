# How-To Recorder

A Chrome extension that records user interactions (clicks, inputs, navigation) with screenshots and optional audio narration, then exports them as step-by-step documentation.

## Features

- 📸 **Screenshot Capture** - Automatically captures screenshots during interactions
- 🎯 **Smart Element Detection** - Tracks clicks and inputs with intelligent selectors
- 🔒 **Sensitive Data Protection** - Automatically masks passwords and sensitive fields
- 📝 **Multiple Export Formats** - JSON, Markdown, and ZIP with images
- 🎨 **Visual Timeline** - Side panel interface for managing recordings
- 🎙️ **Audio Support** (planned) - Add voice narration to recordings

## Installation

### For Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/AStevensTaylor/how-to-recorder.git
   cd how-to-recorder
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Build the extension**
   ```bash
   bun run build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `build/` directory

### From Release

1. Download the latest `.crx` file from [Releases](https://github.com/AStevensTaylor/how-to-recorder/releases)
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Drag and drop the `.crx` file onto the extensions page

## Usage

1. **Start Recording**
   - Click the extension icon or open the side panel
   - Click "Start Recording"

2. **Perform Actions**
   - Navigate websites, click buttons, fill forms
   - Each action is captured with a screenshot

3. **Stop Recording**
   - Click "Stop Recording" in the side panel

4. **Export**
   - Choose from JSON, Markdown, or ZIP formats
   - Review and download your documentation

## Development

### Prerequisites

- [Bun](https://bun.sh/) v1.3.5 or higher
- Chrome/Chromium browser

### Commands

```bash
bun install          # Install dependencies
bun run dev          # Start dev server with HMR
bun run build        # Build for production
bun run test         # Run tests
bun run check        # Lint and format check
bun run check:fix    # Auto-fix lint/format issues
bun run zip          # Build and create distributable ZIP
```

### Project Structure

```
src/
├── background/       # Service worker (orchestrates recording)
├── contentScript/    # Injected scripts (track interactions)
├── sidepanel/        # React UI (control panel and timeline)
│   ├── components/   # UI components
│   └── context/      # React context providers
├── types/            # TypeScript definitions
├── utils/            # Export and utility functions
└── manifest.ts       # Extension manifest configuration
```

### Tech Stack

- **Runtime**: Bun
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite + @crxjs/vite-plugin
- **Linting/Formatting**: Biome
- **Storage**: IndexedDB (via idb)
- **Bundling**: JSZip for exports

## CI/CD

This project uses GitHub Actions for automated testing and releases:

- **PR Checks**: Automatic linting, type checking, and testing on pull requests
- **Releases**: Automatic `.crx` packaging and GitHub releases on merge to `main`
- **Chrome Web Store**: Automated publishing (requires setup)

See [CI.md](./CI.md) for detailed CI/CD configuration and setup instructions.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`bun run test && bun run check`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

See [AGENTS.md](./AGENTS.md) for detailed development guidelines and code style conventions.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Author

Ahren Stevens-Taylor <github+how-to-recorder@stevenstaylor.dev>

## Acknowledgments

Built with:
- [Vite](https://vitejs.dev/)
- [React](https://react.dev/)
- [CRXJS](https://crxjs.dev/)
- [Biome](https://biomejs.dev/)
- [Bun](https://bun.sh/)

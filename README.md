# Wi-Fi File Server

Share a local folder over your Wi-Fi network and browse or download files from another device using a web browser.

## Requirements

- Node.js 20 or newer
- Windows, macOS, or Linux
- Devices connected to the same Wi-Fi / local network

## Quick Start

Run instantly with `npx` (no installation required):

```bash
npx wifi-file-server ./Videos
```

Or install globally:

```bash
npm install -g wifi-file-server
wifi-file-server ./Videos
```

Then open the phone URL printed in your terminal on your mobile browser (e.g. `http://192.168.1.5:3000`).

## CLI Options

```bash
wifi-file-server <folder-path> [options]
```

| Option | Description |
| --- | --- |
| `-p, --port <number>` | Custom port to listen on (default: `3000` or `PORT` env) |
| `-h, --help` | Show help and usage instructions |
| `-v, --version` | Display current package version |

### Examples

```bash
# Share current directory on default port 3000
npx wifi-file-server .

# Share specific folder on custom port
wifi-file-server ./Documents --port 8080

# Share with short flag
wifi-file-server ./Videos -p 4000
```

## Features

- **Zero configuration:** Start and browse immediately.
- **Mobile-friendly web UI:** Clean responsive design with dark mode support.
- **Fast streaming downloads:** Memory-efficient stream downloads with HTTP Range support (pause & resume support).
- **Directory navigation:** Browse nested subdirectories with breadcrumb navigation.
- **Path security:** Prevents directory traversal attacks outside the shared folder.

## Security

This tool does not provide authentication by default. Only use it on a trusted private network and share folders that do not contain sensitive files. Do not expose its port to the public internet.

## License

MIT © [deveshwadibhasme](https://github.com/deveshwadibhasme)

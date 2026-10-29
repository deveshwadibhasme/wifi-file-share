# Wi-Fi File Server

Share a local folder over your Wi-Fi network and browse or download
files from another device using a web browser.

## Requirements

- Node.js 20 or newer
- Windows, macOS, or Linux
- Devices connected to the same reachable local network

## Usage

Run without installing globally:

```bash
npx wifi-file-server-yourusername ./Videos
```

Or install globally:

```bash
npm install -g wifi-file-server-yourusername
wifi-file-server ./Videos
```

Open the local URL printed in the terminal on your phone.

## Security

This tool does not provide authentication by default.
Only use it on a trusted network and share a folder that does not
contain sensitive files. Do not expose its port to the public internet.

## License

MIT

# Wormhole-RTC

A blazing-fast, privacy-first, peer-to-peer WebRTC messenger for text chat and audio calls. Built with Node.js, Express, and modern web technologies. No accounts, no tracking, just secure communication through the wormhole.

---

## Features

- **Peer-to-Peer WebRTC**: Direct, encrypted connections for chat and audio calls.
- **No Accounts Needed**: Share a code, connect instantly.
- **Modern UI**: Clean, responsive interface powered by modern browser-native components.
- **No-Retention Status Dashboard**: Operational metrics at `/status` with aggregate counters only (no IP or user retention).
- **Open Source Core, Proprietary License**: See LICENSE for details.
- **Production-Ready**: Includes a Let's Encrypt integration plan for HTTPS.

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/wormhole-rtc.git
cd wormhole-rtc
npm install
```

### 2. Run the Server

```bash
node server.js
```

The server will start on [http://localhost:8001/](http://localhost:8001/)

### 3. Open the App

Visit [http://localhost:8001/](http://localhost:8001/) in your browser.

### 4. View Server Status

Visit [http://localhost:8001/status](http://localhost:8001/status) for the server dashboard (uptime, system load, and aggregate WebSocket counters only).

---

## Production Deployment

- **HTTPS is required for WebRTC!**
- See [`letscrypt.md`](letscrypt.md) for a step-by-step Let's Encrypt integration guide.
- Deploy on your favorite VPS, cloud, or even a Raspberry Pi.

### Azure App Service Deployment (Idempotent)

This repository includes an idempotent deployment script:

- `scripts/deploy-azure.sh`

It supports both:

- Creating missing resources (resource group, app service plan, web app)
- Updating an existing deployment in place

#### Prerequisites

- Azure CLI installed and logged in (`az login`)
- `zip` installed
- Execute permission on the script (`chmod +x scripts/deploy-azure.sh`)

#### Basic deploy

```bash
./scripts/deploy-azure.sh \
	--resource-group rg-wormhole-rtc \
	--location eastus \
	--plan plan-wormhole-rtc \
	--app wormhole-rtc-12345 \
	--sku B1
```

#### Dry run (no changes)

```bash
./scripts/deploy-azure.sh \
	--resource-group rg-wormhole-rtc \
	--location eastus \
	--plan plan-wormhole-rtc \
	--app wormhole-rtc-12345 \
	--dry-run
```

#### Optional flags

- `--subscription <id-or-name>`: choose target subscription
- `--runtime <NODE:20-lts>`: override Node runtime
- `--port <8001>`: app port value used for `PORT` and `WEBSITES_PORT`
- `--startup-file <node server.js>`: custom startup command

#### Help

```bash
./scripts/deploy-azure.sh --help
```

---

## Developer Guide

### Project Structure

```
wormhole-rtc/
├── server.js              # Express + WebSocket signaling server
├── index.html             # Main messenger UI (root route)
├── index-ui.js            # UI controller and interactions
├── status.html            # Branded server status dashboard
├── sender.js              # Sender-side signaling and connection setup
├── receiver.js            # Receiver-side signaling and connection setup
├── wormhole-rtc.js        # Shared wormhole code generation logic
├── crypto.js              # Browser crypto helpers (ECDH/AES-GCM flows)
├── utils.js               # Shared utility helpers
├── wordlist.js            # Human-friendly word list for codes
├── letscrypt.md           # HTTPS setup guide
├── background.md          # Protocol and design background notes
├── package.json           # Scripts and dependencies
├── package-lock.json      # Dependency lockfile
├── LICENSE                # Project license
├── README.md              # Project overview and usage
├── .gitignore             # Git ignore rules
├── .github/               # GitHub workflows/config (if present)
└── .vscode/               # Local editor settings (if present)
```

### Scripts

- `npm start` — Start the server
- `npm run dev` — (Add nodemon for hot reload)

### Customization

- UI: Edit `index.html` and `index-ui.js`
- Server: Edit `server.js`
- WebRTC logic: Edit `wormhole-rtc.js`, `sender.js`, `receiver.js`

### Roadmap and TODO

- See [TODO.md](TODO.md) for the current implementation checklist, upcoming items, and recommended features.

---

## Security & Privacy

- All connections are peer-to-peer and encrypted (DTLS/SRTP).
- No data is stored on the server except for ephemeral signaling.
- No analytics, tracking, or ads. Ever.

---

## Contributing

Pull requests, issues, and feature suggestions are welcome!

1. Fork the repo
2. Create a feature branch
3. Submit a PR

See [CONTRIBUTING.md](CONTRIBUTING.md) (coming soon).

---

## License

This project is licensed under a proprietary license. See [LICENSE](LICENSE) for details.

---

## Credits

- Inspired by [magic-wormhole](https://github.com/magic-wormhole/magic-wormhole) and [SimpleWebRTC](https://simplewebrtc.com/)
- Built with Node.js, Express, and WebRTC

---

## Questions?

Open an issue or start a discussion!

---

**Happy hacking through the wormhole!**

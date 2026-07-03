// Copyright (c) 2025-2026 Reid Carlisle <reid.carlisle@iapetustech.co>
// SPDX-License-Identifier: LicenseRef-IapetusTech-Proprietary
// server.js - Wormhole-RTC server entry point
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 8001;

let activeWsConnections = 0;
let totalWsConnections = 0;

function formatUptime(seconds) {
    const total = Math.floor(seconds);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

function getStatusPayload() {
    return {
        appName: 'Wormhole-RTC',
        retentionMode: 'none',
        uptimeSeconds: Math.floor(process.uptime()),
        uptimeHuman: formatUptime(process.uptime()),
        systemLoad: {
            oneMinute: os.loadavg()[0],
            fiveMinute: os.loadavg()[1],
            fifteenMinute: os.loadavg()[2]
        },
        websocket: {
            activeConnections: activeWsConnections,
            totalConnectionsSinceRestart: totalWsConnections
        },
        mailboxes: {
            active: mailboxes.size
        },
        nowIso: new Date().toISOString()
    };
}

// Serve the primary UI at root.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Keep backward compatibility for old link paths.
app.get('/wormhole-rtc', (req, res) => {
    res.redirect(302, '/');
});

// No-retention status API (aggregate metrics only; no identifiers).
app.get('/api/status', (req, res) => {
    res.json(getStatusPayload());
});

// Branded status dashboard.
app.get('/status', (req, res) => {
    res.sendFile(path.join(__dirname, 'status.html'));
});

app.use(express.static(__dirname));

console.log('Starting Wormhole-RTC Server...');

// Mailboxes: nameplate -> { clients: Set<WebSocket>, closed: Set<WebSocket>, messages: Array<{phase, body}> }
const mailboxes = new Map();

wss.on('connection', ws => {
    ws.nameplate = null;
    ws.isClosed = false;
    activeWsConnections += 1;
    totalWsConnections += 1;
    console.log('[SERVER] Client connected');

    ws.on('message', message => {
        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
            return;
        }
        const { type } = data;
        if (type === 'bind') {
            const { nameplate } = data;
            if (!nameplate || typeof nameplate !== 'string') {
                ws.send(JSON.stringify({ type: 'error', error: 'Missing or invalid nameplate' }));
                return;
            }
            if (ws.nameplate) {
                ws.send(JSON.stringify({ type: 'error', error: 'Already bound to a nameplate' }));
                return;
            }
            ws.nameplate = nameplate;
            if (!mailboxes.has(nameplate)) {
                mailboxes.set(nameplate, { clients: new Set(), closed: new Set(), messages: [] });
            }
            const mailbox = mailboxes.get(nameplate);
            mailbox.clients.add(ws);
            console.log(`[SERVER] Client bound to nameplate: ${nameplate}`);
            // Deliver all buffered messages to this client
            mailbox.messages.forEach(({ phase, body }) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'add', phase, body }));
                }
            });
        } else if (type === 'add') {
            const { phase, body } = data;
            if (!ws.nameplate) {
                ws.send(JSON.stringify({ type: 'error', error: 'Not bound to a nameplate' }));
                return;
            }
            if (!phase || typeof phase !== 'string') {
                ws.send(JSON.stringify({ type: 'error', error: 'Missing or invalid phase' }));
                return;
            }
            // Buffer the message in the mailbox
            const mailbox = mailboxes.get(ws.nameplate);
            if (!mailbox) {
                ws.send(JSON.stringify({ type: 'error', error: 'Mailbox not found' }));
                return;
            }
            mailbox.messages.push({ phase, body });
            // Relay to all other clients in the same mailbox (not the sender)
            mailbox.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'add', phase, body }));
                }
            });
        } else if (type === 'close') {
            if (!ws.nameplate) {
                ws.send(JSON.stringify({ type: 'error', error: 'Not bound to a nameplate' }));
                return;
            }
            ws.isClosed = true;
            const mailbox = mailboxes.get(ws.nameplate);
            if (mailbox) {
                mailbox.closed.add(ws);
                if (mailbox.closed.size === mailbox.clients.size) {
                    // All clients closed, delete mailbox
                    mailboxes.delete(ws.nameplate);
                    console.log(`[SERVER] Mailbox for nameplate ${ws.nameplate} deleted (all clients closed)`);
                }
            }
        } else {
            ws.send(JSON.stringify({ type: 'error', error: `Unknown message type: ${type}` }));
        }
    });

    ws.on('close', () => {
        if (activeWsConnections > 0) {
            activeWsConnections -= 1;
        }
        if (ws.nameplate) {
            const mailbox = mailboxes.get(ws.nameplate);
            if (mailbox) {
                mailbox.clients.delete(ws);
                mailbox.closed.delete(ws);
                if (mailbox.clients.size === 0) {
                    mailboxes.delete(ws.nameplate);
                    console.log(`[SERVER] Mailbox for nameplate ${ws.nameplate} deleted (all clients disconnected)`);
                }
            }
        }
        console.log('[SERVER] Client disconnected');
    });

    ws.on('error', err => {
        console.error('[SERVER] WebSocket error:', err);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Web client available at http://localhost:${PORT}/`);
    console.log(`Status dashboard available at http://localhost:${PORT}/status`);
    console.log('Waiting for clients to connect via WebSockets...');
});


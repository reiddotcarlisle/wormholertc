// Copyright (c) 2025-2026 Reid Carlisle <reid.carlisle@iapetustech.co>
// SPDX-License-Identifier: LicenseRef-IapetusTech-Proprietary
// wormhole-rtc.js - protocol, cryptography, and signaling logic (no UI)
import { WORD_LIST } from './wordlist.js';
import { WormholeCrypto } from './crypto.js';

const crypto = new WormholeCrypto();

// --- Utility: Generate Wormhole Code ---
function generateWormholeCode(wordCount = 2) {
    const nameplate = Math.floor(Math.random() * 900) + 100; // 3-digit number (100-999)
    const words = [];
    for (let i = 0; i < wordCount; i++) {
        const idx = Math.floor(Math.random() * WORD_LIST.length);
        words.push(WORD_LIST[idx]);
    }
    return `${nameplate}-${words.join('-')}`;
}

// --- Protocol State ---
let ws = null;
let peerConnection = null;
let dataChannel = null;
let sharedKey = null;
let isSender = false;
let currentCode = null;

// --- WebSocket helpers ---
function connectWebSocket(code, onMessage, onOpen, onClose, onError) {
    const wsUrl = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;
    const wsPath = '/';
    const socket = new WebSocket(wsUrl + wsPath);
    socket.onopen = () => onOpen && onOpen();
    socket.onclose = () => onClose && onClose();
    socket.onerror = (e) => onError && onError(e);
    socket.onmessage = (event) => onMessage && onMessage(event);
    return socket;
}

// --- Protocol Functions ---
// Only export shared helpers and state from wormhole-rtc.js now
export { generateWormholeCode };

// Copyright (c) 2025-2026 Reid Carlisle <reid.carlisle@iapetustech.co>
// SPDX-License-Identifier: LicenseRef-IapetusTech-Proprietary
// receiver.js - Magic Wormhole WebRTC Receiver for wormhole-rtc
import { normalizeWormholeCode } from './utils.js';
import { WormholeCrypto } from './crypto.js';
import { generateWormholeCode } from './wormhole-rtc.js';

const crypto = new WormholeCrypto();

if (!window.crypto || !window.crypto.subtle) {
    alert('Your browser does not support secure cryptography required for Magic Wormhole. Please use a modern browser such as Chrome, Firefox, or Edge.');
    throw new Error('Web Crypto API not available');
}

export async function receiverConnect({ code, onStep, onMessage, onConnected, onFailure }) {
    let ws, peerConnection, dataChannel, pakeKey, ecdhKeyPair, sessionKey;
    let wormholeCode = normalizeWormholeCode(code);
    let nameplate = wormholeCode.split('-')[0];
    let peerPakeReceived = false;
    let sentPake = false;
    let answerCreated = false;
    let signalingBuffer = [];
    let localSetupComplete = false;
    let protocolError = false;
    let sendData = null;

    function updateStep(step, status, msg) {
        if (onStep) onStep(step, status, msg);
    }
    function appendMsg(msg, color) {
        if (onMessage) onMessage(msg, color);
    }
    function fail(msg) {
        protocolError = true;
        if (onFailure) onFailure(msg);
    }

    function cleanupConnection() {
        try { if (dataChannel && dataChannel.readyState !== 'closed') dataChannel.close(); } catch (e) {}
        try { if (peerConnection) peerConnection.close(); } catch (e) {}
        try { if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close(); } catch (e) {}
    }

    // --- PAKE Key Derivation (PBKDF2) ---
    async function derivePakeKey(code) {
        const encoder = new TextEncoder();
        const salt = encoder.encode(code.split('-').reverse().join('-'));
        const passwordBytes = encoder.encode(code);
        const baseKey = await window.crypto.subtle.importKey('raw', passwordBytes, { name: 'PBKDF2' }, false, ['deriveKey']);
        return await window.crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    // --- WebSocket Mailbox Protocol ---
    function connectToMailbox() {
        ws = new WebSocket((window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host);
        ws.onopen = async () => {
            ws.send(JSON.stringify({ type: 'bind', nameplate }));
            appendMsg('Connected to mailbox server.', 'text-green-700');
        };
        ws.onmessage = async event => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'add' && msg.phase === 'pake') {
                await handlePeerPake(msg.body);
            } else if (msg.type === 'add' && msg.phase === 'signal') {
                await handleSignalMessage(msg.body);
            } else if (msg.type === 'error') {
                fail('Mailbox error: ' + msg.error);
                ws.close();
            }
        };
        ws.onclose = () => appendMsg('Disconnected from mailbox server.', 'text-red-700');
        ws.onerror = error => fail('WebSocket error: ' + error.message);
    }

    // --- ECDH Key Exchange ---
    async function sendBlindedPublicKey() {
        if (sentPake) return;
        sentPake = true;
        const pubJwk = await window.crypto.subtle.exportKey('jwk', ecdhKeyPair.publicKey);
        const payload = { publicKey: pubJwk };
        const encrypted = await crypto.encrypt(pakeKey, JSON.stringify(payload));
        ws.send(JSON.stringify({ type: 'add', phase: 'pake', body: encrypted }));
        appendMsg('Sent blinded public key.', 'text-green-700');
    }
    async function handlePeerPake(encrypted) {
        if (!sentPake) await sendBlindedPublicKey();
        if (peerPakeReceived) return;
        const decrypted = await crypto.decrypt(pakeKey, encrypted);
        const obj = JSON.parse(decrypted);
        if (!obj.publicKey) {
            fail('Peer public key missing.');
            return;
        }
        const peerPubKey = await window.crypto.subtle.importKey('jwk', obj.publicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
        sessionKey = await window.crypto.subtle.deriveKey({ name: 'ECDH', public: peerPubKey }, ecdhKeyPair.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        peerPakeReceived = true;
        appendMsg('Session key established.', 'text-green-700');
    }

    // --- WebRTC Setup ---
    function initializePeerConnection() {
        peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        peerConnection.onicecandidate = async (event) => {
            if (event.candidate && sessionKey) {
                const encrypted = await crypto.encrypt(sessionKey, JSON.stringify(event.candidate.toJSON()));
                ws.send(JSON.stringify({ type: 'add', phase: 'signal', body: encrypted }));
            }
        };
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            if (state === 'connected') {
                updateStep('receiverStep3Status', 'success', 'WebRTC Connection Established!');
                appendMsg('You can now send messages via the Data Channel!', 'text-green-800 font-bold');
                // Do not call onConnected here
            } else if (state === 'failed' || state === 'disconnected') {
                updateStep('receiverStep3Status', 'failure', `WebRTC connection failed: ${state}.`);
            } else if (state === 'new' || state === 'connecting') {
                updateStep('receiverStep3Status', 'active', `WebRTC connection state: ${state}`);
            }
        };
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            dataChannel.onmessage = (event) => appendMsg(`Remote: ${event.data}`, 'text-blue-700');
            dataChannel.onopen = () => {
                appendMsg('Data channel opened!', 'text-green-800');
                sendData = (msg) => dataChannel.send(msg);
                if (onConnected) onConnected(sendData, cleanupConnection, dataChannel);
            };
            dataChannel.onclose = () => appendMsg('Data channel closed.', 'text-red-700');
            dataChannel.onerror = (error) => appendMsg('Data channel error: ' + error, 'text-red-700');
        };
    }

    async function handleSignalMessage(encrypted) {
        if (!sessionKey) return;
        const decrypted = await crypto.decrypt(sessionKey, encrypted);
        const obj = JSON.parse(decrypted);
        if (obj.sdp && (obj.type === 'offer' || obj.type === 'answer')) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(obj.sdp));
            if (obj.type === 'offer') {
                appendMsg('Received and set remote SDP offer.', 'text-blue-700');
                updateStep('receiverStep2Status', 'active', 'Received SDP offer. Creating answer...');
                await createWebRTCAnswer();
            } else {
                appendMsg('Received and set remote SDP answer.', 'text-blue-700');
                updateStep('receiverStep2Status', 'success', 'Received SDP answer. Waiting for ICE candidates...');
            }
        } else if (obj.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(obj));
            appendMsg('Received and added remote ICE candidate.', 'text-blue-700');
        }
    }

    async function createWebRTCAnswer() {
        if (!sessionKey || answerCreated) return;
        answerCreated = true;
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        const payload = { sdp: peerConnection.localDescription.toJSON(), type: 'answer' };
        const encrypted = await crypto.encrypt(sessionKey, JSON.stringify(payload));
        ws.send(JSON.stringify({ type: 'add', phase: 'signal', body: encrypted }));
        appendMsg('Encrypted SDP Answer sent.', 'text-green-600');
        updateStep('receiverStep2Status', 'active', 'SDP Answer sent. Waiting for ICE candidates...');
    }

    // --- Main Receiver Flow ---
    try {
        updateStep('receiverStep1Status', 'active', 'Connecting to mailbox and preparing keys...');
        pakeKey = await derivePakeKey(wormholeCode);
        ecdhKeyPair = await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits', 'deriveKey']);
        localSetupComplete = true;
        initializePeerConnection();
        connectToMailbox();
    } catch (error) {
        fail('Error: ' + error.message);
        updateStep('receiverStep1Status', 'failure', 'Step 1 failed: Could not initiate connection.');
    }
}

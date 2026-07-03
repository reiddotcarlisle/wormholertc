// Copyright (c) 2025-2026 Reid Carlisle <reid.carlisle@iapetustech.co>
// SPDX-License-Identifier: LicenseRef-IapetusTech-Proprietary
// index-ui.js - Modern Wormhole-RTC Messenger UI logic (refactored for new layout)
import { senderGenerateAndConnect } from './sender.js';
import { receiverConnect } from './receiver.js';

// --- DOM Elements ---
const chooseMode = document.getElementById('choose-mode');
const inviteUI = document.getElementById('invite-ui');
const acceptUI = document.getElementById('accept-ui');
const chatUI = document.getElementById('chat-ui');
const inviteBtn = document.getElementById('invite-btn');
const acceptBtn = document.getElementById('accept-btn');
const inviteCodeSpan = document.getElementById('invite-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const inviteWaiting = document.getElementById('invite-waiting');
const inviteTimeoutMsg = document.getElementById('invite-timeout');
const acceptWaiting = document.getElementById('accept-waiting');
const acceptTimeoutMsg = document.getElementById('accept-timeout');
const disconnectBtn = document.getElementById('disconnect-btn');
const acceptConnectBtn = document.getElementById('accept-connect-btn');
const chatForm = document.getElementById('chat-form');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const protocolLog = document.getElementById('protocol-log');
const chatMenuBtn = document.getElementById('chat-menu-btn');
const chatMenu = document.getElementById('chat-menu');
const menuLogToggle = document.getElementById('menu-log-toggle');
const menuSettings = document.getElementById('menu-settings');
const quickLogToggle = document.getElementById('quick-log-toggle');
const headerAudioCallBtn = document.getElementById('header-audio-call-btn');
const headerVideoCallBtn = document.getElementById('header-video-call-btn');
const chatWaitingOverlay = document.getElementById('chat-waiting-overlay');
const acceptCodeInput = document.getElementById('accept-code-input');
const toastContainer = document.getElementById('toast-container');
const transferFileInput = document.getElementById('transfer-file-input');
const transferAttachBtn = document.getElementById('transfer-attach-btn');
const transferList = document.getElementById('transfer-list');
const transferListPanel = document.getElementById('transfer-list-panel');

// --- Audio Call UI Elements ---
const audioCallUI = document.getElementById('audio-call-ui');
const menuAudioCall = document.getElementById('menu-audio-call');
const iceStatusIcon = document.getElementById('ice-status-icon');
const callStatus = document.getElementById('call-status');
const callTimer = document.getElementById('call-timer');
const muteBtn = document.getElementById('mute-btn');
const volumeSlider = document.getElementById('volume-slider');
const shareScreenBtn = document.getElementById('share-screen-btn');
const hangupBtn = document.getElementById('hangup-btn');
const remoteAudio = document.getElementById('remote-audio');
const remoteVideo = document.getElementById('remote-video');
const localVideo = document.getElementById('local-video');
const videoCallStage = document.getElementById('video-call-stage');
const ringtone = document.getElementById('ringtone');

// --- Toasts ---
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// --- Collapsible Protocol Log ---
let logOpen = false;
protocolLog.classList.add('hidden');

function syncLogToggleLabels() {
  const label = logOpen ? 'Hide Protocol Log' : 'Show Protocol Log';
  menuLogToggle.innerHTML = logOpen
    ? '<i class="fa-solid fa-list"></i> Hide Protocol Log'
    : '<i class="fa-solid fa-list"></i> Protocol Log';
  if (quickLogToggle) {
    quickLogToggle.innerHTML = '<i class="fa-solid fa-list"></i>';
    quickLogToggle.setAttribute('aria-pressed', logOpen ? 'true' : 'false');
    quickLogToggle.title = label;
    quickLogToggle.setAttribute('aria-label', label);
  }
}

function setLogOpen(nextOpen) {
  logOpen = !!nextOpen;
  protocolLog.classList.toggle('hidden', !logOpen);
  if (logOpen && protocolLog.innerText.trim() === '') {
    protocolLog.innerHTML = '<div class="text-slate-300 italic">No protocol events yet. Start a connection to populate logs.</div>';
  }
  syncLogToggleLabels();
}

function toggleProtocolLog() {
  setLogOpen(!logOpen);
}

syncLogToggleLabels();

function appendLog(msg, color = '') {
  if (protocolLog.innerText.includes('No protocol events yet.')) {
    protocolLog.innerHTML = '';
  }
  protocolLog.innerHTML += `<div class="${color}">${msg}</div>`;
  protocolLog.scrollTop = protocolLog.scrollHeight;
}
protocolLog.style.overflowY = 'auto';
protocolLog.style.maxHeight = '220px';
protocolLog.addEventListener('contextmenu', function(e) {
  e.preventDefault();
  const text = protocolLog.innerText;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    showToast('Protocol log copied to clipboard!', 'info');
  }
});

function showChatWaiting(show) {
  if (show) chatWaitingOverlay.classList.remove('hidden');
  else chatWaitingOverlay.classList.add('hidden');
}

function setProtocolLogControlsVisible(visible) {
  const hide = !visible;
  if (quickLogToggle) quickLogToggle.classList.toggle('hidden', hide);
  if (menuLogToggle) menuLogToggle.classList.toggle('hidden', hide);
  if (menuAudioCall) menuAudioCall.classList.toggle('hidden', hide);
  if (headerAudioCallBtn) headerAudioCallBtn.classList.toggle('hidden', hide);
  if (headerVideoCallBtn) headerVideoCallBtn.classList.toggle('hidden', hide);
}

// --- UI State ---
let mode = null; // 'invite' or 'accept'
let wormholeCode = null;
let sendData = null;
let connected = false;
let codeReady = false;
let waitingTimeout = null;
let disconnectCleanup = null;
let dataChannelRef = null;
let pendingFileToSend = null;

const outgoingTransfers = new Map();
const incomingTransfers = new Map();

const FILE_CHUNK_SIZE = 12 * 1024;
const MAX_BUFFERED_AMOUNT = 512 * 1024;

// --- Audio Call State ---
let callState = 'idle'; // idle | calling | ringing | in-call | busy
let callTimerInterval = null;
let callStartTime = null;
let localStream = null;
let peerConnection = null;
let isMuted = false;
let isCaller = false;
let currentCallMedia = 'audio';
let pendingIncomingCallMedia = 'audio';
let preferredCameraDeviceId = null;
let screenStream = null;
let isScreenSharing = false;
let ringtoneCtx = null;
let ringtoneOscA = null;
let ringtoneOscB = null;
let ringtoneGain = null;

function sendDisconnectMessage() {
  if (dataChannelRef && dataChannelRef.readyState === 'open') {
    try { dataChannelRef.send(JSON.stringify({ type: 'disconnect' })); } catch (e) {}
  }
}

function resetUI() {
  chooseMode.classList.remove('hidden');
  inviteUI.classList.add('hidden');
  acceptUI.classList.add('hidden');
  chatUI.classList.add('hidden');
  audioCallUI.classList.add('hidden');
  protocolLog.classList.add('hidden');
  chatMessages.innerHTML = '';
  protocolLog.innerHTML = '';
  chatInput.value = '';
  sendData = null;
  connected = false;
  codeReady = false;
  wormholeCode = null;
  inviteCodeSpan.textContent = '';
  inviteWaiting.classList.remove('hidden');
  inviteTimeoutMsg.classList.add('hidden');
  acceptWaiting.classList.add('hidden');
  acceptTimeoutMsg.classList.add('hidden');
  acceptCodeInput.value = '';
  acceptCodeInput.disabled = false;
  acceptConnectBtn.disabled = false;
  resetTransferUI();
  if (waitingTimeout) clearTimeout(waitingTimeout);
  if (disconnectCleanup) disconnectCleanup();
  resetCallState();
  setLogOpen(false);
  setProtocolLogControlsVisible(false);
}

function startWaitingTimeout(type) {
  if (waitingTimeout) clearTimeout(waitingTimeout);
  let elapsed = 0;
  const max = 300;
  function tick() {
    elapsed++;
    if (elapsed >= max) {
      if (type === 'invite') {
        inviteTimeoutMsg.textContent = 'Timed out waiting for connection. Please try again.';
        inviteTimeoutMsg.classList.remove('hidden');
      } else {
        acceptTimeoutMsg.textContent = 'Timed out waiting for connection. Please try again.';
        acceptTimeoutMsg.classList.remove('hidden');
        acceptCodeInput.disabled = false;
        acceptConnectBtn.disabled = false;
      }
      showToast('Connection timed out.', 'error');
    } else {
      waitingTimeout = setTimeout(tick, 1000);
    }
  }
  waitingTimeout = setTimeout(tick, 1000);
}

inviteBtn.onclick = async () => {
  mode = 'invite';
  chooseMode.classList.add('hidden');
  inviteUI.classList.remove('hidden');
  inviteCodeSpan.textContent = 'Generating...';
  inviteWaiting.classList.remove('hidden');
  inviteTimeoutMsg.classList.add('hidden');
  showChatWaiting(true);
  startWaitingTimeout('invite');
  let cleanup;
  senderGenerateAndConnect({
    wordCount: 3,
    onCode: code => {
      wormholeCode = code;
      inviteCodeSpan.textContent = code;
      codeReady = true;
    },
    onStep: (step, status, msg) => {
      appendLog(`[Sender] ${step}: ${msg}`, status === 'failure' ? 'text-red-400' : '');
    },
    onMessage: (msg, color) => {
      if (msg.startsWith('Remote: ')) appendChatMessage(msg.replace('Remote: ', ''), 'peer');
      appendLog(`[Sender] ${msg}`, color);
    },
    onConnected: (send, cleanupFn, dataChannel) => {
      sendData = send;
      connected = true;
      inviteUI.classList.add('hidden');
      chatUI.classList.remove('hidden');
      inviteWaiting.classList.add('hidden');
      showChatWaiting(false);
      if (waitingTimeout) clearTimeout(waitingTimeout);
      showToast('Both parties connected!', 'success');
      disconnectCleanup = cleanupFn || null;
      dataChannelRef = dataChannel;
      setProtocolLogControlsVisible(true);
    },
    onFailure: (msg) => {
      showChatWaiting(false);
      showToast(msg, 'error', 5000);
    }
  });
};

copyCodeBtn.onclick = () => {
  if (wormholeCode && codeReady) {
    navigator.clipboard.writeText(wormholeCode);
    showToast('Code copied to clipboard!', 'info');
  }
};

acceptBtn.onclick = () => {
  mode = 'accept';
  chooseMode.classList.add('hidden');
  acceptUI.classList.remove('hidden');
  acceptCodeInput.focus();
  acceptWaiting.classList.add('hidden');
  acceptTimeoutMsg.classList.add('hidden');
  acceptCodeInput.disabled = false;
  acceptConnectBtn.disabled = false;
};

acceptConnectBtn.onclick = () => {
  const code = acceptCodeInput.value.trim();
  if (!code) {
    showToast('Please enter a code.', 'warning');
    return;
  }
  acceptWaiting.classList.remove('hidden');
  acceptTimeoutMsg.classList.add('hidden');
  acceptCodeInput.disabled = true;
  acceptConnectBtn.disabled = true;
  showChatWaiting(true);
  startWaitingTimeout('accept');
  let cleanup;
  receiverConnect({
    code,
    onStep: (step, status, msg) => {
      appendLog(`[Receiver] ${step}: ${msg}`, status === 'failure' ? 'text-red-400' : '');
    },
    onMessage: (msg, color) => {
      if (msg.startsWith('Remote: ')) appendChatMessage(msg.replace('Remote: ', ''), 'peer');
      appendLog(`[Receiver] ${msg}`, color);
    },
    onConnected: (send, cleanupFn, dataChannel) => {
      sendData = send;
      connected = true;
      acceptUI.classList.add('hidden');
      chatUI.classList.remove('hidden');
      acceptWaiting.classList.add('hidden');
      showChatWaiting(false);
      if (waitingTimeout) clearTimeout(waitingTimeout);
      showToast('Both parties connected!', 'success');
      disconnectCleanup = cleanupFn || null;
      dataChannelRef = dataChannel;
      setProtocolLogControlsVisible(true);
    },
    onFailure: (msg) => {
      showChatWaiting(false);
      showToast(msg, 'error', 5000);
      acceptCodeInput.disabled = false;
      acceptConnectBtn.disabled = false;
    }
  });
};

disconnectBtn.onclick = () => {
  if (disconnectCleanup) {
    sendDisconnectMessage();
    function finishCleanup() {
      if (dataChannelRef && dataChannelRef.bufferedAmount > 0) {
        setTimeout(finishCleanup, 20);
      } else {
        disconnectCleanup();
        resetUI();
        showToast('Disconnected.', 'warning');
        showChatWaiting(false);
      }
    }
    finishCleanup();
  } else {
    resetUI();
    showToast('Disconnected.', 'warning');
    showChatWaiting(false);
  }
};

// --- Chat Logic ---
chatForm.onsubmit = (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg || !sendData) return;
  sendData(msg);
  appendChatMessage(msg, 'self');
  chatInput.value = '';
};

function appendChatMessage(msg, who = 'self') {
  const div = document.createElement('div');
  div.className = who === 'self'
    ? 'self-end bg-blue-600 text-white px-4 py-2 rounded-lg max-w-xs shadow'
    : 'self-start bg-slate-200 text-slate-800 px-4 py-2 rounded-lg max-w-xs shadow';
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (who !== 'self') showToast('New message received!', 'info');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--';
  if (seconds < 1) return '<1s';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function fileSha256(file) {
  const buff = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest('SHA-256', buff);
  const view = new Uint8Array(digest);
  return Array.from(view).map(b => b.toString(16).padStart(2, '0')).join('');
}

function makeTransferId() {
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sendTransferSignal(payload) {
  if (!sendData || !connected) return false;
  sendData(JSON.stringify({ __file: true, ...payload }));
  return true;
}

function updateTransferPanelVisibility() {
  const hasCards = transferList.childElementCount > 0;
  transferListPanel.classList.toggle('hidden', !hasCards);
}

function removeTransfer(transferId, direction) {
  const state = direction === 'out' ? outgoingTransfers.get(transferId) : incomingTransfers.get(transferId);
  if (!state) return;
  if (direction === 'in' && state.downloadUrl) {
    URL.revokeObjectURL(state.downloadUrl);
  }
  if (direction === 'out') outgoingTransfers.delete(transferId);
  else incomingTransfers.delete(transferId);
  const card = document.getElementById(`transfer-${transferId}`);
  if (card) card.remove();
  updateTransferPanelVisibility();
}

function acceptIncomingTransfer(transferId) {
  const state = incomingTransfers.get(transferId);
  if (!state) return;
  state.status = 'receiving';
  state.startedAt = Date.now();
  ensureTransferCard(state, 'in');
  sendTransferSignal({ op: 'accept', transferId, resumeFrom: 0 });
}

function declineIncomingTransfer(transferId) {
  const state = incomingTransfers.get(transferId);
  if (!state) return;
  state.status = 'declined';
  ensureTransferCard(state, 'in');
  sendTransferSignal({ op: 'decline', transferId });
}

function ensureTransferCard(state, direction) {
  let card = document.getElementById(`transfer-${state.transferId}`);
  if (!card) {
    card = document.createElement('div');
    card.id = `transfer-${state.transferId}`;
    card.className = 'transfer-item';
    card.innerHTML = `
      <div class="transfer-row">
        <span class="transfer-name"></span>
        <span class="transfer-meta"></span>
      </div>
      <div class="transfer-progress-track">
        <div class="transfer-progress-fill"></div>
      </div>
      <div class="transfer-row" style="margin-top:0.45rem; margin-bottom:0;">
        <span class="transfer-stats"></span>
        <span class="transfer-eta"></span>
      </div>
      <div class="transfer-actions"></div>
    `;
    transferList.prepend(card);
    updateTransferPanelVisibility();
  }

  const nameEl = card.querySelector('.transfer-name');
  const metaEl = card.querySelector('.transfer-meta');
  const fillEl = card.querySelector('.transfer-progress-fill');
  const statsEl = card.querySelector('.transfer-stats');
  const etaEl = card.querySelector('.transfer-eta');
  const actionsEl = card.querySelector('.transfer-actions');

  const percentage = state.size > 0 ? Math.min(100, (state.bytesProcessed / state.size) * 100) : 0;
  const elapsedSeconds = Math.max(0.001, (Date.now() - state.startedAt) / 1000);
  const rate = state.bytesProcessed / elapsedSeconds;
  const remaining = Math.max(0, state.size - state.bytesProcessed);
  const eta = rate > 0 ? remaining / rate : Infinity;

  const label = direction === 'out' ? 'Sending' : 'Receiving';
  nameEl.textContent = `${label}: ${state.name}`;
  metaEl.textContent = `${state.status.toUpperCase()} • ${Math.floor(percentage)}%`;
  fillEl.style.width = `${percentage}%`;
  statsEl.textContent = `${formatBytes(state.bytesProcessed)} / ${formatBytes(state.size)}`;
  etaEl.textContent = `ETA ${state.status === 'completed' ? '0s' : formatEta(eta)}`;

  actionsEl.innerHTML = '';
  if (direction === 'in' && state.status === 'offered') {
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'transfer-action-btn';
    acceptBtn.type = 'button';
    acceptBtn.textContent = 'Accept';
    acceptBtn.onclick = () => acceptIncomingTransfer(state.transferId);
    actionsEl.appendChild(acceptBtn);

    const declineBtn = document.createElement('button');
    declineBtn.className = 'transfer-action-btn';
    declineBtn.type = 'button';
    declineBtn.textContent = 'Decline';
    declineBtn.onclick = () => declineIncomingTransfer(state.transferId);
    actionsEl.appendChild(declineBtn);
  }
  const showCancel =
    state.status === 'sending' ||
    state.status === 'receiving' ||
    (state.status === 'offered' && direction === 'out');
  if (showCancel) {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'transfer-action-btn';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => cancelTransfer(state.transferId, direction);
    actionsEl.appendChild(cancelBtn);
  }
  if (direction === 'out' && (state.status === 'failed' || state.status === 'cancelled')) {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'transfer-action-btn';
    retryBtn.type = 'button';
    retryBtn.textContent = 'Retry';
    retryBtn.onclick = () => retryOutgoingTransfer(state.transferId);
    actionsEl.appendChild(retryBtn);
  }
  if (direction === 'in' && state.status === 'paused') {
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'transfer-action-btn';
    resumeBtn.type = 'button';
    resumeBtn.textContent = 'Request Resume';
    resumeBtn.onclick = () => requestTransferResume(state.transferId);
    actionsEl.appendChild(resumeBtn);
  }
  if (direction === 'in' && state.status === 'completed' && state.downloadUrl) {
    const saveLink = document.createElement('a');
    saveLink.className = 'transfer-action-btn';
    saveLink.href = state.downloadUrl;
    saveLink.download = state.name;
    saveLink.textContent = 'Save File';
    actionsEl.appendChild(saveLink);
  }
  if (['completed', 'failed', 'cancelled', 'declined'].includes(state.status)) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'transfer-action-btn';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = () => removeTransfer(state.transferId, direction);
    actionsEl.appendChild(deleteBtn);
  }
}

function resetTransferUI() {
  incomingTransfers.forEach(state => {
    if (state.downloadUrl) {
      URL.revokeObjectURL(state.downloadUrl);
    }
  });
  pendingFileToSend = null;
  transferFileInput.value = '';
  transferList.innerHTML = '';
  outgoingTransfers.clear();
  incomingTransfers.clear();
  updateTransferPanelVisibility();
}

function updateTransferCardForId(transferId, direction) {
  const state = direction === 'out' ? outgoingTransfers.get(transferId) : incomingTransfers.get(transferId);
  if (!state) return;
  ensureTransferCard(state, direction);
}

async function waitForBufferDrain() {
  while (dataChannelRef && dataChannelRef.readyState === 'open' && dataChannelRef.bufferedAmount > MAX_BUFFERED_AMOUNT) {
    await sleep(20);
  }
}

async function sendChunkRange(state, startIndex = 0) {
  if (!dataChannelRef || dataChannelRef.readyState !== 'open') {
    state.status = 'failed';
    updateTransferCardForId(state.transferId, 'out');
    return;
  }
  state.status = 'sending';
  if (!state.startedAt) state.startedAt = Date.now();
  updateTransferCardForId(state.transferId, 'out');

  for (let idx = startIndex; idx < state.totalChunks; idx += 1) {
    if (state.status !== 'sending') return;
    const start = idx * state.chunkSize;
    const end = Math.min(state.size, start + state.chunkSize);
    const chunkBuffer = await state.file.slice(start, end).arrayBuffer();
    const payload = {
      op: 'chunk',
      transferId: state.transferId,
      index: idx,
      data: uint8ToBase64(new Uint8Array(chunkBuffer))
    };
    await waitForBufferDrain();
    if (!sendTransferSignal(payload)) {
      state.status = 'failed';
      updateTransferCardForId(state.transferId, 'out');
      return;
    }
    state.bytesProcessed = end;
    state.lastSentChunk = idx;
    updateTransferCardForId(state.transferId, 'out');
  }
  sendTransferSignal({ op: 'complete', transferId: state.transferId });
}

async function beginFileTransfer(file) {
  const transferId = makeTransferId();
  const hash = await fileSha256(file);
  const state = {
    transferId,
    file,
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    hash,
    chunkSize: FILE_CHUNK_SIZE,
    totalChunks: Math.ceil(file.size / FILE_CHUNK_SIZE),
    bytesProcessed: 0,
    lastAckedChunk: -1,
    lastSentChunk: -1,
    status: 'offered',
    startedAt: Date.now()
  };
  outgoingTransfers.set(transferId, state);
  ensureTransferCard(state, 'out');

  sendTransferSignal({
    op: 'offer',
    transferId,
    name: state.name,
    size: state.size,
    mime: state.mime,
    hash: state.hash,
    chunkSize: state.chunkSize,
    totalChunks: state.totalChunks
  });
  showToast(`Offered file: ${file.name}`, 'info');
}

function handleTransferOffer(msg) {
  const state = {
    transferId: msg.transferId,
    name: msg.name,
    size: msg.size,
    mime: msg.mime,
    hash: msg.hash,
    chunkSize: msg.chunkSize,
    totalChunks: msg.totalChunks,
    chunks: new Map(),
    bytesProcessed: 0,
    status: 'offered',
    startedAt: Date.now(),
    downloadUrl: null
  };
  incomingTransfers.set(msg.transferId, state);
  ensureTransferCard(state, 'in');
  showToast(`Incoming file offer: ${msg.name}`, 'info');
}

function handleTransferChunk(msg) {
  const state = incomingTransfers.get(msg.transferId);
  if (!state || state.status === 'cancelled') return;
  const bytes = base64ToUint8(msg.data);
  if (!state.chunks.has(msg.index)) {
    state.chunks.set(msg.index, bytes);
    state.bytesProcessed += bytes.byteLength;
  }
  state.status = 'receiving';
  ensureTransferCard(state, 'in');
  sendTransferSignal({ op: 'ack', transferId: msg.transferId, index: msg.index, receivedBytes: state.bytesProcessed });
}

function buildReceivedBlob(state) {
  const parts = [];
  for (let i = 0; i < state.totalChunks; i += 1) {
    const part = state.chunks.get(i);
    if (!part) return null;
    parts.push(part);
  }
  return new Blob(parts, { type: state.mime || 'application/octet-stream' });
}

async function finalizeIncomingTransfer(transferId) {
  const state = incomingTransfers.get(transferId);
  if (!state) return;
  const blob = buildReceivedBlob(state);
  if (!blob) {
    state.status = 'failed';
    ensureTransferCard(state, 'in');
    sendTransferSignal({ op: 'verified', transferId, ok: false, reason: 'missing-chunks' });
    return;
  }
  const digest = await window.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const computed = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (computed !== state.hash) {
    state.status = 'failed';
    ensureTransferCard(state, 'in');
    sendTransferSignal({ op: 'verified', transferId, ok: false, reason: 'hash-mismatch' });
    showToast(`File integrity check failed: ${state.name}`, 'error', 4500);
    return;
  }
  state.status = 'completed';
  state.bytesProcessed = state.size;
  if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
  state.downloadUrl = URL.createObjectURL(blob);
  ensureTransferCard(state, 'in');
  sendTransferSignal({ op: 'verified', transferId, ok: true });
  showToast(`File received: ${state.name}`, 'success', 3500);
}

function handleTransferAck(msg) {
  const state = outgoingTransfers.get(msg.transferId);
  if (!state) return;
  state.lastAckedChunk = Math.max(state.lastAckedChunk, msg.index);
  state.bytesProcessed = Math.max(state.bytesProcessed, msg.receivedBytes || 0);
  ensureTransferCard(state, 'out');
}

function cancelTransfer(transferId, direction) {
  const state = direction === 'out' ? outgoingTransfers.get(transferId) : incomingTransfers.get(transferId);
  if (!state) return;
  if (direction === 'in' && state.status === 'offered') {
    declineIncomingTransfer(transferId);
    return;
  }
  state.status = 'cancelled';
  ensureTransferCard(state, direction);
  sendTransferSignal({ op: 'cancel', transferId });
  showToast(`Transfer cancelled: ${state.name}`, 'warning');
}

function requestTransferResume(transferId) {
  const state = incomingTransfers.get(transferId);
  if (!state) return;
  let resumeFrom = 0;
  for (let i = 0; i < state.totalChunks; i += 1) {
    if (!state.chunks.has(i)) {
      resumeFrom = i;
      break;
    }
    resumeFrom = i + 1;
  }
  state.status = 'paused';
  ensureTransferCard(state, 'in');
  sendTransferSignal({ op: 'resume-request', transferId, fromIndex: resumeFrom });
}

function retryOutgoingTransfer(transferId) {
  const state = outgoingTransfers.get(transferId);
  if (!state || !state.file) return;
  const resumeFrom = Math.max(0, state.lastAckedChunk + 1);
  state.status = 'sending';
  ensureTransferCard(state, 'out');
  sendChunkRange(state, resumeFrom);
}

function handleTransferControl(msg) {
  switch (msg.op) {
    case 'offer':
      handleTransferOffer(msg);
      break;
    case 'accept': {
      const state = outgoingTransfers.get(msg.transferId);
      if (!state) break;
      const resumeFrom = Number.isInteger(msg.resumeFrom) ? msg.resumeFrom : 0;
      sendChunkRange(state, Math.max(0, resumeFrom));
      break;
    }
    case 'decline': {
      const state = outgoingTransfers.get(msg.transferId);
      if (!state) break;
      state.status = 'declined';
      ensureTransferCard(state, 'out');
      showToast(`Peer declined transfer: ${state.name}`, 'warning');
      break;
    }
    case 'chunk':
      handleTransferChunk(msg);
      break;
    case 'ack':
      handleTransferAck(msg);
      break;
    case 'complete':
      finalizeIncomingTransfer(msg.transferId);
      break;
    case 'verified': {
      const state = outgoingTransfers.get(msg.transferId);
      if (!state) break;
      state.status = msg.ok ? 'completed' : 'failed';
      if (msg.ok) {
        state.bytesProcessed = state.size;
        showToast(`File delivered: ${state.name}`, 'success', 3200);
      } else {
        showToast(`Peer reported transfer issue: ${state.name}`, 'error', 4500);
      }
      ensureTransferCard(state, 'out');
      break;
    }
    case 'cancel': {
      const outState = outgoingTransfers.get(msg.transferId);
      const inState = incomingTransfers.get(msg.transferId);
      if (outState) {
        outState.status = 'cancelled';
        ensureTransferCard(outState, 'out');
      }
      if (inState) {
        inState.status = 'cancelled';
        ensureTransferCard(inState, 'in');
      }
      break;
    }
    case 'resume-request': {
      const state = outgoingTransfers.get(msg.transferId);
      if (!state) break;
      const fromIndex = Number.isInteger(msg.fromIndex) ? msg.fromIndex : 0;
      sendChunkRange(state, Math.max(0, fromIndex));
      break;
    }
  }
}

async function queueOrSendPickedFile(file, source = 'picker') {
  if (!file) return;
  pendingFileToSend = file;
  if (!connected || !sendData) {
    showToast('Connect first before sending files.', 'warning');
    return;
  }
  try {
    await beginFileTransfer(file);
    showToast(`File queued from ${source}: ${file.name}`, 'info');
  } catch (err) {
    showToast(`File transfer setup failed: ${err.message}`, 'error', 4500);
  } finally {
    pendingFileToSend = null;
    transferFileInput.value = '';
  }
}

transferAttachBtn.onclick = () => transferFileInput.click();

transferFileInput.onchange = () => {
  const file = transferFileInput.files && transferFileInput.files[0] ? transferFileInput.files[0] : null;
  queueOrSendPickedFile(file, 'paperclip');
};

chatInput.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  transferFileInput.click();
});

chatInput.addEventListener('dragover', (event) => {
  event.preventDefault();
  chatInput.classList.add('ring-2', 'ring-cyan-500');
});

chatInput.addEventListener('dragleave', () => {
  chatInput.classList.remove('ring-2', 'ring-cyan-500');
});

chatInput.addEventListener('drop', (event) => {
  event.preventDefault();
  chatInput.classList.remove('ring-2', 'ring-cyan-500');
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]
    ? event.dataTransfer.files[0]
    : null;
  queueOrSendPickedFile(file, 'drag-drop');
});

// --- Menu logic ---
function closeChatMenu() {
  chatMenu.classList.add('hidden');
}

function onMenuLogToggle() {
  toggleProtocolLog();
  closeChatMenu();
}

function onMenuSettings() {
  showSettingsModal(true, 'about');
  closeChatMenu();
}

function onMenuAudioCall() {
  if (!menuAudioCall.disabled) {
    startOutgoingCall('audio');
  }
  closeChatMenu();
}

chatMenuBtn.onclick = (e) => {
  e.stopPropagation();
  chatMenu.classList.toggle('hidden');
};
chatMenu.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();

  const target = e.target;
  const targetEl = target instanceof Element ? target : target && target.parentElement ? target.parentElement : null;
  const btn = targetEl ? targetEl.closest('button') : null;
  if (!btn) return;

  if (btn.id === 'menu-log-toggle') {
    onMenuLogToggle();
    return;
  }

  if (btn.id === 'menu-settings') {
    onMenuSettings();
    return;
  }

  if (btn.id === 'menu-audio-call') {
    onMenuAudioCall();
  }
});
document.body.addEventListener('click', () => {
  closeChatMenu();
});

// Direct button handlers as a fallback for browsers/events where delegated target resolution is inconsistent.
menuLogToggle.onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  onMenuLogToggle();
};

menuSettings.onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  onMenuSettings();
};

menuAudioCall.onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  onMenuAudioCall();
};

if (quickLogToggle) {
  quickLogToggle.onclick = (e) => {
    e.preventDefault();
    toggleProtocolLog();
  };
}

// --- Settings Modal Logic ---
const audioSettingsBtn = document.getElementById('audio-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsTabAbout = document.getElementById('settings-tab-about');
const settingsTabAudio = document.getElementById('settings-tab-audio');
const settingsTabVideo = document.getElementById('settings-tab-video');
const settingsPanelAbout = document.getElementById('settings-panel-about');
const settingsPanelAudio = document.getElementById('settings-panel-audio');
const settingsPanelVideo = document.getElementById('settings-panel-video');
const micSelect = document.getElementById('mic-select');
const speakerSelect = document.getElementById('speaker-select');
const cameraSelect = document.getElementById('camera-select');
const videoQualitySelect = document.getElementById('video-quality-select');
const closeSettingsBtn = document.getElementById('close-settings-btn');

function setSettingsTab(tab) {
  const tabs = [
    { name: 'about', btn: settingsTabAbout, panel: settingsPanelAbout },
    { name: 'audio', btn: settingsTabAudio, panel: settingsPanelAudio },
    { name: 'video', btn: settingsTabVideo, panel: settingsPanelVideo }
  ];
  tabs.forEach(item => {
    const active = item.name === tab;
    item.btn.classList.toggle('active', active);
    item.panel.classList.toggle('active', active);
  });
}

function showSettingsModal(show, tab = 'about') {
  settingsModal.classList.toggle('hidden', !show);
  if (show) {
    setSettingsTab(tab);
    populateAudioDevices();
    populateVideoDevices();
  }
}

audioSettingsBtn.onclick = () => showSettingsModal(true, 'audio');
closeSettingsBtn.onclick = () => showSettingsModal(false);
settingsTabAbout.onclick = () => setSettingsTab('about');
settingsTabAudio.onclick = () => setSettingsTab('audio');
settingsTabVideo.onclick = () => setSettingsTab('video');

// Populate device lists
async function populateAudioDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  micSelect.innerHTML = '';
  speakerSelect.innerHTML = '';
  devices.filter(d => d.kind === 'audioinput').forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Microphone ${micSelect.length + 1}`;
    micSelect.appendChild(opt);
  });
  devices.filter(d => d.kind === 'audiooutput').forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Speaker ${speakerSelect.length + 1}`;
    speakerSelect.appendChild(opt);
  });
  // Set current
  if (localStream && localStream.getAudioTracks().length) {
    const track = localStream.getAudioTracks()[0];
    if (track.getSettings && track.getSettings().deviceId) {
      micSelect.value = track.getSettings().deviceId;
    }
  }
}

function populateVideoDevices() {
  navigator.mediaDevices.enumerateDevices().then(devices => {
    cameraSelect.innerHTML = '';
    devices.filter(d => d.kind === 'videoinput').forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Camera ${cameraSelect.length + 1}`;
      cameraSelect.appendChild(opt);
    });
    if (preferredCameraDeviceId) cameraSelect.value = preferredCameraDeviceId;
  });
}

function getVideoConstraints() {
  const quality = videoQualitySelect ? videoQualitySelect.value : 'medium';
  if (quality === 'low') return { width: { ideal: 640 }, height: { ideal: 360 } };
  if (quality === 'high') return { width: { ideal: 1920 }, height: { ideal: 1080 } };
  return { width: { ideal: 1280 }, height: { ideal: 720 } };
}
// Change mic
micSelect.onchange = async () => {
  if (!micSelect.value) return;
  const replacement = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: micSelect.value } } });
  const newTrack = replacement.getAudioTracks()[0];
  if (peerConnection) {
    const senders = peerConnection.getSenders().filter(s => s.track && s.track.kind === 'audio');
    await Promise.all(senders.map(s => s.replaceTrack(newTrack)));
  }
  if (localStream) {
    localStream.getAudioTracks().forEach(t => {
      localStream.removeTrack(t);
      t.stop();
    });
    localStream.addTrack(newTrack);
  }
};
// Change speaker
speakerSelect.onchange = () => {
  if (remoteAudio && remoteAudio.setSinkId) {
    remoteAudio.setSinkId(speakerSelect.value).catch(() => {});
  }
};

cameraSelect.onchange = async () => {
  preferredCameraDeviceId = cameraSelect.value || null;
  if (!localStream || currentCallMedia !== 'video') return;
  const camStream = await navigator.mediaDevices.getUserMedia({
    video: {
      ...getVideoConstraints(),
      ...(preferredCameraDeviceId ? { deviceId: { exact: preferredCameraDeviceId } } : {})
    }
  });
  const newVideoTrack = camStream.getVideoTracks()[0];
  if (peerConnection) {
    const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) await sender.replaceTrack(newVideoTrack);
  }
  localStream.getVideoTracks().forEach(t => {
    localStream.removeTrack(t);
    t.stop();
  });
  localStream.addTrack(newVideoTrack);
  localVideo.srcObject = localStream;
};

function startOutgoingCall(media) {
  if (!connected || callState !== 'idle') return;
  isCaller = true;
  currentCallMedia = media === 'video' ? 'video' : 'audio';
  updateCallUI('calling');
  sendCallSignal('offer', { media: currentCallMedia });
}

headerAudioCallBtn.onclick = () => startOutgoingCall('audio');
headerVideoCallBtn.onclick = () => startOutgoingCall('video');

// --- Incoming Call Modal Logic ---
const incomingCallModal = document.getElementById('incoming-call-modal');
const incomingCallCard = document.getElementById('incoming-call-card');
const acceptCallBtn = document.getElementById('accept-call-btn');
const declineCallBtn = document.getElementById('decline-call-btn');
const incomingCallTitle = document.getElementById('incoming-call-title');
const incomingCallSubtitle = document.getElementById('incoming-call-subtitle');
function showIncomingCallPopup() {
  incomingCallTitle.textContent = pendingIncomingCallMedia === 'video' ? 'Incoming Video Call' : 'Incoming Audio Call';
  incomingCallSubtitle.textContent = pendingIncomingCallMedia === 'video'
    ? 'Camera and microphone will be requested if accepted.'
    : 'Do you want to accept?';
  incomingCallModal.classList.remove('hidden');
  incomingCallCard.classList.add('incoming-call-animate');
  // Play ringtone for incoming call
  startRingtone();
}
acceptCallBtn.onclick = () => {
  incomingCallModal.classList.add('hidden');
  incomingCallCard.classList.remove('incoming-call-animate');
  currentCallMedia = pendingIncomingCallMedia;
  sendCallSignal('answer', { media: currentCallMedia });
  startWebRTCCall(false, currentCallMedia);
  updateCallUI('in-call', 'In Call');
  stopRingtone();
};
declineCallBtn.onclick = () => {
  incomingCallModal.classList.add('hidden');
  incomingCallCard.classList.remove('incoming-call-animate');
  sendCallSignal('decline');
  resetCallState();
  stopRingtone();
};
// Hide modal if call state changes
function hideIncomingCallModal() {
  incomingCallModal.classList.add('hidden');
  incomingCallCard.classList.remove('incoming-call-animate');
}
// Patch updateCallUI to hide modal and stop ringtone on state change
const origUpdateCallUI = updateCallUI;
updateCallUI = function(state, statusText) {
  origUpdateCallUI(state, statusText);
  if (state !== 'ringing') hideIncomingCallModal();
  if (state !== 'calling' && state !== 'ringing') stopRingtone();
};
// Patch startRingtone to always play on both ends when calling or ringing
const origStartRingtone = startRingtone;
startRingtone = function() {
  ringtone.currentTime = 0;
  ringtone.loop = true;
  ringtone.play().catch(() => {});
};

// --- Audio Call Helpers ---
function updateCallUI(state, statusText = '') {
  callState = state;
  switch (state) {
    case 'idle':
      audioCallUI.classList.add('hidden');
      callStatus.textContent = 'Not in call';
      callTimer.classList.add('hidden');
      stopCallTimer();
      stopRingtone();
      menuAudioCall.disabled = false;
      break;
    case 'calling':
      audioCallUI.classList.remove('hidden');
      callStatus.textContent = 'Calling...';
      callTimer.classList.add('hidden');
      startRingtone();
      menuAudioCall.disabled = true;
      break;
    case 'ringing':
      audioCallUI.classList.remove('hidden');
      callStatus.textContent = 'Incoming call...';
      callTimer.classList.add('hidden');
      startRingtone();
      menuAudioCall.disabled = true;
      break;
    case 'in-call':
      audioCallUI.classList.remove('hidden');
      callStatus.textContent = statusText || 'In Call';
      callTimer.classList.remove('hidden');
      startCallTimer();
      stopRingtone();
      menuAudioCall.disabled = true;
      break;
    case 'busy':
      audioCallUI.classList.remove('hidden');
      callStatus.textContent = 'Peer is busy';
      callTimer.classList.add('hidden');
      stopCallTimer();
      stopRingtone();
      menuAudioCall.disabled = true;
      setTimeout(() => updateCallUI('idle'), 2000);
      break;
  }
  updateICEIcon('disconnected');
}
function updateICEIcon(state) {
  // state: 'disconnected', 'checking', 'connected', 'failed'
  iceStatusIcon.className = 'fa-solid fa-circle text-lg';
  switch (state) {
    case 'connected':
      iceStatusIcon.classList.add('text-green-500');
      iceStatusIcon.title = 'ICE Status: Connected';
      break;
    case 'checking':
      iceStatusIcon.classList.add('fa-circle-notch', 'fa-spin', 'text-blue-400');
      iceStatusIcon.title = 'ICE Status: Connecting...';
      break;
    case 'failed':
      iceStatusIcon.classList.add('text-red-400');
      iceStatusIcon.title = 'ICE Status: Failed';
      break;
    default:
      iceStatusIcon.classList.add('text-gray-400');
      iceStatusIcon.title = 'ICE Status: Disconnected';
  }
}
function startCallTimer() {
  callStartTime = Date.now();
  callTimer.classList.remove('hidden');
  callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    callTimer.textContent = `${min}:${sec}`;
  }, 1000);
}
function stopCallTimer() {
  if (callTimerInterval) clearInterval(callTimerInterval);
  callTimerInterval = null;
  callTimer.textContent = '';
}
function startRingtone() {
  if (ringtone && ringtone.src) {
    ringtone.loop = true;
    ringtone.currentTime = 0;
    ringtone.play().catch(() => {
      // Fallback: synthesized ringtone when autoplay policy blocks media element playback.
      try {
        if (!ringtoneCtx) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          ringtoneCtx = new Ctx();
        }
        if (ringtoneCtx.state === 'suspended') {
          ringtoneCtx.resume().catch(() => {});
        }
        if (ringtoneOscA || ringtoneOscB) return;

        ringtoneGain = ringtoneCtx.createGain();
        ringtoneGain.gain.value = 0.0001;
        ringtoneGain.connect(ringtoneCtx.destination);

        ringtoneOscA = ringtoneCtx.createOscillator();
        ringtoneOscA.type = 'sine';
        ringtoneOscA.frequency.value = 880;
        ringtoneOscA.connect(ringtoneGain);

        ringtoneOscB = ringtoneCtx.createOscillator();
        ringtoneOscB.type = 'sine';
        ringtoneOscB.frequency.value = 1175;
        ringtoneOscB.connect(ringtoneGain);

        const now = ringtoneCtx.currentTime;
        for (let i = 0; i < 8; i += 1) {
          const t = now + i * 0.6;
          ringtoneGain.gain.setValueAtTime(0.0001, t);
          ringtoneGain.gain.exponentialRampToValueAtTime(0.08, t + 0.04);
          ringtoneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
        }

        ringtoneOscA.start();
        ringtoneOscB.start();
      } catch (e) {}
    });
    return;
  }
}
function stopRingtone() {
  try {
    if (ringtone) {
      ringtone.pause();
      ringtone.currentTime = 0;
    }
  } catch (e) {}
  try {
    if (ringtoneOscA) {
      ringtoneOscA.stop();
      ringtoneOscA.disconnect();
      ringtoneOscA = null;
    }
    if (ringtoneOscB) {
      ringtoneOscB.stop();
      ringtoneOscB.disconnect();
      ringtoneOscB = null;
    }
    if (ringtoneGain) {
      ringtoneGain.disconnect();
      ringtoneGain = null;
    }
  } catch (e) {}
}

function updateShareScreenButton() {
  const show = callState === 'in-call';
  shareScreenBtn.classList.toggle('hidden', !show);
  shareScreenBtn.title = isScreenSharing ? 'Stop Sharing Screen' : 'Share Screen';
  shareScreenBtn.innerHTML = isScreenSharing
    ? '<i class="fa-solid fa-stop"></i>'
    : '<i class="fa-solid fa-display"></i>';
}

async function renegotiatePeerConnection() {
  if (!peerConnection || peerConnection.signalingState !== 'stable') return;
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendCallSignal('webrtc-offer', { sdp: offer.sdp, media: currentCallMedia });
}

async function stopScreenShare() {
  if (!isScreenSharing) return;
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  isScreenSharing = false;
  if (!peerConnection) {
    updateShareScreenButton();
    return;
  }
  const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
  if (sender) {
    if (currentCallMedia === 'video') {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: {
          ...getVideoConstraints(),
          ...(preferredCameraDeviceId ? { deviceId: { exact: preferredCameraDeviceId } } : {})
        }
      });
      const camTrack = cam.getVideoTracks()[0];
      await sender.replaceTrack(camTrack);
      if (localStream) {
        localStream.getVideoTracks().forEach(t => {
          localStream.removeTrack(t);
          t.stop();
        });
        localStream.addTrack(camTrack);
        localVideo.srcObject = localStream;
        videoCallStage.classList.remove('hidden');
      }
    } else {
      peerConnection.removeTrack(sender);
      if (localStream) {
        localStream.getVideoTracks().forEach(t => {
          localStream.removeTrack(t);
          t.stop();
        });
      }
      videoCallStage.classList.add('hidden');
      await renegotiatePeerConnection();
    }
  }
  updateShareScreenButton();
}

async function startScreenShare() {
  if (!peerConnection || callState !== 'in-call') return;
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) {
      await sender.replaceTrack(screenTrack);
    } else if (localStream) {
      peerConnection.addTrack(screenTrack, localStream);
      localStream.addTrack(screenTrack);
      await renegotiatePeerConnection();
    }
    if (localStream) {
      localStream.getVideoTracks().forEach(t => {
        localStream.removeTrack(t);
        t.stop();
      });
      localStream.addTrack(screenTrack);
      localVideo.srcObject = localStream;
      videoCallStage.classList.remove('hidden');
    }
    isScreenSharing = true;
    screenTrack.onended = () => {
      stopScreenShare().catch(() => {});
    };
    updateShareScreenButton();
  } catch (err) {
    showToast(`Screen share unavailable: ${err.message}`, 'warning');
  }
}

shareScreenBtn.onclick = async () => {
  if (isScreenSharing) await stopScreenShare();
  else await startScreenShare();
};

function resetCallState() {
  updateCallUI('idle');
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  remoteAudio.srcObject = null;
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  videoCallStage.classList.add('hidden');
  isScreenSharing = false;
  currentCallMedia = 'audio';
  pendingIncomingCallMedia = 'audio';
  updateShareScreenButton();
  isMuted = false;
  muteBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
  volumeSlider.value = 100;
}

// --- Audio Call Signaling ---
function sendCallSignal(type, data = {}) {
  if (sendData) sendData(JSON.stringify({ __call: true, type, ...data }));
}

// --- Call Control Buttons ---
hangupBtn.onclick = () => {
  if (callState === 'in-call' || callState === 'calling' || callState === 'ringing') {
    sendCallSignal('hangup');
    resetCallState();
    showToast('Call ended.', 'info');
  }
};

muteBtn.onclick = () => {
  isMuted = !isMuted;
  if (localStream) {
    localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
  }
  muteBtn.innerHTML = isMuted
    ? '<i class="fa-solid fa-microphone-slash"></i>'
    : '<i class="fa-solid fa-microphone"></i>';
};

volumeSlider.oninput = () => {
  remoteAudio.volume = volumeSlider.value / 100;
};

// --- Handle Incoming Call Signals ---
function handleCallSignal(msg) {
  if (!msg.__call) return false;
  switch (msg.type) {
    case 'offer':
      if (callState !== 'idle') {
        sendCallSignal('busy');
        updateCallUI('busy');
        return true;
      }
      isCaller = false;
      pendingIncomingCallMedia = msg.media === 'video' ? 'video' : 'audio';
      updateCallUI('ringing');
      showIncomingCallPopup();
      return true;
    case 'answer':
      if (callState === 'calling') {
        currentCallMedia = msg.media === 'video' ? 'video' : currentCallMedia;
        startWebRTCCall(true, currentCallMedia);
        updateCallUI('in-call', 'In Call');
      }
      return true;
    case 'decline':
      if (callState === 'calling') {
        showToast('Call declined.', 'warning');
        resetCallState();
      }
      return true;
    case 'hangup':
      if (callState === 'in-call' || callState === 'ringing' || callState === 'calling') {
        showToast('Call ended by peer.', 'info');
        resetCallState();
      }
      return true;
    case 'busy':
      if (callState === 'calling') {
        showToast('Peer is busy.', 'warning');
        updateCallUI('busy');
      }
      return true;
  }
  return false;
}

// --- WebRTC Call Logic ---
async function startWebRTCCall(isInitiator, media = 'audio') {
  stopRingtone();
  updateICEIcon('checking');
  currentCallMedia = media === 'video' ? 'video' : 'audio';
  peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  peerConnection.oniceconnectionstatechange = () => {
    if (!peerConnection) return;
    switch (peerConnection.iceConnectionState) {
      case 'connected':
      case 'completed':
        updateICEIcon('connected');
        break;
      case 'checking':
        updateICEIcon('checking');
        break;
      case 'failed':
        updateICEIcon('failed');
        break;
      default:
        updateICEIcon('disconnected');
    }
  };
  peerConnection.ontrack = (e) => {
    const remoteStream = e.streams[0];
    remoteAudio.srcObject = remoteStream;
    remoteAudio.classList.remove('hidden');
    const hasVideo = remoteStream.getVideoTracks && remoteStream.getVideoTracks().length > 0;
    if (hasVideo) {
      remoteVideo.srcObject = remoteStream;
      videoCallStage.classList.remove('hidden');
    } else if (!isScreenSharing && currentCallMedia !== 'video') {
      videoCallStage.classList.add('hidden');
    }
  };
  const constraints = {
    audio: true,
    video: currentCallMedia === 'video'
      ? { ...getVideoConstraints(), ...(preferredCameraDeviceId ? { deviceId: { exact: preferredCameraDeviceId } } : {}) }
      : false
  };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  if (currentCallMedia === 'video') {
    localVideo.srcObject = localStream;
    videoCallStage.classList.remove('hidden');
  } else {
    videoCallStage.classList.add('hidden');
  }
  updateShareScreenButton();

  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendCallSignal('webrtc-offer', { sdp: offer.sdp, media: currentCallMedia });
  }

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendCallSignal('webrtc-candidate', { candidate: event.candidate });
    }
  };
}

// --- Handle WebRTC Signaling ---
async function handleWebRTCSignal(msg) {
  if (!peerConnection && msg.type === 'webrtc-offer') {
    await startWebRTCCall(false, msg.media || currentCallMedia);
  }
  if (!peerConnection) return;

  if (msg.type === 'webrtc-offer') {
    if (msg.media) currentCallMedia = msg.media;
    await peerConnection.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    sendCallSignal('webrtc-answer', { sdp: answer.sdp, media: currentCallMedia });
  } else if (msg.type === 'webrtc-answer') {
    if (msg.media) currentCallMedia = msg.media;
    await peerConnection.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
  } else if (msg.type === 'webrtc-candidate') {
    try {
      await peerConnection.addIceCandidate(msg.candidate);
    } catch (e) {}
  }
}

// --- Patch Data Channel Message Handler ---
const origAppendChatMessage = appendChatMessage;
appendChatMessage = function(msg, who = 'self') {
  // Intercept structured control messages (calls, file transfer).
  try {
    const parsed = JSON.parse(msg);
    if (parsed.type === 'disconnect') {
      if (disconnectCleanup) {
        const cleanup = disconnectCleanup;
        disconnectCleanup = null;
        cleanup();
      }
      resetUI();
      showToast('Peer disconnected.', 'warning');
      return;
    }
    if (parsed.__file) {
      handleTransferControl(parsed);
      return;
    }
    if (parsed.__call) {
      if (parsed.type && parsed.type.startsWith('webrtc-')) {
        handleWebRTCSignal(parsed);
        return;
      }
      if (handleCallSignal(parsed)) return;
    }
  } catch (e) {}
  origAppendChatMessage(msg, who);
};

window.addEventListener('beforeunload', () => {
  if (connected) showToast('You have disconnected.', 'warning');
});

resetUI();

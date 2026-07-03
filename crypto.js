// Copyright (c) 2025-2026 Reid Carlisle <reid.carlisle@iapetustech.co>
// SPDX-License-Identifier: LicenseRef-IapetusTech-Proprietary
// crypto.js - cryptography helpers for wormhole-rtc

if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
    alert('Your browser does not support secure cryptography required for Magic Wormhole. Please use a modern browser such as Chrome, Firefox, or Edge.');
    throw new Error('Web Crypto API not available');
}

export class WormholeCrypto {
    // --- Static helpers for base64 encoding/decoding of Uint8Array ---
    static uint8ToBase64(uint8) {
        // Robust base64 encoding for Uint8Array (handles arbitrary binary data)
        let binary = '';
        for (let i = 0; i < uint8.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, uint8.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    }
    static base64ToUint8(base64) {
        const binary = atob(base64);
        const uint8 = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; ++i) {
            uint8[i] = binary.charCodeAt(i);
        }
        return uint8;
    }
    static uint8ToHex(uint8) {
        return Array.from(uint8).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async generateKeyPair() {
        return await window.crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveKey', 'deriveBits']
        );
    }

    async exportPublicKey(key, context = '') {
        const raw = await window.crypto.subtle.exportKey('raw', key);
        const uint8 = new Uint8Array(raw);
        const base64 = WormholeCrypto.uint8ToBase64(uint8);
        console.log(`[WormholeCrypto][exportPublicKey]${context ? '['+context+']' : ''} Exported public key bytes:`, uint8.length);
        return base64;
    }

    async importPublicKey(base64, context = '') {
        const raw = WormholeCrypto.base64ToUint8(base64);
        console.log(`[WormholeCrypto][importPublicKey]${context ? '['+context+']' : ''} Importing public key bytes:`, raw.length);
        const key = await window.crypto.subtle.importKey(
            'raw', raw.buffer, { name: 'ECDH', namedCurve: 'P-256' }, false, []
        );
        return key;
    }

    async deriveSharedKey(privateKey, publicKey) {
        // Always derive with both usages
        const key = await window.crypto.subtle.deriveKey(
            { name: 'ECDH', public: publicKey },
            privateKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        // Log key usages and type
        console.log('[WormholeCrypto] deriveSharedKey: CryptoKey usages:', key.usages, 'type:', key.type, 'algorithm:', key.algorithm);
        return key;
    }

    static logCryptoParams({
        role, // 'sender' or 'receiver'
        operation, // 'encrypt' or 'decrypt'
        messageId,
        ivBase64,
        ciphertextBase64,
        fullPayloadBase64,
        hashBase64,
        hashHex
    }) {
        const logObj = {
            role,
            operation,
            messageId,
            ivBase64,
            ciphertextBase64,
            fullPayloadBase64,
            hashBase64,
            hashHex
        };
        console.log(`[WormholeCrypto][${role}][${operation}][${messageId}] CRYPTO_PARAMS:`, JSON.stringify(logObj, null, 2));
    }

    async encrypt(key, data, {role = 'sender', messageId = ''} = {}) {
        // Log key usages and type before encrypt
        console.log('[WormholeCrypto] encrypt: CryptoKey usages:', key.usages, 'type:', key.type, 'algorithm:', key.algorithm);
        const enc = new TextEncoder();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        console.log('[WormholeCrypto][encrypt] IV (base64):', WormholeCrypto.uint8ToBase64(iv));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, key, enc.encode(data)
        );
        // Concatenate IV + ciphertext as Uint8Array, then base64 encode
        const ct = new Uint8Array(ciphertext);
        console.log('[WormholeCrypto][encrypt] Ciphertext (base64):', WormholeCrypto.uint8ToBase64(ct));
        const result = new Uint8Array(iv.length + ct.length);
        result.set(iv, 0);
        result.set(ct, iv.length);
        // Log hash of outgoing message
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', result);
        const hashUint8 = new Uint8Array(hashBuffer);
        const hashBase64 = WormholeCrypto.uint8ToBase64(hashUint8);
        const hashHex = WormholeCrypto.uint8ToHex(hashUint8);
        if (!hashBase64) {
            console.warn('[WormholeCrypto] Sent message hash is empty or invalid!');
        }
        console.log('[WormholeCrypto] Sent message hash (SHA-256, base64):', hashBase64);
        console.log('[WormholeCrypto] Sent message hash (SHA-256, hex):', hashHex);
        // Automated crypto param logging
        WormholeCrypto.logCryptoParams({
            role,
            operation: 'encrypt',
            messageId,
            ivBase64: WormholeCrypto.uint8ToBase64(iv),
            ciphertextBase64: WormholeCrypto.uint8ToBase64(ct),
            fullPayloadBase64: WormholeCrypto.uint8ToBase64(result),
            hashBase64,
            hashHex
        });
        return WormholeCrypto.uint8ToBase64(result);
    }

    async decrypt(key, base64, {role = 'receiver', messageId = ''} = {}) {
        // Log key usages and type before decrypt
        console.log('[WormholeCrypto] decrypt: CryptoKey usages:', key.usages, 'type:', key.type, 'algorithm:', key.algorithm);
        const bytes = WormholeCrypto.base64ToUint8(base64);
        const iv = bytes.slice(0, 12);
        const ciphertext = bytes.slice(12);
        console.log('[WormholeCrypto][decrypt] IV (base64):', WormholeCrypto.uint8ToBase64(iv));
        console.log('[WormholeCrypto][decrypt] Ciphertext (base64):', WormholeCrypto.uint8ToBase64(ciphertext));
        // Log hash of incoming message
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', bytes);
        const hashUint8 = new Uint8Array(hashBuffer);
        const hashBase64 = WormholeCrypto.uint8ToBase64(hashUint8);
        const hashHex = WormholeCrypto.uint8ToHex(hashUint8);
        if (!hashBase64) {
            console.warn('[WormholeCrypto] Received message hash is empty or invalid!');
        }
        console.log('[WormholeCrypto] Received message hash (SHA-256, base64):', hashBase64);
        console.log('[WormholeCrypto] Received message hash (SHA-256, hex):', hashHex);
        // Automated crypto param logging
        WormholeCrypto.logCryptoParams({
            role,
            operation: 'decrypt',
            messageId,
            ivBase64: WormholeCrypto.uint8ToBase64(iv),
            ciphertextBase64: WormholeCrypto.uint8ToBase64(ciphertext),
            fullPayloadBase64: base64,
            hashBase64,
            hashHex
        });
        const dec = new TextDecoder();
        const plaintext = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv }, key, ciphertext
        );
        return dec.decode(plaintext);
    }

    // Unit test: Simulate sender/receiver PAKE encrypt/decrypt in one function
    static async selfTestPAKE() {
        const password = 'test-password-123';
        const salt = 'magic-wormhole-webrtc-pake-salt';
        const messageId = 'test-message-1';
        const message = JSON.stringify({ publicKey: 'fake-key-data' });
        // Derive key (PBKDF2) as both sender and receiver would
        const enc = new TextEncoder();
        const passwordBytes = enc.encode(password);
        const saltBytes = enc.encode(salt);
        // Derive baseKey
        const baseKey = await window.crypto.subtle.importKey(
            'raw', passwordBytes, { name: 'PBKDF2' }, false, ['deriveKey']
        );
        // Derive AES-GCM key
        const derivedKey = await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: 100000,
                hash: 'SHA-256'
            },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        // Encrypt as sender
        const encrypted = await (new WormholeCrypto()).encrypt(derivedKey, message, { role: 'sender', messageId });
        // Decrypt as receiver
        const decrypted = await (new WormholeCrypto()).decrypt(derivedKey, encrypted, { role: 'receiver', messageId });
        // Log result
        console.log('[WormholeCrypto][selfTestPAKE] Decrypted message:', decrypted);
        if (decrypted === message) {
            console.log('[WormholeCrypto][selfTestPAKE] SUCCESS: Decrypted matches original.');
        } else {
            console.error('[WormholeCrypto][selfTestPAKE] FAIL: Decrypted does not match original!');
        }
    }

    // Unit test: Simulate full ECDH sender/receiver protocol in one function
    static async selfTestECDH() {
        const messageId = 'test-ecdh-msg-1';
        const message = JSON.stringify({ sdp: 'fake-sdp-offer', ice: 'fake-ice-candidate' });
        // 1. Both sender and receiver generate ECDH key pairs
        const senderCrypto = new WormholeCrypto();
        const receiverCrypto = new WormholeCrypto();
        const senderKeyPair = await senderCrypto.generateKeyPair();
        const receiverKeyPair = await receiverCrypto.generateKeyPair();
        // 2. Exchange and import public keys
        const senderPubB64 = await senderCrypto.exportPublicKey(senderKeyPair.publicKey);
        const receiverPubB64 = await receiverCrypto.exportPublicKey(receiverKeyPair.publicKey);
        const senderImportedPeerPub = await senderCrypto.importPublicKey(receiverPubB64);
        const receiverImportedPeerPub = await receiverCrypto.importPublicKey(senderPubB64);
        // 3. Derive shared secret using ECDH
        const senderSharedKey = await senderCrypto.deriveSharedKey(senderKeyPair.privateKey, senderImportedPeerPub);
        const receiverSharedKey = await receiverCrypto.deriveSharedKey(receiverKeyPair.privateKey, receiverImportedPeerPub);
        // 4. Sender encrypts message
        const encrypted = await senderCrypto.encrypt(senderSharedKey, message, { role: 'sender', messageId });
        // 5. Receiver decrypts message
        const decrypted = await receiverCrypto.decrypt(receiverSharedKey, encrypted, { role: 'receiver', messageId });
        // 6. Log result
        console.log('[WormholeCrypto][selfTestECDH] Decrypted message:', decrypted);
        if (decrypted === message) {
            console.log('[WormholeCrypto][selfTestECDH] SUCCESS: Decrypted matches original.');
        } else {
            console.error('[WormholeCrypto][selfTestECDH] FAIL: Decrypted does not match original!');
        }
    }

    // Unit test: Simulate full protocol: PAKE -> ECDH -> signaling message
    static async selfTestFullProtocol() {
        const password = 'test-password-123';
        const salt = 'magic-wormhole-webrtc-pake-salt';
        const pakeMsgId = 'test-full-pake';
        const ecdhMsgId = 'test-full-ecdh';
        const signalMsgId = 'test-full-signal';
        const signalingMessage = JSON.stringify({ sdp: 'fake-sdp-offer', ice: 'fake-ice-candidate' });
        // --- PAKE phase ---
        const enc = new TextEncoder();
        const passwordBytes = enc.encode(password);
        const saltBytes = enc.encode(salt);
        // Both sides derive baseKey and PAKE key
        const senderBaseKey = await window.crypto.subtle.importKey(
            'raw', passwordBytes, { name: 'PBKDF2' }, false, ['deriveKey']
        );
        const receiverBaseKey = await window.crypto.subtle.importKey(
            'raw', passwordBytes, { name: 'PBKDF2' }, false, ['deriveKey']
        );
        const senderPAKEKey = await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: 100000,
                hash: 'SHA-256'
            },
            senderBaseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        const receiverPAKEKey = await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: 100000,
                hash: 'SHA-256'
            },
            receiverBaseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        // --- ECDH keypair generation ---
        const senderCrypto = new WormholeCrypto();
        const receiverCrypto = new WormholeCrypto();
        const senderKeyPair = await senderCrypto.generateKeyPair();
        const receiverKeyPair = await receiverCrypto.generateKeyPair();
        // --- Exchange public keys, encrypt with PAKE key ---
        const senderPubB64 = await senderCrypto.exportPublicKey(senderKeyPair.publicKey);
        const receiverPubB64 = await receiverCrypto.exportPublicKey(receiverKeyPair.publicKey);
        // Sender encrypts its public key for receiver
        const senderPubEncrypted = await senderCrypto.encrypt(senderPAKEKey, senderPubB64, { role: 'sender', messageId: pakeMsgId+'-senderpub' });
        // Receiver encrypts its public key for sender
        const receiverPubEncrypted = await receiverCrypto.encrypt(receiverPAKEKey, receiverPubB64, { role: 'receiver', messageId: pakeMsgId+'-receiverpub' });
        // --- Decrypt public keys ---
        const senderPubDecrypted = await receiverCrypto.decrypt(receiverPAKEKey, senderPubEncrypted, { role: 'receiver', messageId: pakeMsgId+'-senderpub' });
        const receiverPubDecrypted = await senderCrypto.decrypt(senderPAKEKey, receiverPubEncrypted, { role: 'sender', messageId: pakeMsgId+'-receiverpub' });
        // Import decrypted public keys
        let senderImportedPeerPub, receiverImportedPeerPub;
        try {
            // FIX: Each side should import the peer's public key, not its own
            senderImportedPeerPub = await senderCrypto.importPublicKey(receiverPubDecrypted); // sender gets receiver's pubkey
            receiverImportedPeerPub = await receiverCrypto.importPublicKey(senderPubDecrypted); // receiver gets sender's pubkey
            console.log('[selfTestFullProtocol] Public key import succeeded.');
        } catch (e) {
            console.error('[selfTestFullProtocol] Public key import failed:', e);
            return;
        }
        // --- ECDH shared key derivation ---
        const senderSharedKey = await senderCrypto.deriveSharedKey(senderKeyPair.privateKey, senderImportedPeerPub);
        const receiverSharedKey = await receiverCrypto.deriveSharedKey(receiverKeyPair.privateKey, receiverImportedPeerPub);
        // --- Compare derived shared keys by encrypting a known message and comparing hashes ---
        const testMsg = 'shared-key-test';
        let senderTestCipher, receiverTestCipher;
        try {
            // Use a fixed IV for both sender and receiver to test key equality
            const fixedIv = new Uint8Array(12); // all zeros
            // Helper to encrypt with fixed IV
            async function encryptWithFixedIV(key, data, iv, role, messageId) {
                const enc = new TextEncoder();
                const ciphertext = await window.crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv }, key, enc.encode(data)
                );
                const ct = new Uint8Array(ciphertext);
                const result = new Uint8Array(iv.length + ct.length);
                result.set(iv, 0);
                result.set(ct, iv.length);
                // Log hash
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', result);
                const hashUint8 = new Uint8Array(hashBuffer);
                const hashBase64 = WormholeCrypto.uint8ToBase64(hashUint8);
                const hashHex = WormholeCrypto.uint8ToHex(hashUint8);
                console.log(`[selfTestFullProtocol][${role}] Fixed-IV test hashBase64:`, hashBase64, 'hashHex:', hashHex);
                return WormholeCrypto.uint8ToBase64(result);
            }
            senderTestCipher = await encryptWithFixedIV(senderSharedKey, testMsg, fixedIv, 'sender', 'shared-key-test-fixediv');
            receiverTestCipher = await encryptWithFixedIV(receiverSharedKey, testMsg, fixedIv, 'receiver', 'shared-key-test-fixediv');
            // Log hashes for comparison
            const senderTestBytes = WormholeCrypto.base64ToUint8(senderTestCipher);
            const receiverTestBytes = WormholeCrypto.base64ToUint8(receiverTestCipher);
            const senderTestHash = WormholeCrypto.uint8ToHex(new Uint8Array(await window.crypto.subtle.digest('SHA-256', senderTestBytes)));
            const receiverTestHash = WormholeCrypto.uint8ToHex(new Uint8Array(await window.crypto.subtle.digest('SHA-256', receiverTestBytes)));
            console.log('[selfTestFullProtocol][fixedIV] senderSharedKey test cipher hash:', senderTestHash);
            console.log('[selfTestFullProtocol][fixedIV] receiverSharedKey test cipher hash:', receiverTestHash);
            if (senderTestHash === receiverTestHash) {
                console.log('[selfTestFullProtocol][fixedIV] SUCCESS: Derived shared keys produce identical ciphertext for known message with fixed IV.');
            } else {
                console.error('[selfTestFullProtocol][fixedIV] FAIL: Derived shared keys produce different ciphertext for known message with fixed IV!');
            }
        } catch (e) {
            console.error('[selfTestFullProtocol][fixedIV] ERROR during shared key test encryption:', e);
        }
        // --- Signaling message encryption/decryption ---
        let encryptedSignal, decryptedSignal;
        try {
            encryptedSignal = await senderCrypto.encrypt(senderSharedKey, signalingMessage, { role: 'sender', messageId: signalMsgId });
            decryptedSignal = await receiverCrypto.decrypt(receiverSharedKey, encryptedSignal, { role: 'receiver', messageId: signalMsgId });
        } catch (e) {
            console.error('[selfTestFullProtocol] ERROR during signaling message encrypt/decrypt:', e);
            console.log('[selfTestFullProtocol] encryptedSignal:', encryptedSignal);
            return;
        }
        // --- Log result ---
        console.log('[WormholeCrypto][selfTestFullProtocol] Decrypted signaling message:', decryptedSignal);
        if (decryptedSignal === signalingMessage) {
            console.log('[WormholeCrypto][selfTestFullProtocol] SUCCESS: Decrypted signaling message matches original.');
        } else {
            console.error('[WormholeCrypto][selfTestFullProtocol] FAIL: Decrypted signaling message does not match original!');
        }
    }
}

// Make WormholeCrypto available globally for browser console testing
if (typeof window !== 'undefined') {
    window.WormholeCrypto = WormholeCrypto;
}

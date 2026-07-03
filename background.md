# Background: Protocols, Cryptography, and Design Choices in Wormhole-RTC

## 1. The Original Magic Wormhole Protocol & SPAKE2

[Magic Wormhole](https://github.com/magic-wormhole/magic-wormhole) is a secure, user-friendly protocol for transferring files and messages between computers. Its core design goals are:
- **Human-usable codes**: Short, memorable codes for pairing devices.
- **End-to-end encryption**: No server ever sees the data.
- **No accounts or setup**: Just share a code and connect.

### Protocol Flow
1. **Code Generation**: Sender generates a human-friendly code (e.g., "7-cow-salad").
2. **Key Derivation**: Both parties derive a shared secret from the code using the SPAKE2 password-authenticated key exchange protocol.
3. **Secure Channel**: All further communication is encrypted using this shared key.

### SPAKE2 Cryptography
- **SPAKE2** (Simple Password Authenticated Key Exchange, version 2) is a modern, provably secure protocol for establishing a shared secret over an insecure channel using a low-entropy password (the code).
- It prevents offline dictionary attacks and ensures that only someone with the correct code can derive the session key.
- Magic Wormhole uses SPAKE2 with strong cryptographic primitives (e.g., Curve25519, SHA256) and a Python implementation audited by cryptographers.

## 2. Wormhole-RTC: First Iteration (Browser-Only, No External Crypto)

Wormhole-RTC draws inspiration from Magic Wormhole but is designed for the web:
- **Runs 100% in the browser**: No native code, no external crypto libraries, no build steps.
- **WebRTC for transport**: Peer-to-peer, encrypted audio and chat.
- **Human-friendly codes**: Uses a wordlist to generate codes for pairing.
- **Ephemeral signaling server**: Only used to exchange WebRTC offers/answers; no data is stored.

### Tradeoffs & Rationale
- **Simplicity & Accessibility**: By using only browser-native crypto (e.g., Web Crypto API), anyone can run or audit the code, and it works everywhere modern browsers do.
- **No SPAKE2 in-browser**: The browser ecosystem lacks a mature, audited SPAKE2 implementation. Instead, a simpler key derivation from the code is used (e.g., PBKDF2 or HKDF over the code), which is less secure against brute-force attacks than SPAKE2.
- **Security Caveat**: This approach is suitable for casual, low-risk use but does not provide the same provable security guarantees as Magic Wormhole's SPAKE2.

## 3. Roadmap: True SPAKE2 for Provable Security (Coming Soon)

The next major milestone for Wormhole-RTC is to integrate a real SPAKE2 implementation:
- **Why?** SPAKE2 offers strong, peer-reviewed security against offline attacks and is the gold standard for password-authenticated key exchange.
- **How?**
  - Integrate a well-audited SPAKE2 library (e.g., via WebAssembly or a future native JS implementation).
  - Maintain browser compatibility and ease of use.
- **Benefits**:
  - Provable security even if the code is weak.
  - Closer alignment with the original Magic Wormhole protocol.

**Stay tuned for updates as Wormhole-RTC evolves to offer the strongest possible security in the browser!**

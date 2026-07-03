# Wormhole-RTC TODO and Roadmap

Updated: 2026-07-01

## Current State

- [X] Root route serves the main two-box messenger UI (`/` -> `index.html`)
- [X] WebSocket signaling server with ephemeral mailbox behavior
- [X] Peer-to-peer chat over WebRTC data channels
- [X] Browser-native cryptography for session establishment and message protection
- [X] Audio calling UI and controls
- [X] No-retention status dashboard (`/status`) with aggregate-only metrics
- [X] Status API (`/api/status`) exposing uptime, load, active connections, total connections since restart

## Next Priority Items

- [X] File transfer over WebRTC data channels
- [X] Transfer progress UI (bytes sent/received, ETA, cancel/retry)
- [X] Chunking/reassembly and integrity validation (hash check)
- [X] Resume support for interrupted transfers (optional by transfer ID)

## Go Secure Mode 

- [ ] Add `Go Secure` button in chat header to escalate to hardened session profile
- [ ] Show secure-state badge in chat (`Standard` vs `Secure`) for both peers
- [ ] Require peer handshake/consent for secure-mode activation and display status transitions
- [ ] Message security hardening
- [ ] Add app-layer message envelope encryption for chat payloads (in addition to DTLS/SRTP)
- [ ] Add per-message authentication tag validation and strict reject-on-failure behavior
- [ ] Add replay protection using sequence numbers + nonce tracking window
- [ ] Add optional frequent rekey policy for long-running chat sessions
- [ ] File transfer security hardening
- [ ] Encrypt file chunk payloads with secure-mode session keys before sending over data channel
- [ ] Add per-chunk authentication verification before reassembly
- [ ] Keep end-to-end whole-file hash validation and add explicit mismatch quarantine state
- [ ] Add secure metadata mode to minimize exposed filename/type/size until recipient approval
- [ ] Key management and cryptographic agility
- [ ] Add secure-mode key schedule separate from default session transport context
- [ ] Add key rotation triggers (time-based and volume-based)
- [ ] Add hybrid-ready abstraction so secure mode can adopt PQC KEM without protocol rewrite
- [ ] UX and safety controls
- [ ] Add transfer/message failure reason panel for secure-mode validation failures
- [ ] Add secure-mode downgrade warnings if peer cannot satisfy hardening requirements
- [ ] Add one-click `Exit Secure` flow with explicit confirmation of capability downgrade
- [ ] Telemetry and privacy constraints
- [ ] Keep no-retention policy: expose only aggregate secure-mode counts in status API
- [ ] Avoid storing any message/file plaintext or identifiers in server logs while secure mode is active
- [ ] PQC algorithm suite (hybrid rollout)
- [ ] Hybrid key exchange mode: classical ECDH + PQC KEM (for crypto agility)
- [ ] Negotiation and fallback between peers with capability advertisement
- [ ] Cipher suite labeling in UI/session logs for transparency
- [ ] Interop and compatibility test vectors for selected PQC algorithms

## Recommended Features

- [ ] TURN server configuration and relay fallback for restrictive NAT/firewalls
- [ ] Connection quality panel (RTT, jitter, packet loss, bitrate)
- [ ] End-to-end identity verification (safety number / fingerprint compare)
- [ ] Message delivery acknowledgements + optional read receipts
- [ ] Chat history export/import on local device only (opt-in, encrypted at rest)
- [ ] Optional disappearing messages with per-session retention controls
- [ ] Device and browser compatibility test matrix in CI
- [ ] Rate-limited mailbox operations and abuse controls on signaling server
- [ ] Basic admin health endpoint authentication for non-public deployments
- [ ] Accessibility pass (keyboard navigation, labels, contrast, reduced motion)
- [ ] Internationalization support for UI strings
- [ ] PWA mode for installable offline-ready shell

## Security and Privacy Follow-ups

- [ ] Document threat model and explicit non-goals
- [ ] Add key rotation policy for long-lived sessions
- [ ] Add optional encrypted backup transport for file transfer metadata (client-only)
- [ ] Extend status page policy panel with deployment guidance for no-log operation

## Notes

- This server is intentionally no-retention for user identifiers and network identity details.
- Operational metrics should remain aggregate and session-agnostic.

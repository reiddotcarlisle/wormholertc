# Secure Mode

WebRTC natively secures media using **DTLS-SRTP** hop-by-hop (e.g., between the browser and a media server/SFU).  Secure Mode injects an additional layer of application-level encryption directly on the raw encoded frames before they hit the transport layer.

This approach achieves true **End-to-End Encryption (E2EE)** in poit-to-point and multiparty topologies, ensuring that even if an intermediate Selective Forwarding Unit (SFU) terminates the DTLS connection, it only routes opaque ciphertext.

This is achieved using the **WebRTC Encoded Transform API** (historically referred to as *Insertable Streams*), standardizing around the `RTCRtpScriptTransform` interface.

## High-Level Architecture

The API operates a hook between the **Media Encoder** and the **RTP Packetizer** on the sending side, and between the **RTP Depacketizer** and the **Media Decoder** on the receiving side.

```
[Media Source] -> [Encoder] -> [RTCRtpScriptTransform (Encrypt)] -> [RTP Packetizer/SRTP] -> Network
                                                                       |
Network <------- [SRTP/Depacketizer] <- [RTCRtpScriptTransform (Decrypt)] <- [Decoder] -> [Display]
```

To preserve real-time performance and avoid blocking the main UI thread, the frame transformation runs entirely inside a dedicated **Web Worker**.

## Step-by-Step Implementation

### 1. The Main Thread Setup

When a track is added to the `RTCPeerConnection`, grab its corresponding `RTCRtpSender` or `RTCRtpReceiver`, instantiate a worker, and assign a new `RTCRtpScriptTransform`.

```javascript
// 1. Get the media track
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
const [videoTrack] = stream.getVideoTracks();

// 2. Add track to the peer connection to get the sender
const videoSender = peerConnection.addTrack(videoTrack, stream);

// 3. Initialize the Web Worker
const cryptoWorker = new Worker("crypto-worker.js");

// 4. Attach the transform pipeline
videoSender.transform = new RTCRtpScriptTransform(cryptoWorker, {
  operation: "encrypt",
  key: sharedSecretKey // You must manage out-of-band key distribution safely
});
```

Repeat a parallel flow on the receiving end using `peerConnection.ontrack`, intercepting the `event.receiver.transform` with an `{ operation: "decrypt" }` configuration.

### 2. The Worker Script (`crypto-worker.js`)

Inside the worker, listen for the `rtctransform` event. The event delivers a readable stream of encoded frames (`RTCEncodedVideoFrame` or `RTCEncodedAudioFrame`) and a writable stream to push the modified payload back into the pipeline.

```javascript
import { encryptPayload, decryptPayload } from "./crypto-utils.js";

self.onrtctransform = (event) => {
  const transformer = event.transformer;
  const { operation, key } = transformer.options;

  const transformStream = new TransformStream({
    async transform(frame, controller) {
      // frame.data is an ArrayBuffer containing the raw encoded bitstream (e.g., H.264 / VP8)
      const originalBuffer = frame.data;

      // Ensure you clone or construct an appropriately sized target buffer
      let modifiedBuffer;
      if (operation === "encrypt") {
        modifiedBuffer = await encryptPayload(originalBuffer, key, frame);
      } else if (operation === "decrypt") {
        modifiedBuffer = await decryptPayload(originalBuffer, key, frame);
      }

      // Assign the transformed buffer back to the frame and forward it
      frame.data = modifiedBuffer;
      controller.enqueue(frame);
    }
  });

  // Pipe the incoming pipeline through our transform step
  transformer.readable
    .pipeThrough(transformStream)
    .pipeTo(transformer.writable);
};
```

## Critical Implementation Details

### Frame Fragmentation & Metadata Caveats

You cannot blindly encrypt the entire `frame.data` payload.

* **Video Frame Integrity:** Routers and SFUs inspect the first few bytes of encoded video payloads (the frame headers) to distinguish between **Key Frames** (`VP8/H.264 I-Frames`) and **Delta Frames**. If you encrypt the structural metadata headers, down-stream SFUs cannot parse the stream parameters, leading to immediate packet drops or routing failure.
* **The Fix:** Only encrypt the *payload* segment of the frame data, leaving the codec's structural header intact. Alternatively, use emerging framing standards like **SFrame** (Secure Frame, RFC 9605), which define an explicit authenticated encapsulation layout specifically for this purpose.

### Cipher Selection

Because WebRTC demands sub-second latencies, your worker-side cryptography must keep up.

* Use authenticated encryption with associated data (**AEAD**), such as **AES-GCM** or **ChaCha20-Poly1305**, via the Web Crypto API (`crypto.subtle`).
* Ensure your initialization vectors (IVs / nonces) are synchronized between peers without expanding frame sizes excessively. Many implementations use a combination of the RTP timestamp or synchronization source (SSRC) metadata available on the frame object combined with a rolling counter.

# Peer-to-Peer

Restricting the architecture strictly to **Peer-to-Peer (P2P)** two-party calls significantly simplifies the engineering—though not necessarily inside the Web Worker logic itself.

Here is exactly where the implementation simplifies, where it stays the same, and the subtle security advantage it gains.

## What Becomes Simpler

### 1. Encrypting the Entire Frame

In a multi-party SFU architecture, you are forced to parse the codec bitstream and leave the frame headers (like keyframe indicators) unencrypted so the server can route them.
In a strict 1:1 P2P call, **there is no media server.** The network packets go directly from your browser to your peer's browser. Because the receiving browser doesn't need to route the frame to anyone else, you don't have to worry about SFU readability. You can technically encrypt the **entire** raw `frame.data` payload chunk without parsing codec-specific byte headers, as long as the receiver decrypts the entire chunk before passing it to the browser's native decoder.

### 2. Trivial Key Management

Multi-party E2EE requires complex key distribution systems (e.g., MLS or Olms/Megolm ratchets) so that users can join/leave, rotating keys without the SFU knowing them.
In a 1:1 call, you can establish a shared symmetric encryption key easily:

* Derive a high-entropy key out-of-band via your signaling channel using a simple **ECDH (Elliptic Curve Diffie-Hellman)** exchange or **PQC KEM**.
* Alternatively, because the underlying WebRTC channel is already secured via DTLS-SRTP peer-to-peer, you can safely pass an application-layer key *through* a WebRTC Data Channel once connected, completely bypassing your signaling server.

## What Stays the Same

The core frontend plumbing remains identical. You still have to:

* Spin up a **Web Worker**.
* Instantiate the `RTCRtpScriptTransform` pipeline.
* Handle asynchronous `TransformStream` reading and writing.
* Manage crypto nonces/IVs properly to prevent reuse across frames.

## A Valid Counter-Argument: Is it even necessary?

If you are strictly peer-to-peer, you should ask yourself *why* you are adding this extra layer of encryption.

Standard WebRTC natively uses **DTLS-SRTP** to encrypt all voice and video. In a true P2P call, that encryption happens directly between browser A and browser B. There is no intermediate server intercepting the media. Therefore, **standard WebRTC is already natively End-to-End Encrypted in a 1:1 topology.**

Adding an `RTCRtpScriptTransform` layer on a 1:1 P2P call is usually only done if:

1. **You don't trust the browser's implementation** of DTLS-SRTP and want a secondary, application-layer wrapper (defense-in-depth).
2. **You want to protect against future architectural changes** (e.g., if you plan to introduce an SFU later for group calls, implementing the worker transform now ensures your media layer is decoupled from transport trust early on).
3. **You are implementing Post-Quantum Cryptography (PQC)** at the application layer because standard browser WebRTC implementations may not yet natively enforce post-quantum hybrid handshakes on their DTLS layer.

// P2P — Peer-to-peer sync via BroadcastChannel + WebRTC DataChannel
// BroadcastChannel: instant sync across browser tabs (same origin)
// WebRTC: real P2P across devices with manual signaling (offer/answer copy-paste)

const CHANNEL_NAME = 'pena-treasury';
const PEER_TIMEOUT = 30000;

class P2PNode {
  constructor() {
    this.peerId = crypto.randomUUID().substring(0, 8);
    this.peers = new Map(); // peerId -> { lastSeen, channel }
    this.eventHandlers = [];
    this.peerHandlers = [];
    this.connected = false;

    // BroadcastChannel for same-browser sync
    try {
      this.bc = new BroadcastChannel(CHANNEL_NAME);
      this.bc.onmessage = (e) => this.handleMessage(e.data);
      this.connected = true;
    } catch (err) {
      console.error('P2P BroadcastChannel error:', err.message);
      this.bc = null;
    }

    // WebRTC for cross-device sync
    this.rtcPeers = new Map(); // peerId -> RTCPeerConnection
    this.dataChannels = new Map(); // peerId -> RTCDataChannel

    // Announce presence
    this.broadcast({ type: 'peer:hello', from: this.peerId });

    // Heartbeat — prune stale peers
    this.heartbeat = setInterval(() => {
      this.broadcast({ type: 'peer:heartbeat', from: this.peerId });
      const now = Date.now();
      for (const [pid, info] of this.peers) {
        if (now - info.lastSeen > PEER_TIMEOUT) {
          this.peers.delete(pid);
          this.notifyPeers();
        }
      }
    }, 10000);

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
      this.broadcast({ type: 'peer:bye', from: this.peerId });
      this.destroy();
    });
  }

  broadcast(msg) {
    if (this.bc) {
      try {
        this.bc.postMessage({ ...msg, from: this.peerId });
      } catch (err) {
        console.error('P2P broadcast error:', err.message);
      }
    }
    // Also send over WebRTC data channels
    for (const [pid, dc] of this.dataChannels) {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify({ ...msg, from: this.peerId }));
        } catch (err) {
          console.error(`P2P RTC send to ${pid} error:`, err.message);
        }
      }
    }
  }

  handleMessage(msg) {
    if (!msg || msg.from === this.peerId) return;

    try {
      switch (msg.type) {
        case 'peer:hello':
          this.peers.set(msg.from, { lastSeen: Date.now() });
          this.broadcast({ type: 'peer:ack', from: this.peerId, to: msg.from });
          this.notifyPeers();
          break;

        case 'peer:ack':
          if (!msg.to || msg.to === this.peerId) {
            this.peers.set(msg.from, { lastSeen: Date.now() });
            if (msg.state) {
              this.notifyEventHandlers({ type: 'state:sync', state: msg.state, from: msg.from });
            }
            this.notifyPeers();
          }
          break;

        case 'peer:heartbeat':
          if (this.peers.has(msg.from)) {
            this.peers.get(msg.from).lastSeen = Date.now();
          }
          break;

        case 'peer:bye':
          this.peers.delete(msg.from);
          this.notifyPeers();
          break;

        case 'event:broadcast':
          this.peers.set(msg.from, { lastSeen: Date.now() });
          this.notifyEventHandlers({ type: 'event', event: msg.event, from: msg.from });
          break;

        case 'state:request':
          this.broadcast({ type: 'peer:ack', from: this.peerId, to: msg.from, state: this.getStateSnapshot ? this.getStateSnapshot() : null });
          break;

        // WebRTC signaling
        case 'rtc:offer':
          this.handleOffer(msg);
          break;
        case 'rtc:answer':
          this.handleAnswer(msg);
          break;
        case 'rtc:candidate':
          this.handleCandidate(msg);
          break;
      }
    } catch (err) {
      console.error('P2P handleMessage error:', err.message);
    }
  }

  // WebRTC: create offer for cross-device P2P
  async createOffer() {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      const dc = pc.createDataChannel('pena-sync', { ordered: true });
      this.setupDataChannel(dc, 'remote');
      this.rtcPeers.set('remote', pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.broadcast({ type: 'rtc:candidate', from: this.peerId, candidate: e.candidate });
        }
      };

      return offer.sdp;
    } catch (err) {
      console.error('P2P createOffer error:', err.message);
      return null;
    }
  }

  async handleOffer(msg) {
    try {
      let pc = this.rtcPeers.get(msg.from);
      if (!pc) {
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        this.rtcPeers.set(msg.from, pc);

        pc.ondatachannel = (e) => {
          this.setupDataChannel(e.channel, msg.from);
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            this.broadcast({ type: 'rtc:candidate', from: this.peerId, candidate: e.candidate });
          }
        };
      }

      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.broadcast({ type: 'rtc:answer', from: this.peerId, to: msg.from, sdp: answer.sdp });
    } catch (err) {
      console.error('P2P handleOffer error:', err.message);
    }
  }

  async handleAnswer(msg) {
    try {
      const pc = this.rtcPeers.get('remote') || this.rtcPeers.get(msg.from);
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      }
    } catch (err) {
      console.error('P2P handleAnswer error:', err.message);
    }
  }

  async handleCandidate(msg) {
    try {
      for (const [, pc] of this.rtcPeers) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(msg.candidate);
        }
      }
    } catch (err) {
      console.error('P2P handleCandidate error:', err.message);
    }
  }

  setupDataChannel(dc, peerId) {
    this.dataChannels.set(peerId, dc);
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this.handleMessage(msg);
      } catch (err) {
        console.error('P2P dataChannel message error:', err.message);
      }
    };
    dc.onopen = () => {
      this.peers.set(peerId, { lastSeen: Date.now() });
      this.notifyPeers();
    };
    dc.onclose = () => {
      this.dataChannels.delete(peerId);
      this.peers.delete(peerId);
      this.notifyPeers();
    };
    dc.onerror = (err) => {
      console.error('P2P dataChannel error:', err.message || err);
    };
  }

  // Connect to a remote peer using a pasted answer SDP
  async connectWithAnswer(answerSdp) {
    try {
      const pc = this.rtcPeers.get('remote');
      if (!pc) return false;
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      return true;
    } catch (err) {
      console.error('P2P connectWithAnswer error:', err.message);
      return false;
    }
  }

  onEvent(handler) {
    this.eventHandlers.push(handler);
  }

  onPeerChange(handler) {
    this.peerHandlers.push(handler);
  }

  notifyEventHandlers(msg) {
    for (const h of this.eventHandlers) {
      try { h(msg); } catch (err) { console.error('P2P event handler error:', err.message); }
    }
  }

  notifyPeers() {
    const list = [this.peerId, ...Array.from(this.peers.keys())];
    for (const h of this.peerHandlers) {
      try { h(list); } catch (err) { console.error('P2P peer handler error:', err.message); }
    }
  }

  getPeerCount() {
    return this.peers.size + 1;
  }

  destroy() {
    try {
      clearInterval(this.heartbeat);
      this.broadcast({ type: 'peer:bye', from: this.peerId });
      if (this.bc) this.bc.close();
      for (const [, pc] of this.rtcPeers) {
        try { pc.close(); } catch {}
      }
    } catch (err) {
      console.error('P2P destroy error:', err.message);
    }
  }
}

export { P2PNode };

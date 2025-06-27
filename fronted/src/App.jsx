import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import './App.css';

// Polyfill for Simple-Peer
window.process = {
  nextTick: (callback) => setTimeout(callback, 0),
  env: {}
};

function App() {
  const [yourID, setYourID] = useState("");
  const [users, setUsers] = useState({});
  const [stream, setStream] = useState(null);
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerSignal, setCallerSignal] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [name, setName] = useState("");
  const [peer, setPeer] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const userVideo = useRef(null);
  const partnerVideo = useRef(null);
  const socket = useRef(null);
  const callAcceptedHandler = useRef(null);

  useEffect(() => {
    socket.current = io(import.meta.env.VITE_SERVER_URL);

    // Get user media
    if (typeof window !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          setStream(stream);
          if (userVideo.current) {
            userVideo.current.srcObject = stream;
            userVideo.current.onloadedmetadata = () => {
              userVideo.current.play().catch(e => console.error('Local video play error:', e));
            };
          }
        })
        .catch(err => console.error('Media device error:', err));
    } else {
      console.warn("Media devices not supported in this environment.");
    }
    // Socket event listeners
    socket.current.on("yourID", (id) => {
      setYourID(id);
    });

    socket.current.on("allUsers", (users) => {
      setUsers(users);
    });

    socket.current.on("hey", (data) => {
      setReceivingCall(true);
      setCaller(data.from);
      setCallerSignal(data.signal);
    });

    // Cleanup function
    return () => {
      if (socket.current) {
        socket.current.disconnect();
        socket.current.off("callAccepted", callAcceptedHandler.current);
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (peer) {
        peer.destroy();
      }
    };
  }, []);

  // Handle remote stream attachment
  useEffect(() => {
    if (remoteStream && partnerVideo.current) {
      partnerVideo.current.srcObject = remoteStream;
      partnerVideo.current.onloadedmetadata = () => {
        partnerVideo.current.play().catch(e => console.error('Remote video play error:', e));
      };
    }
  }, [remoteStream]);

  function callPeer(id) {
    // Clean up existing peer if any
    if (peer) {
      peer.destroy();
      socket.current.off("callAccepted", callAcceptedHandler.current);
    }

    const newPeer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ]
      }
    });

    // Store handler reference for cleanup
    callAcceptedHandler.current = (signal) => {
      if (!newPeer.destroyed) {
        setCallAccepted(true);
        newPeer.signal(signal);
      }
    };

    socket.current.on("callAccepted", callAcceptedHandler.current);

    newPeer.on("signal", data => {
      socket.current.emit("callUser", {
        userToCall: id,
        signalData: data,
        from: yourID,
        fromName: name || "Anonymous"
      });
    });

    newPeer.on("stream", stream => {
      setRemoteStream(stream);
    });

    newPeer.on("error", err => console.error("Peer error:", err));

    newPeer.on("close", () => {
      setRemoteStream(null);
      setCallAccepted(false);
      socket.current.off("callAccepted", callAcceptedHandler.current);
    });

    setPeer(newPeer);
  }

  function acceptCall() {
    if (peer) {
      peer.destroy();
    }

    const newPeer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" }
        ]
      }
    });

    newPeer.on("signal", data => {
      socket.current.emit("acceptCall", { signal: data, to: caller });
    });

    newPeer.on("stream", stream => {
      setRemoteStream(stream);
    });

    newPeer.on("error", err => console.error("Peer error:", err));

    newPeer.on("close", () => {
      setRemoteStream(null);
      setCallAccepted(false);
    });

    if (callerSignal && !newPeer.destroyed) {
      newPeer.signal(callerSignal);
    }

    setPeer(newPeer);
    setCallAccepted(true);
    setReceivingCall(false);
  }

  function rejectCall() {
    setReceivingCall(false);
    socket.current.emit("rejectCall", { to: caller });
  }

  function endCall() {
    if (peer) {
      peer.destroy();
    }
    setCallAccepted(false);
    setRemoteStream(null);
  }

  return (
    <div className="App">
      <div className="video-container">
        <div className="video-box">
          {stream && (
            <video
              playsInline
              muted
              ref={userVideo}
              autoPlay
              className="video"
            />
          )}
        </div>
        <div className="video-box">
          <video
            playsInline
            ref={partnerVideo}
            autoPlay
            className="video"
            style={{ display: callAccepted ? 'block' : 'none' }}
          />
        </div>
      </div>

      <div className="controls" style={{ background: "grey" }}>
        <div className="user-info">
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => socket.current.emit("updateName", name)}
          />
          <p>Your ID: {yourID}</p>
        </div>

        <div className="user-list">
          <h3>Online Users:</h3>
          {Object.keys(users).map(key => {
            if (key === yourID) return null;
            return (
              <button
                key={key}
                onClick={() => callPeer(key)}
                disabled={callAccepted}
              >
                Call {users[key].name || key}
              </button>
            );
          })}
        </div>

        {receivingCall && (
          <div className="incoming-call">
            <h3>{caller} is calling you!</h3>
            <div>
              <button onClick={acceptCall}>Accept</button>
              <button onClick={rejectCall}>Reject</button>
            </div>
          </div>
        )}

        {callAccepted && (
          <button onClick={endCall}>End Call</button>
        )}
      </div>
    </div>
  );
}

export default App;
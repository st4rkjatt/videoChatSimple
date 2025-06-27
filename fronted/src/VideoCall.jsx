import { useEffect, useRef } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:5000");

export default function VideoCall({ roomId }) {
    const localRef = useRef(null);
    const remoteRef = useRef(null);
    const pc = useRef(null);
    const didOffer = useRef(false);
    const isCaller = useRef(false);

    useEffect(() => {
        console.log("Connecting to signaling server...");
        if (!roomId) {
            console.error("Room ID is required to start the video call.");
            return;
        }
        socket.emit("join", roomId);

        pc.current = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
            localRef.current.srcObject = stream;
            stream.getTracks().forEach((track) => {
                pc.current.addTrack(track, stream);
            });
        });

        pc.current.ontrack = (event) => {
            const [remoteStream] = event.streams;
            if (remoteStream && remoteRef.current) {
                remoteRef.current.srcObject = remoteStream;
            }
        };

        pc.current.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice-candidate", { roomId, candidate: event.candidate });
            }
        };

        // ⚠️ Very important: store whether you're the offerer
        socket.on("user-joined", async () => {
            console.log("Another user joined, creating offer...");
            
            isCaller.current = true;
            const offer = await pc.current.createOffer();
            await pc.current.setLocalDescription(offer);
            socket.emit("offer", { roomId, offer });
        });

        socket.on("offer", async ({ offer }) => {
            console.log("Received offer");
            await pc.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answer);
            socket.emit("answer", { roomId, answer });
        });

        socket.on("answer", async ({ answer }) => {
            console.log("Received answer");
            await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on("ice-candidate", ({ candidate }) => {
            console.log("Received ICE candidate");
            pc.current.addIceCandidate(new RTCIceCandidate(candidate));
        });

        return () => {
            socket.disconnect();
            pc.current?.close();
        };
    }, []);


    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center">
                <h2>Local Video</h2>
                <video width={100} height={100} ref={localRef} autoPlay muted playsInline className="w-full" />
            </div>
            <div className="flex flex-col items-center">
                <h2>Remote Video</h2>
                <video width={100} height={100} ref={remoteRef} autoPlay playsInline className="w-full" />
            </div>
        </div>
    );
}

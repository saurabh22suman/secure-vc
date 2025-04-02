const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const endCallButton = document.getElementById('endCall');
// New elements for room controls
const roomIdInput = document.getElementById('roomIdInput');
const joinRoomButton = document.getElementById('joinRoom');
const createRoomButton = document.getElementById('createRoom');
const currentRoomIdSpan = document.getElementById('currentRoomId');
const roomControlsDiv = document.getElementById('room-controls');
const callControlsDiv = document.getElementById('call-controls');
const roomDisplayDiv = document.getElementById('room-display');
const copyRoomIdButton = document.getElementById('copyRoomId');
const videosDiv = document.getElementById('videos');
const callContainerDiv = document.getElementById('call-container');
const muteButton = document.getElementById('muteButton');
const appContainer = document.getElementById('app-container'); // Reference to app container
const reactionsContainer = document.getElementById('reactions-container');
const reactionButtons = document.querySelectorAll('.reaction-btn');
const videoButton = document.getElementById('videoButton');
const waitingOverlay = document.getElementById('waiting-overlay'); // New
const waitingRoomId = document.getElementById('waitingRoomId'); // New
const peerStatusIcons = document.getElementById('peer-status-icons'); // New
const peerMicStatus = document.getElementById('peer-mic-status'); // New
const peerVideoStatus = document.getElementById('peer-video-status'); // New

const socket = io(); // Initialize Socket.IO connection

let localStream;
let remoteStream;
let peerConnection;
let currentRoom = null; // Variable to store the current room ID
let isCaller = false; // Track if this client initiated the call
let callInitiated = false; // New flag to prevent duplicate call starts
let isMuted = false; // Track mute state
let isVideoOff = false; // New state for video

// Configuration for RTCPeerConnection (using Google's public STUN servers)
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Socket.IO connection events
socket.on('connect', () => {
    console.log('Connected to signaling server with ID:', socket.id);
});

socket.on('disconnect', () => {
    console.log('Disconnected from signaling server.');
    // Handle disconnection - potentially reset UI
    handleHangup(false); // Clean up UI and state, don't send hangup message
    alert('Disconnected from server.');
});

// --- Room Management ---

createRoomButton.addEventListener('click', () => {
    // Request media access first
    getMedia().then(() => {
        if (localStream) {
            isCaller = true; // This client is creating the room and will initiate the call
            socket.emit('create-room'); // Ask server to create a room
        } else {
            alert('Cannot create room without camera/mic access.');
        }
    });
});

joinRoomButton.addEventListener('click', async () => {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
        alert('Please enter a Room ID to join.');
        return;
    }

    console.log(`[JOIN] Attempting to join room ${roomId}...`);

    // Ensure we have media stream first
    console.log('[JOIN] Calling getMedia()...');
    await getMedia();
    console.log('[JOIN] getMedia() finished. Current localStream:', localStream);

    if (localStream) {
        console.log('[JOIN] Media stream exists. Emitting join-room event...');
        socket.emit('join-room', roomId); // Ask server to join the specified room
        console.log('[JOIN] join-room event emitted.');
    } else {
        console.error('[JOIN] Failed to get media stream, cannot join room.');
        alert('Cannot join room without camera/mic access. Please ensure permissions are granted.');
    }
});

socket.on('room-created', (roomId) => {
    console.log('Room created:', roomId);
    currentRoom = roomId;
    console.log('Attempting to update span element:', currentRoomIdSpan);
    currentRoomIdSpan.textContent = roomId;
    // Update UI
    roomControlsDiv.style.display = 'none';
    roomDisplayDiv.style.display = 'block';
    callContainerDiv.style.display = 'flex';
    appContainer.classList.remove('initial-state'); // Remove initial state class
    // Show waiting message for caller
    waitingRoomId.textContent = roomId;
    waitingOverlay.classList.remove('hidden');
    // Caller waits for peer to join
});

socket.on('room-joined', (roomId) => {
    console.log('Successfully joined room:', roomId);
    currentRoom = roomId;
    currentRoomIdSpan.textContent = roomId;
    // Update UI
    roomControlsDiv.style.display = 'none';
    roomDisplayDiv.style.display = 'block';
    callContainerDiv.style.display = 'flex';
    appContainer.classList.remove('initial-state'); // Remove initial state class
    waitingOverlay.classList.add('hidden'); // Ensure hidden for joiner
    // Non-caller signals readiness to start call negotiation
    socket.emit('ready', currentRoom);
});

socket.on('peer-joined', () => {
    console.log('Another peer joined the room. Initiating call (if caller).');
    waitingOverlay.classList.add('hidden'); // Hide waiting message
    if (isCaller && !callInitiated) { // Check flag
        callInitiated = true; // Set flag
        startCall(); // Caller starts the WebRTC negotiation
    }
});

socket.on('ready', () => {
    console.log('Peer is ready. Initiating call (if caller).');
    // No need to hide waiting message here, peer-joined already did
    if (isCaller && !callInitiated) { // Check flag
        callInitiated = true; // Set flag
        startCall(); // Caller starts the WebRTC negotiation
    }
});

socket.on('room-full', (roomId) => {
    alert(`Room ${roomId} is full.`);
});

socket.on('room-not-found', (roomId) => {
    alert(`Room ${roomId} not found.`);
});

socket.on('error', (message) => {
    console.error('Server error:', message);
    alert(`Server error: ${message}`);
});


// --- WebRTC Signaling and Call Logic ---

// Function to initialize and set up the peer connection
function setupPeerConnection() {
    if (peerConnection) {
        console.warn('PeerConnection already exists.');
        return;
    }
    peerConnection = new RTCPeerConnection(configuration);

    // Add local stream tracks to the peer connection
    localStream.getTracks().forEach(track => {
        try {
            peerConnection.addTrack(track, localStream);
        } catch (error) {
            console.error("Error adding track:", error);
        }
    });

    // Handle incoming ICE candidates from the remote peer
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            console.log('Sending ICE candidate');
            socket.emit('ice-candidate', { candidate: event.candidate, room: currentRoom });
        }
    };

    // Handle incoming remote stream
    peerConnection.ontrack = event => {
        console.log('Received remote track');
        if (!remoteStream || remoteStream.id !== event.streams[0].id) { // Check if stream exists and is different
            remoteStream = event.streams[0];
            remoteVideo.srcObject = remoteStream;
        }
        // If using addTrack without streams (newer approach):
        // if (!remoteStream) {
        //     remoteStream = new MediaStream();
        //     remoteVideo.srcObject = remoteStream;
        // }
        // if (!remoteStream.getTracks().includes(event.track)) {
        //     remoteStream.addTrack(event.track);
        // }
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state change:', peerConnection.iceConnectionState);
        // Could add handling for 'failed' or 'disconnected' states here
    };
}

// Function called by the caller to initiate the connection
async function startCall() {
    if (!peerConnection) {
        setupPeerConnection();
    }
    // Create offer and send to the other peer
    try {
        console.log('Creating offer...');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log('Sending offer');
        socket.emit('offer', { offer: offer, room: currentRoom });
    } catch (error) {
        console.error('Error creating or sending offer:', error);
        handleHangup(false); // Clean up on error
    }
}

// Add Socket.IO listeners for WebRTC signaling (now includes room)
socket.on('offer', async ({ offer }) => { // Destructure offer from payload
    if (!isCaller) { // Only non-callers handle offers
        console.log('Received offer.');

        // Ensure peerConnection is set up
        if (!peerConnection) {
             console.log('Offer received, but peer connection not ready. Setting up...');
             setupPeerConnection();
             if (!peerConnection) { // Check if setup failed
                 console.error("Failed to setup peer connection on offer receipt.");
                 return;
             }
        }

        // Check signaling state before processing offer
        console.log(`[OFFER] Current signaling state: ${peerConnection.signalingState}`);
        if (peerConnection.signalingState !== 'stable' && peerConnection.signalingState !== 'have-local-offer') {
            console.warn(`[OFFER] Received offer in unexpected state: ${peerConnection.signalingState}. Ignoring.`);
            // It might be safer to return here, but let's try proceeding cautiously for now,
            // as sometimes states can transition quickly. Add more checks below.
            // return; 
        }

        try {
             console.log('[OFFER] Setting remote description from offer...');
             // Ensure state is suitable for setRemoteDescription (offer)
             if (peerConnection.signalingState !== 'stable' && peerConnection.signalingState !== 'have-local-offer') {
                 console.error(`[OFFER] Cannot set remote description in state: ${peerConnection.signalingState}`);
                 return; 
             }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            console.log(`[OFFER] Remote description set. New signaling state: ${peerConnection.signalingState}`); // Should be have-remote-offer

            console.log('[OFFER] Creating answer...');
            const answer = await peerConnection.createAnswer();
            console.log('[OFFER] Answer created. Setting local description...');
             // Ensure state is suitable for setLocalDescription (answer)
             if (peerConnection.signalingState !== 'have-remote-offer') {
                 console.error(`[OFFER] Cannot set local description in state: ${peerConnection.signalingState}`);
                 // Clean up might be needed here if state is wrong
                 return; 
             }
            await peerConnection.setLocalDescription(answer);
            console.log(`[OFFER] Local description set. New signaling state: ${peerConnection.signalingState}`); // Should be stable

            console.log('[OFFER] Sending answer');
            socket.emit('answer', { answer: answer, room: currentRoom });
        } catch (error) {
            console.error('[OFFER] Error handling offer or creating/setting answer:', error);
            handleHangup(false); // Clean up on error
        }
    }
});

socket.on('answer', async ({ answer }) => { // Destructure answer from payload
    if (isCaller) { // Only callers handle answers
        console.log('Received answer.');
         if (peerConnection) {
            try {
                console.log('Setting remote description from answer...');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('Peer connection established!');
            } catch (error) {
                console.error('Error setting remote description from answer:', error);
                handleHangup(false); // Clean up on error
            }
        }
    }
});

socket.on('ice-candidate', async ({ candidate }) => { // Destructure candidate
    if (peerConnection && candidate) {
        try {
            console.log('Received ICE candidate, adding...');
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error adding received ICE candidate:', error);
        }
    } else {
        console.warn('Received ICE candidate but PeerConnection is not ready or candidate is null.');
    }
});


// --- Hangup Logic ---

endCallButton.addEventListener('click', () => {
    handleHangup(true); // Call the hangup function and send message
});

// Function to handle call hangup and cleanup
function handleHangup(shouldEmit) {
    console.log('Handling hangup...');
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    remoteVideo.srcObject = null; // Clear remote video
    localVideo.srcObject = null; // Clear local video preview
    remoteStream = null;

    // Reset UI
    roomControlsDiv.style.display = 'flex'; // Show room controls again
    roomDisplayDiv.style.display = 'none';
    callContainerDiv.style.display = 'none'; // Hide the main call container
    appContainer.classList.add('initial-state'); // Add initial state class back
    currentRoomIdSpan.textContent = '';
    roomIdInput.value = '';
    // Reset mute button state visually
    isMuted = false;
    muteButton.classList.remove('muted');
    muteButton.title = 'Mute Audio';
    let icon = muteButton.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-microphone';
    // Reset video button state visually
    isVideoOff = false;
    videoButton.classList.remove('off');
    videoButton.title = 'Turn Camera Off';
    icon = videoButton.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-video';
    waitingOverlay.classList.add('hidden'); // Ensure hidden on hangup
    // Hide peer status icons
    peerStatusIcons.classList.add('hidden');
    peerMicStatus.classList.add('hidden');
    peerVideoStatus.classList.add('hidden');

    // Send hangup signal to the other peer if initiated by user action
    if (shouldEmit && currentRoom) {
        console.log('Sending hangup signal to room:', currentRoom);
        socket.emit('hangup', { room: currentRoom });
    }

    currentRoom = null;
    isCaller = false;
    callInitiated = false; // Reset flag on hangup
}

// Listen for hangup signal from the other peer
socket.on('hangup', () => {
    console.log('Received hangup signal from peer.');
    handleHangup(false); // Clean up locally, don't re-emit
});

// Listen for peer disconnection signal from server (now includes room context)
socket.on('peer-disconnected', (socketId) => { // Server might need modification to only send if in same room
    console.log('Peer disconnected signal received:', socketId);
    // We might get this even if we weren't connected via WebRTC yet, or after hanging up
    // Only reset if we are currently in an active call state (peerConnection exists)
    if (peerConnection) {
        console.log('Hanging up due to peer disconnection.');
        handleHangup(false); // Clean up locally, don't re-emit
    }
});


// --- Media Acquisition ---

// Placeholder for getting user media
async function getMedia() {
    if (localStream) { // If stream already exists, return it
        return;
    }
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        console.log('Access to camera and microphone granted.');
    } catch (error) {
        console.error('Error accessing media devices.', error);
        alert('Could not access camera and microphone. Please check permissions.');
        localStream = null; // Ensure localStream is null on error
    }
}

// --- Event listener for Copy button ---
copyRoomIdButton.addEventListener('click', () => {
    if (currentRoom) {
        navigator.clipboard.writeText(currentRoom)
            .then(() => {
                // Optional: Show temporary feedback
                const originalText = copyRoomIdButton.textContent;
                copyRoomIdButton.textContent = 'Copied!';
                setTimeout(() => { copyRoomIdButton.textContent = originalText; }, 1500);
            })
            .catch(err => {
                console.error('Failed to copy Room ID: ', err);
                alert('Failed to copy Room ID.');
            });
    } else {
        console.warn('No room ID available to copy.');
    }
});

// --- Mute/Unmute Logic ---
muteButton.addEventListener('click', () => {
    if (!localStream) {
        console.warn('Cannot mute/unmute without local stream.');
        return;
    }
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted; // Enable/disable the audio track
    });

    // Update button UI
    muteButton.classList.toggle('muted', isMuted);
    muteButton.title = isMuted ? 'Unmute Audio' : 'Mute Audio';
    let icon = muteButton.querySelector('i');
    if (icon) {
        icon.className = isMuted ? 'fa-solid fa-microphone-slash' : 'fa-solid fa-microphone';
    }
    console.log(isMuted ? 'Audio Muted' : 'Audio Unmuted');

    // Send status update to peer
    if (currentRoom) {
        socket.emit('status-update', { room: currentRoom, type: 'audio', isEnabled: !isMuted });
    }
});

// --- Video Toggle Logic ---
videoButton.addEventListener('click', () => {
    if (!localStream) {
        console.warn('Cannot toggle video without local stream.');
        return;
    }
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoOff; // Enable/disable the video track
    });

    // Update button UI
    videoButton.classList.toggle('off', isVideoOff);
    videoButton.title = isVideoOff ? 'Turn Camera On' : 'Turn Camera Off';
    icon = videoButton.querySelector('i');
    if (icon) {
        icon.className = isVideoOff ? 'fa-solid fa-video-slash' : 'fa-solid fa-video';
    }
    console.log(isVideoOff ? 'Video Off' : 'Video On');

    // Send status update to peer
    if (currentRoom) {
        socket.emit('status-update', { room: currentRoom, type: 'video', isEnabled: !isVideoOff });
    }
});


// --- Initial State ---
// callControlsDiv.style.display = 'none'; // No longer needed
roomDisplayDiv.style.display = 'none';
// videosDiv.style.display = 'none'; // No longer needed
callContainerDiv.style.display = 'none'; // Ensure call container is hidden initially

// Ensure initial state class is present on load (it's added in HTML now)
// appContainer.classList.add('initial-state');

// --- Reaction Logic ---

function showFloatingEmoji(emoji) {
    if (!reactionsContainer) return;

    const emojiEl = document.createElement('span');
    emojiEl.classList.add('floating-emoji');
    emojiEl.textContent = emoji;

    // Add random horizontal drift
    const drift = (Math.random() - 0.5) * 100; // e.g., -50px to +50px
    emojiEl.style.setProperty('--drift-x', `${drift}px`);
    // Slightly randomize starting horizontal position too
    emojiEl.style.left = `${50 + (Math.random() - 0.5) * 40}%`;

    reactionsContainer.appendChild(emojiEl);

    // Remove the element after the animation completes (4s duration)
    emojiEl.addEventListener('animationend', () => {
        emojiEl.remove();
    });
}

// Re-verify listeners are on the individual buttons
reactionButtons.forEach(button => {
    button.addEventListener('click', () => {
        const emoji = button.dataset.emoji;
        if (emoji && currentRoom) {
            console.log('Sending reaction:', emoji);
            showFloatingEmoji(emoji); // Show locally
            socket.emit('reaction', { emoji: emoji, room: currentRoom }); // Send to peer
        }
    });
});

// Listen for reactions from the peer
socket.on('reaction', (data) => {
    console.log('Received reaction:', data.emoji);
    showFloatingEmoji(data.emoji);
});

// --- Peer Status Update Listener ---
socket.on('peer-status-update', ({ type, isEnabled }) => {
    console.log(`Peer status update received: ${type} is ${isEnabled ? 'enabled' : 'disabled'}`);
    if (type === 'audio') {
        peerMicStatus.classList.toggle('hidden', isEnabled);
    } else if (type === 'video') {
        peerVideoStatus.classList.toggle('hidden', isEnabled);
    }

    // Show the container if either icon is visible
    const micHidden = peerMicStatus.classList.contains('hidden');
    const videoHidden = peerVideoStatus.classList.contains('hidden');
    peerStatusIcons.classList.toggle('hidden', micHidden && videoHidden);
});

// Initialize peer status icons as hidden
if(peerMicStatus) peerMicStatus.classList.add('hidden');
if(peerVideoStatus) peerVideoStatus.classList.add('hidden');
if(peerStatusIcons) peerStatusIcons.classList.add('hidden');
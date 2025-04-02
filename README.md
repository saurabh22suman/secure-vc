# B4 Secure VC - Simple WebRTC Video Call

A basic web application demonstrating a peer-to-peer video call using WebRTC and Socket.IO for signaling.

## Features

*   Create unique rooms for calls.
*   Join existing rooms using a Room ID.
*   Peer-to-peer video and audio streaming.
*   Encrypted communication via WebRTC (DTLS/SRTP).
*   Mute/Unmute audio and Toggle Camera on/off.
*   Floating emoji reactions.
*   Peer status indicators (muted/camera off).

## Setup

1.  **Clone the repository (or ensure you have the files).**
2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Running the Application

1.  **Start the server:**
    ```bash
    node server.js
    ```
2.  **Open your web browser** and navigate to `http://localhost:3000` (or the configured port).
3.  **Open a second browser tab/window** to the same address.
4.  **In the first tab:** Click "Create Room & Start". Grant camera/microphone permissions if prompted.
5.  **Copy the displayed Room ID.**
6.  **In the second tab:** Paste the Room ID into the input field and click "Join Room". Grant permissions if prompted.

    The video call should now be established between the two tabs.

## Files

*   `server.js`: Node.js/Express server with Socket.IO signaling.
*   `package.json`: Node.js project metadata and dependencies.
*   `public/`: Directory for static client-side files.
    *   `index.html`: Main HTML structure.
    *   `script.js`: Client-side JavaScript for UI, WebRTC, and Socket.IO logic.
    *   `style.css`: Basic CSS styling.
*   `.gitignore`: Specifies intentionally untracked files for Git.
*   `README.md`: This file. 
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

## Running the Application (Locally)

1.  **Start the server:**
    ```bash
    node server.js
    ```
2.  **Open your web browser** and navigate to `http://localhost:3000` (or the configured port).
3.  **Open a second browser tab/window** to the same address.
4.  **Follow the UI instructions** to create/join a room and start a call.

## Docker Deployment

These instructions help run the application inside a Docker container.

1.  **Ensure Docker is installed** on your system/VPS.
2.  **Build the Docker image:** From the project root directory (where the `Dockerfile` is located), run:
    ```bash
    docker build -t b4-secure-vc .
    ```
    (Replace `b4-secure-vc` with your desired image name if needed).

3.  **Run the Docker container:**
    ```bash
    # Run detached (-d), map port 3000 on the host to 3000 in the container (-p),
    # automatically restart unless stopped (--restart unless-stopped),
    # and give the container a name (--name)
    docker run -d -p 3000:3000 --restart unless-stopped --name b4-vc-app b4-secure-vc
    ```
    *   If running locally, access at `http://localhost:3000`.
    *   If running on a VPS, you will typically set up a reverse proxy (like Nginx or Caddy) to handle your subdomain and forward traffic to this container's port 3000.

4.  **View logs (optional):**
    ```bash
    docker logs b4-vc-app -f
    ```

5.  **Stop the container (optional):**
    ```bash
    docker stop b4-vc-app
    ```

6.  **Remove the container (optional, after stopping):**
    ```bash
    docker rm b4-vc-app
    ```

## Files

*   `server.js`: Node.js/Express server with Socket.IO signaling.
*   `package.json`: Node.js project metadata and dependencies.
*   `public/`: Directory for static client-side files.
    *   `index.html`: Main HTML structure.
    *   `script.js`: Client-side JavaScript for UI, WebRTC, and Socket.IO logic.
    *   `style.css`: Basic CSS styling.
*   `Dockerfile`: Defines the Docker image build process.
*   `.gitignore`: Specifies intentionally untracked files for Git.
*   `README.md`: This file. 
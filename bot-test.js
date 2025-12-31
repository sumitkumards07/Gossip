import { io } from "socket.io-client";
import { exit } from "process";

const socket = io("http://localhost:4000", {
    transports: ["websocket"]
});

socket.on("connect", () => {
    console.log("Connected to server. ID:", socket.id);

    // Create a room
    const roomId = "test-room-" + Date.now();
    const roomData = { name: "Bot Test", latitude: 28.61, longitude: 77.20 }; // Delhi coords

    socket.emit("create_room", roomData, (response) => {
        if (response && response.success) {
            console.log("Room created:", response.room.id);

            // Join room
            socket.emit("join_room", response.room.id);

            // Send a message targeting a specific bot
            const testMessage = "ishani you are a bot";
            console.log(`Sending: '${testMessage}'`);
            socket.emit('send_message', {
                roomId: response.room.id,
                text: testMessage,
                senderId: 'Tester'
            });
        } else {
            console.error("Failed to create room");
        }
    });
});

socket.on("receive_message", (msg) => {
    console.log("Received:", msg.persona, ":", msg.text);
    if (msg.senderId.startsWith("BOT_")) {
        console.log("SUCCESS: Bot replied!");
        exit(0);
    }
});

// Timeout if no reply in 10s
setTimeout(() => {
    console.log("TIMEOUT: No bot reply in 10s.");
    exit(1);
}, 10000);

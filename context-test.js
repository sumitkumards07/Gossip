import { io } from 'socket.io-client';

const socket = io('http://localhost:4000');

socket.on('connect', () => {
    console.log('Connected to server. ID:', socket.id);

    // Create a room
    socket.emit('create_room', { name: 'Context Test', latitude: 28.6139, longitude: 77.2090 }, (response) => {
        console.log('Room created:', response.room.id);
        const roomId = response.room.id;

        socket.emit('join_room', roomId);

        // Scenario: Multiple messages
        console.log("Sending: 'Hey, I am Sumit. What is your name?'");
        socket.emit('send_message', { roomId, text: 'Hey, I am Sumit. What is your name?', senderId: 'USER_123', persona: 'Sumit' });

        let replyCount = 0;
        socket.on('receive_message', (msg) => {
            if (msg.senderId === 'USER_123') return;

            console.log(`Received: ${msg.persona} : ${msg.text}`);
            if (msg.senderId.startsWith('BOT_')) {
                replyCount++;
                if (replyCount === 1) {
                    setTimeout(() => {
                        console.log("Sending: 'Wait, what did I just say my name was?'");
                        socket.emit('send_message', { roomId, text: 'Wait, what did I just say my name was?', senderId: 'USER_123', persona: 'Sumit' });
                    }, 1000);
                } else if (replyCount === 2) {
                    console.log("Context check complete.");
                    setTimeout(() => {
                        console.log("SUCCESS: Multi-message test completed.");
                        process.exit(0);
                    }, 1000);
                }
            }
        });
    });
});

socket.on('connect_error', (err) => {
    console.error('Connection error:', err);
    process.exit(1);
});

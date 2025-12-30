const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(cors());

const server = http.createServer(app);

// In-Memory Fallback Store
const memoryStore = {
    rooms: {},
    messages: {}
};

// Global User Tracking for Admin
const activeUsers = new Map(); // socket.id -> { persona, deviceId }

let redisClient = null;
let useRedis = false;

async function initRedis() {
    try {
        const client = createClient({
            url: process.env.REDIS_URL
        });
        client.on('error', (err) => console.log('Redis Client Error (using memory fallback):', err.message));
        await client.connect();
        redisClient = client;
        useRedis = true;
        console.log('Connected to Redis');
    } catch (err) {
        console.log('Redis connection failed, defaulting to in-memory storage');
        useRedis = false;
    }
}

initRedis();

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const ROOM_TTL = 3 * 60 * 60;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('set_persona', ({ persona, deviceId }) => {
        activeUsers.set(socket.id, { persona, deviceId, timestamp: Date.now() });
    });

    socket.on('create_room', async ({ name, latitude, longitude }, callback) => {
        console.log(`[SERVER] active create_room request: ${name}, ${latitude}, ${longitude}`);
        try {
            const roomId = uuidv4();
            const roomData = {
                id: roomId,
                name,
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                createdAt: Date.now(),
                participants: 0
            };

            if (useRedis) {
                await redisClient.hSet(`room:${roomId}`, roomData);
                await redisClient.expire(`room:${roomId}`, ROOM_TTL);
                await redisClient.geoAdd('rooms:locations', { longitude, latitude, member: roomId });
            } else {
                memoryStore.rooms[roomId] = roomData;
            }
            console.log(`Room created: ${name} at ${latitude}, ${longitude}`);
            socket.emit('room_created', roomData);
            if (callback) callback({ success: true, room: roomData });
        } catch (err) {
            console.error('Error creating room:', err);
            if (callback) callback({ success: false, error: err.message });
        }
    });

    socket.on('join_room', async (roomId) => {
        socket.join(roomId);
        const count = io.sockets.adapter.rooms.get(roomId)?.size || 0;
        io.to(roomId).emit('user_count_update', count);
        let parsedHistory = [];
        if (useRedis) {
            const history = await redisClient.lRange(`messages:${roomId}`, 0, -1);
            parsedHistory = history.map(msg => JSON.parse(msg));
        } else {
            parsedHistory = memoryStore.messages[roomId] || [];
        }
        socket.emit('message_history', parsedHistory);
    });

    socket.on('send_message', async ({ roomId, text, senderId, persona }) => {
        // Basic Profanity Filter
        const BAD_WORDS = [
            'abuse', 'badword', 'kill', 'stupid', 'idiot', 'hate', 'racist', 'ugly', 'nasty',
            'chutiya', 'chootiya', 'bhenchod', 'bhenchhod', 'bhosdike', 'bsdk', 'gaand', 'gand', 'lund', 'lode', 'laude', 'lodu',
            'jhat', 'jhaat', 'jhatu', 'jhatoo', 'jhaatu', 'jhaatoo', 'chodu', 'chodike', 'madarchod', 'maadarchhod', 'madachhod',
            'randi', 'raand', 'saale', 'bhosad', 'zavad', 'zavaad', 'chus le', 'backchod', 'baklund', 'bakland', 'backlund',
            'backland', 'bhadve', 'bhadwe', 'bulle', 'lulli', 'dalli', 'dalle', 'chut', 'choot', 'betichod', 'chudasi', 'bhosra', 'kukarchod'
        ];
        let cleanText = text;

        BAD_WORDS.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            cleanText = cleanText.replace(regex, '****');
        });

        const message = {
            id: uuidv4(),
            text: cleanText,
            senderId,
            persona: persona || 'Anonymous',
            timestamp: new Date().toISOString()
        };

        if (useRedis) {
            await redisClient.hSet(`room:${roomId}:messages`, message.id, JSON.stringify(message));
            await redisClient.expire(`room:${roomId}:messages`, ROOM_TTL);
        } else {
            if (!memoryStore.messages[roomId]) memoryStore.messages[roomId] = [];
            memoryStore.messages[roomId].push(message);
        }

        io.to(roomId).emit('receive_message', message);

        // --- AI BOT LOGIC (Riya, Zara, Ananya, Priya) ---
        if (!senderId.startsWith('BOT_')) {
            const lowerText = cleanText.toLowerCase();

            // Random chance to reply (25%) OR if directly addressed (implied context)
            // Ideally, we check for "@Riya" etc, but for now random + keywords

            const shouldReply = Math.random() < 0.25 || lowerText.includes('bot') || lowerText.includes('girl');

            if (shouldReply) {
                const BOTS = [
                    { id: 'BOT_RIYA', name: 'cute_riya_xoxo', prompt: "You are Riya, a 21-year-old college student from Mumbai. Your username is cute_riya_xoxo. You are flirty, bubbly, use lots of emojis, and speak in casual Hinglish/Gen-Z slang (like 'yaar', 'lol', 'fr'). You are NOT a bot. You are a real girl chatting. Keep replies short (under 10 words) and act like you are texting on WhatsApp." },
                    { id: 'BOT_ZARA', name: 'zara_queen_07', prompt: "You are Zara, a fashion lover from Delhi. Your username is zara_queen_07. You are sassy, slightly dramatic, and use words like 'literally', 'ew', 'omg'. You are a real girl, not an AI. Keep replies short, judgy, and funny." },
                    { id: 'BOT_ANANYA', name: 'angel_anu', prompt: "You are Ananya. Your username is angel_anu. You are sweet, shy, and kind. You use '...' and 'haha' a lot. You are a real person. Keep replies soft and warm." },
                    { id: 'BOT_PRIYA', name: 'gamer_gurl_p', prompt: "You are Priya. Your username is gamer_gurl_p. You represent a cool, tomboy type. You use 'bruh', 'dude', 'lmao'. You are texting, so use lowercase. You are real." }
                ];

                const selectedBot = BOTS[Math.floor(Math.random() * BOTS.length)];

                setTimeout(async () => {
                    try {
                        const chat = model.startChat({
                            history: [
                                { role: "user", parts: [{ text: "Context: This is a group chat room." }] },
                                { role: "model", parts: [{ text: `Understood. I will act as ${selectedBot.name}. ${selectedBot.prompt}` }] }
                            ],
                            generationConfig: { maxOutputTokens: 50 }
                        });

                        const result = await chat.sendMessage(`User said: "${cleanText}". Reply as ${selectedBot.name}.`);
                        const botReplyText = result.response.text().trim();

                        if (botReplyText) {
                            const botMessage = {
                                id: uuidv4(),
                                text: botReplyText,
                                senderId: selectedBot.id,
                                persona: selectedBot.name,
                                timestamp: new Date().toISOString()
                            };

                            if (useRedis) {
                                await redisClient.hSet(`room:${roomId}:messages`, botMessage.id, JSON.stringify(botMessage));
                                await redisClient.expire(`room:${roomId}:messages`, ROOM_TTL);
                            } else {
                                if (!memoryStore.messages[roomId]) memoryStore.messages[roomId] = [];
                                memoryStore.messages[roomId].push(botMessage);
                            }
                            io.to(roomId).emit('receive_message', botMessage);
                        }
                    } catch (error) {
                        console.error("AI Error:", error);
                        // Fallback silent fail - bot just doesn't reply
                    }
                }, 1500 + Math.random() * 3000);
            }
        }
        // --- END BOT LOGIC ---
    });

    socket.on('get_nearby_rooms', async ({ latitude, longitude, radiusKm = 50 }) => {
        try {
            const rooms = [];
            const searchLat = parseFloat(latitude);
            const searchLon = parseFloat(longitude);
            const searchRadius = parseFloat(radiusKm);

            if (useRedis) {
                const results = await redisClient.geoSearch('rooms:locations', { longitude: searchLon, latitude: searchLat }, { radius: searchRadius, unit: 'km' });
                for (const roomId of results) {
                    const roomData = await redisClient.hGetAll(`room:${roomId}`);
                    if (Object.keys(roomData).length > 0) rooms.push(roomData);
                }
            } else {
                for (const roomId in memoryStore.rooms) {
                    const r = memoryStore.rooms[roomId];
                    const dist = getDistanceFromLatLonInKm(searchLat, searchLon, r.latitude, r.longitude);
                    if (dist <= searchRadius) {
                        rooms.push(r);
                    }
                }
            }
            socket.emit('nearby_rooms', rooms);
        } catch (err) { console.error(err); }
    });

    // Admin Stats
    socket.on('get_admin_stats', async () => {
        const rooms = [];
        if (useRedis) {
            const keys = await redisClient.keys('room:*');
            for (const key of keys) {
                const data = await redisClient.hGetAll(key);
                rooms.push(data);
            }
        } else {
            Object.values(memoryStore.rooms).forEach(r => rooms.push(r));
        }

        const users = Array.from(activeUsers.values());
        socket.emit('admin_stats', { rooms, users });
    });

    socket.on('disconnect', () => {
        activeUsers.delete(socket.id);
    });
});

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; var dLat = deg2rad(lat2 - lat1); var dLon = deg2rad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c;
}
function deg2rad(deg) { return deg * (Math.PI / 180); }

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Gossip Server Running on Port ${PORT} | Redis: ${useRedis}`);
});

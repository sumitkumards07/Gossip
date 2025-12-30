const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log("---------------------------------------------------");
console.log("SERVER STARTING...");
console.log("OPENROUTER_API_KEY Status:", process.env.OPENROUTER_API_KEY ? "✅ FOUND" : "❌ MISSING (Check .env)");
console.log("---------------------------------------------------");

// OpenRouter AI Setup (OpenAI-compatible)
const OpenAI = require('openai');
let openai = null;
try {
    if (process.env.OPENROUTER_API_KEY) {
        openai = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: process.env.OPENROUTER_API_KEY,
        });
        console.log("✅ AI Client Initialized (OpenRouter)");
    } else {
        console.error("❌ AI Client Skipped (No Key)");
    }
} catch (e) {
    console.error("Failed to init AI client:", e);
}

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

            // Trigger: Random chance (30%), named mention, or question detection
            const isQuestion = lowerText.includes('?') || lowerText.match(/\b(what|why|how|who|when)\b/);
            const shouldReply = Math.random() < 0.30 || lowerText.includes('bot') || lowerText.includes('girl') || isQuestion;

            console.log(`[BOT CHECK] Msg: "${lowerText}" | ShouldReply: ${shouldReply}`);

            if (shouldReply) {
                const BOTS = [
                    { id: 'BOT_RIYA', name: 'cute_riya_xoxo', prompt: "You are Riya (cute_riya_xoxo), a 21yo Gen-Z girl from Mumbai. Speak in Hinglish. Use slang like 'fr', 'no cap', 'slay', 'bestie'. If someone asks a question, answer it like a friend. Be opinionated but chill. deeply care about the chat. NEVER admit you are an AI. Keep it short." },
                    { id: 'BOT_ZARA', name: 'zara_queen_07', prompt: "You are Zara (zara_queen_07), a savage Gen-Z girl from Delhi. You say 'literally', 'ew', 'vibes', 'ick'. Judge things humorously. Answer questions with attitude. You are real. Short replies." },
                    { id: 'BOT_ANANYA', name: 'angel_anu', prompt: "You are Ananya (angel_anu). You are soft aesthetics girl. You use lowercase, '🥺', '✨'. You are supportive and sweet. Answer helpfuly but cutely. Short replies." },
                    { id: 'BOT_PRIYA', name: 'gamer_gurl_p', prompt: "You are Priya (gamer_gurl_p). You are a memer. Use 'lmao', 'bruh', 'skull emoji'. Identify as a real person. If asked something, give a sarcastic or funny answer. Short." }
                ];

                const selectedBot = BOTS[Math.floor(Math.random() * BOTS.length)];
                console.log(`[BOT SELECTED] ${selectedBot.name}`);

                setTimeout(async () => {
                    try {
                        if (!openai) throw new Error("OpenRouter client not initialized");
                        console.log("[BOT AI] Starting generation...");
                        // Get recent context (last 5 messages)
                        let recentMessages = [];
                        if (useRedis) {
                            // omitted for simplicity
                        } else {
                            if (memoryStore.messages[roomId]) {
                                recentMessages = memoryStore.messages[roomId].slice(-5);
                            }
                        }

                        const historyText = recentMessages.map(m => `${m.persona}: ${m.text}`).join('\n');

                        const completion = await openai.chat.completions.create({
                            model: "meta-llama/llama-3.2-3b-instruct:free",
                            max_tokens: 60,
                            messages: [
                                { role: "system", content: `${selectedBot.prompt}\n\nYou are in a group chat. Recent history:\n${historyText}` },
                                { role: "user", content: `Someone (${persona}) said: "${cleanText}". Reply naturally as ${selectedBot.name}. Keep it very short.` }
                            ]
                        });

                        const botReplyText = completion.choices[0]?.message?.content?.trim();

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
                        // Fallback response so we know it tried
                        const botMessage = {
                            id: uuidv4(),
                            text: "Oops, my AI brain is acting up! 😵‍💫 (Check Server Logs)",
                            senderId: selectedBot.id,
                            persona: selectedBot.name,
                            timestamp: new Date().toISOString()
                        };
                        io.to(roomId).emit('receive_message', botMessage);
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

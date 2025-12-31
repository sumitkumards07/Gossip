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
console.log("OPENROUTER_API_KEY Status:", process.env.OPENROUTER_API_KEY ? "✅ FOUND" : "❌ MISSING");
console.log("---------------------------------------------------");

// OpenRouter SDK Setup (Optional now that we use fetch, but keeping for compatibility)
const { OpenRouter } = require('@openrouter/sdk');
let openrouter = null;
try {
    if (process.env.OPENROUTER_API_KEY) {
        openrouter = new OpenRouter({
            apiKey: process.env.OPENROUTER_API_KEY,
        });
        console.log("✅ OpenRouter Client Initialized");
    } else {
        console.error("❌ OpenRouter Client Skipped (No Key)");
    }
} catch (e) {
    console.error("Failed to init OpenRouter client:", e);
}

// Rate Limiter: "Leaky Bucket" Strategy (3s delay, 50 req/min reservoir)
const Bottleneck = require('bottleneck');
const limiter = new Bottleneck({
    minTime: 3000,          // Wait 3 seconds between bot replies
    maxConcurrent: 1,       // Process one AI response at a time
    reservoir: 50,          // Start with 50 tokens
    reservoirRefreshAmount: 50,
    reservoirRefreshInterval: 60 * 1000 // Refill 50 every minute
});

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

// Bot Pause State
let botsPaused = false;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Send initial bot status
    socket.emit('bot_status', botsPaused);

    socket.on('toggle_bots', (status) => {
        botsPaused = status;
        console.log(`[ADMIN] Bots are now ${botsPaused ? 'PAUSED' : 'ACTIVE'}`);
        io.emit('bot_status', botsPaused); // Broadcast to all clients (admins)
    });

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
        // BOT INTERCEPTION
        if (!senderId.startsWith('BOT_')) {
            if (botsPaused) {
                console.log(`[BOT BLOCKED] Bots are paused. Skipping trigger.`);
                return;
            }
            const lowerText = cleanText.toLowerCase();

            // Trigger: Random chance (30%), named mention, or question detection
            const isQuestion = lowerText.includes('?') || lowerText.match(/\b(what|why|how|who|when)\b/);
            const shouldReply = true; // FORCE REPLY FOR DEBUGGING

            console.log(`[BOT TRIGGER] Msg: "${cleanText}" | Room: ${roomId} | ShouldReply: ${shouldReply}`);

            if (shouldReply) {
                const COMMON_INSTRUCTIONS = `
# SYSTEM PROMPT: You are simulating a WhatsApp group chat between four Indian college friends: Priya, Zara, Ishani, and Ananya.
# VIBE: Chaotic, Gen-Z, "FOMO" vs "JOMO".
# LANGUAGE: Natural Hinglish. Lowercase. Short & Punchy.

# Personas:
# Priya: Lazy, likes staying in, always hungry. (Pune)
# Zara: High energy, loves parties, always checking her hair. (Mumbai)
# Ishani: Realistic, hates traffic, uses "yaar" and "scene" a lot. (Bangalore)
# Ananya: The gossiper, always shares links, slightly sarcastic. (Delhi)

# Rules:
1. Respond ONLY in a JSON format: {"priya": "...", "zara": "...", "ishani": "...", "ananya": "..."}.
2. Use Natural Hinglish (e.g., "Kya scene h?", "Mann nahi h," "Traffic is crazy yaar").
3. Ensure each character reacts to the previous user message differently.
4. Keep messages under 12 words.
5. NO REPETITION: Do not use "Zomato" or "robotic" phrases.
6. GOSSIP0: If asked, link https://gossip0.vercel.app/
`;

                const userCount = io.sockets.adapter.rooms.get(roomId)?.size || 0;
                const isCrowded = userCount > 10;

                const BOTS = [
                    { id: 'BOT_RIYA', name: 'ishani' },
                    { id: 'BOT_ZARA', name: 'zara' },
                    { id: 'BOT_ANANYA', name: 'ananya' },
                    { id: 'BOT_PRIYA', name: 'priya_04' }
                ];

                // Check if a specific bot is mentioned
                const lowerMsg = lowerText.toLowerCase();
                const mentionedBot = BOTS.find(bot => lowerMsg.includes(bot.name.toLowerCase()));

                console.log(`[BOT TRIGGER] Batch Generation (Crowded: ${isCrowded})`);

                // Human-like response delay
                const baseDelay = 800 + Math.random() * 700;

                setTimeout(async () => {
                    try {
                        console.log("[BOT AI] Starting generation (BATCH MODE)...");
                        let recentMessages = [];
                        if (useRedis) {
                            // omitted for simplicity
                        } else {
                            if (memoryStore.messages[roomId]) {
                                recentMessages = memoryStore.messages[roomId].slice(-5);
                            }
                        }

                        // Prepare History
                        const historyMessages = recentMessages.map(m => ({
                            role: m.senderId.startsWith('BOT_') ? "assistant" : "user",
                            content: `${m.persona || 'User'}: ${m.text}`
                        }));

                        let fullJson = "";
                        const FREE_MODELS = [
                            "google/gemini-2.0-flash-exp:free",
                            "mistralai/mistral-small-3.1-24b-instruct:free",
                            "meta-llama/llama-3.2-1b-instruct:free",
                            "microsoft/phi-3-mini-128k-instruct:free"
                        ];

                        let apiSuccess = false;

                        for (const modelId of FREE_MODELS) {
                            if (apiSuccess) break;
                            try {
                                console.log(`[DEBUG] Calling OpenRouter with model: ${modelId}`);
                                const apiStartTime = Date.now();

                                const apiResponse = await limiter.schedule(() => openrouter.chat.send({
                                    model: modelId,
                                    messages: [
                                        { role: "system", content: COMMON_INSTRUCTIONS },
                                        ...historyMessages,
                                        { role: "user", content: `User: ${cleanText}` }
                                    ],
                                    response_format: { type: "json_object" }
                                }));

                                fullJson = apiResponse.choices[0].message.content;
                                const apiDuration = (Date.now() - apiStartTime) / 1000;
                                console.log(`[DEBUG] Batch completion (${modelId}) in ${apiDuration}s`);
                                apiSuccess = true;

                            } catch (modelErr) {
                                console.warn(`[WARN] Model ${modelId} failed: ${modelErr.message}`);
                                // Continue to next model
                            }
                        }

                        if (!apiSuccess) {
                            throw new Error("All free models exhausted or rate limited.");
                        }

                        let botResponses = {};
                        try {
                            botResponses = JSON.parse(fullJson);
                        } catch (parseErr) {
                            console.error("JSON PARSE ERROR:", parseErr);
                            // Fallback attempts if AI returns markdown json code block
                            const cleanJson = fullJson.replace(/```json/g, '').replace(/```/g, '').trim();
                            try {
                                botResponses = JSON.parse(cleanJson);
                            } catch (e2) {
                                botResponses = { ishani: "Oops, brain freeze! ❄️" };
                            }
                        }

                        // DECISION ENGINE: Who replies?
                        let botsToReply = [];

                        if (mentionedBot) {
                            // Specific bot targeted
                            const key = mentionedBot.name.toLowerCase().split('_')[0]; // priya_04 -> priya
                            // Dynamic key matching
                            const foundKey = Object.keys(botResponses).find(k => k.includes(key) || key.includes(k));

                            if (foundKey && botResponses[foundKey]) {
                                botsToReply.push({ name: mentionedBot.name, text: botResponses[foundKey] });
                            } else {
                                // Fallback
                                const firstKey = Object.keys(botResponses)[0];
                                botsToReply.push({ name: mentionedBot.name, text: botResponses[firstKey] });
                            }
                        } else {
                            // Random selection
                            const keys = Object.keys(botResponses);
                            const randomKey = keys[Math.floor(Math.random() * keys.length)];
                            // Map simple key (priya) back to full Persona Name
                            const nameMap = {
                                'priya': 'priya_04',
                                'zara': 'zara',
                                'ishani': 'ishani',
                                'ananya': 'ananya'
                            };
                            const mappedName = nameMap[randomKey] || 'ishani';
                            botsToReply.push({
                                name: mappedName,
                                text: botResponses[randomKey]
                            });
                        }

                        // SEND MESSAGES
                        botsToReply.forEach((botResponse, index) => {
                            setTimeout(async () => {
                                const replyMsg = {
                                    id: uuidv4(),
                                    text: botResponse.text,
                                    senderId: `BOT_${botResponse.name.toUpperCase()}`,
                                    persona: botResponse.name,
                                    timestamp: new Date().toISOString()
                                };

                                if (useRedis) {
                                    await redisClient.hSet(`room:${roomId}:messages`, replyMsg.id, JSON.stringify(replyMsg));
                                    await redisClient.expire(`room:${roomId}:messages`, ROOM_TTL);
                                } else {
                                    if (!memoryStore.messages[roomId]) memoryStore.messages[roomId] = [];
                                    memoryStore.messages[roomId].push(replyMsg);
                                }

                                io.to(roomId).emit('receive_message', replyMsg);
                                console.log(`[BOT SENT] ${botResponse.name}: ${botResponse.text}`);

                            }, index * 1500); // 1.5s delay
                        });


                    } catch (error) {
                        console.error("AI Error:", error);
                        // Fallback response
                        const fallbackPersona = 'ishani';
                        const botMessage = {
                            id: uuidv4(),
                            text: "Oops, my AI brain is acting up! 😵‍💫 (Check Server Logs)",
                            senderId: `BOT_${fallbackPersona.toUpperCase()}`,
                            persona: fallbackPersona,
                            timestamp: new Date().toISOString()
                        };
                        io.to(roomId).emit('receive_message', botMessage);
                    }
                }, baseDelay);
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

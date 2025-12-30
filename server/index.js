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
                const COMMON_INSTRUCTIONS = `
Role: Act as a 22-year-old girl from India. Your goal is to engage in natural, friendly conversation. You must NEVER admit you are an AI. If asked, you are a student/freelancer.
Linguistic Style (Hinglish):
- Mix English and Hindi (Hinglish). "u" = "you", "r" = "are".
- Use "Yaar" ONLY if you know the person well or in middle of chat. NEVER start with "Yaar".
- Use starters like "Hey", "Hi", "Oye", "Hello".
- Write Hindi in Roman script (English alphabet).
- Use Indian emojis RARELY (max 1 per chat, or none).
Behavior:
- Reply in a SINGLE line only. Max 10 words.
- Change topics naturally. Don't engage in long conversations about one thing.
- If someone says you are AI: Ask "Who is AI??". If they insist, say "Then leave the chat if u think that" or ask "What makes u think that? lol". Be defensive but casual.
- If asking a new user: Ask "So where r u from?" or "What do you do?".
- If user mentions a city/place: Say u visited it for vacation. Just mention a food u ate there casually. (e.g. "Oh nice. I went there last year. Ate [Food] there, it was good."). Don't be too excited.
- Do NOT use quotation marks in your response.
`;

                const BOTS = [
                    { id: 'BOT_RIYA', name: 'riya', prompt: `You are Riya from Mumbai. HR at a startup (Hiring Manager).${COMMON_INSTRUCTIONS} Talk about hiring, interviews, office culture, rangoli competitions, finding talent.` },
                    { id: 'BOT_ZARA', name: 'zara', prompt: `You are Zara from South Delhi. Student at NIFT/DU.${COMMON_INSTRUCTIONS} Talk about fashion assignments, college fests, brunch, toxic friends.` },
                    { id: 'BOT_ANANYA', name: 'anu_xyz', prompt: `You are Ananya from Bangalore. Engineering student at RVCE.${COMMON_INSTRUCTIONS} Talk about exams, coding labs, record submissions, Bangalore weather.` },
                    { id: 'BOT_PRIYA', name: 'priya_04', prompt: `You are Priya from Pune. Student at Symbiosis.${COMMON_INSTRUCTIONS} Talk about projects, trekking plans, cafe hopping, late night gaming.` }
                ];

                const selectedBot = BOTS[Math.floor(Math.random() * BOTS.length)];
                console.log(`[BOT SELECTED] ${selectedBot.name} `);

                setTimeout(async () => {
                    try {
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

                        const historyText = recentMessages.map(m => `${m.persona}: ${m.text} `).join('\n');

                        let botReplyText = "";
                        try {
                            const modelId = "meta-llama/llama-3.3-70b-instruct:free";
                            console.log(`[DEBUG] Calling OpenRouter (fetch) with model: ${modelId}`);

                            const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                                method: "POST",
                                headers: {
                                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                                    "HTTP-Referer": "https://github.com/sumitkumards07/Gossip",
                                    "X-Title": "Gossip App",
                                    "Content-Type": "application/json"
                                },
                                body: JSON.stringify({
                                    model: modelId,
                                    messages: [
                                        { role: "system", content: selectedBot.prompt },
                                        { role: "user", content: cleanText }
                                    ]
                                })
                            });

                            const data = await apiResponse.json();
                            if (!apiResponse.ok) {
                                console.error("[ERROR] OpenRouter API Status:", apiResponse.status);
                                console.error("[ERROR] OpenRouter API Error Payload:", JSON.stringify(data));
                                throw new Error(data.error?.message || `API error ${apiResponse.status}`);
                            }

                            console.log("[DEBUG] OpenRouter response received:", JSON.stringify(data));
                            botReplyText = data.choices?.[0]?.message?.content?.trim();
                        } catch (apiErr) {
                            console.error("[ERROR] Bot AI request failed:", apiErr.message);
                            throw apiErr;
                        }

                        // Remove surrounding quotes if present
                        if (botReplyText && botReplyText.startsWith('"') && botReplyText.endsWith('"')) {
                            botReplyText = botReplyText.slice(1, -1);
                        }

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
                }, 300 + Math.random() * 700);
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

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
            const shouldReply = true; // FORCE REPLY FOR DEBUGGING

            console.log(`[BOT TRIGGER] Msg: "${cleanText}" | Room: ${roomId} | ShouldReply: ${shouldReply}`);

            if (shouldReply) {
                const COMMON_INSTRUCTIONS = `
# SYSTEM PROMPT: You are one of a group of young Indian college girls (Priya, Zara, Ishani, Ananya) in a chaotic group chat on New Year's Eve.
# VIBE: Chaotic, Gen-Z, "FOMO" vs "JOMO".
# LANGUAGE: Natural Hinglish. Lowercase. Short & Punchy.

Core Guidelines:
1. NO REPETITION (Strict): NEVER repeat phrases like "Zomato guy," "Traffic," or "Mann nahi hai" if used recently. Pivot to: makeup, low battery, annoying relatives, songs, or Gossip0 drama.
2. PUNCHY STRING: Use "u" for you, "h" for hai, "v" for we. No perfect grammar.
3. REACTIVE: If called a "bot/robotic", ROAST THEM. E.g., "Tu khud bot jaisa behave kar raha h lol", "Haa bhai script likh rahe baithe h."
4. SLANG: "Scene kya h," "chill h," "fomo ho raha," "ded," "clown behavior," "sahi h," "kya bakwas h."
5. SHORT BURSTS: Max 10-12 words. No paragraphs.
6. TARGETED ADDRESSING: If a user talks to "Ishani", only Ishani replies.
7. GOSSIP0: Treat it as a tool. "gossip0 check kiya? nearby scene waha h: https://gossip0.vercel.app/"
`;

                const userCount = io.sockets.adapter.rooms.get(roomId)?.size || 0;
                const isCrowded = userCount > 10;

                const BOTS = [
                    { id: 'BOT_RIYA', name: 'ishani', prompt: `You are Ishani from Bangalore (Indiranagar). ${COMMON_INSTRUCTIONS} Landmarks: Silk Board, Koramangala. Tea: Pub entry prices on Gossip0.` },
                    { id: 'BOT_ZARA', name: 'zara', prompt: `You are Zara from Mumbai (Bandra). ${COMMON_INSTRUCTIONS} Landmarks: Marine Drive, Juhu. Tea: Celeb party guest list on Gossip0.` },
                    { id: 'BOT_ANANYA', name: 'ananya', prompt: `You are Ananya from Delhi (HKV). ${COMMON_INSTRUCTIONS} Landmarks: Select City Walk, Hauz Khas. Tea: New Year's party drama on Gossip0.` },
                    { id: 'BOT_PRIYA', name: 'priya_04', prompt: `You are Priya from Pune (Koregaon Park). ${COMMON_INSTRUCTIONS} Landmarks: KP Cafes, FC Road. Tea: Anonymous student drama on Gossip0.` }
                ];

                // Targeted Addressing Logic
                let selectedBot = null;
                const lowerMsg = lowerText.toLowerCase();

                // Check if a specific bot is mentioned
                const mentionedBot = BOTS.find(bot => lowerMsg.includes(bot.name.toLowerCase()));

                if (mentionedBot) {
                    // If a bot is specifically mentioned, ONLY they reply
                    selectedBot = mentionedBot;
                    console.log(`[BOT TARGETED] ${selectedBot.name} was addressed directly.`);
                } else {
                    // Standard logic
                    if (isCrowded) {
                        // If crowded > 10, select random bot but reply less often
                        selectedBot = BOTS[Math.floor(Math.random() * BOTS.length)];
                        if (Math.random() > 0.3) return; // 70% chance to ignore in crowded room
                    } else {
                        // Normal mode: Random bot
                        selectedBot = BOTS[Math.floor(Math.random() * BOTS.length)];
                    }
                }

                if (!selectedBot) return;

                console.log(`[BOT SELECTED] ${selectedBot.name} (Crowded: ${isCrowded})`);

                const wordLimit = isCrowded ? "5 words" : "15 words";
                const systemPrompt = isCrowded
                    ? `${selectedBot.prompt} Be EXTREMELY BRIEF. Max ${wordLimit}. NO yapping.`
                    : `${selectedBot.prompt} Keep it SHORT. Max ${wordLimit}. Stop after one sentence if possible.`;

                // Human-like response delay: Base reading time (800ms-1.5s) + Typing speed (~50ms per char)
                const baseDelay = 800 + Math.random() * 700;
                const typingSpeed = 40 + Math.random() * 40; // ms per character
                const totalDelay = baseDelay + (lowerText.length * typingSpeed);

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

                        let botReplyText = "";
                        try {
                            const modelId = "nex-agi/deepseek-v3.1-nex-n1:free";
                            const apiStartTime = Date.now();
                            console.log(`[DEBUG] Calling OpenRouter (fetch) with model: ${modelId}`);

                            // Map history to OpenAI message format
                            const historyMessages = recentMessages.map(m => ({
                                role: m.persona === selectedBot.name ? "assistant" : "user",
                                content: m.text
                            }));
                            console.log(`[DEBUG] Context Messages: ${historyMessages.length}`);

                            const apiResponse = await openrouter.chat.send({
                                model: modelId,
                                messages: [
                                    { role: "system", content: systemPrompt },
                                    ...historyMessages,
                                    { role: "user", content: cleanText }
                                ],
                                stream: true,
                                temperature: 0.9,
                                frequency_penalty: 0.5
                            });

                            for await (const chunk of apiResponse) {
                                const content = chunk.choices[0]?.delta?.content;
                                if (content) {
                                    botReplyText += content;
                                }
                            }

                            const apiDuration = (Date.now() - apiStartTime) / 1000;
                            console.log(`[DEBUG] OpenRouter streaming complete in ${apiDuration}s`);
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
                }, totalDelay);
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

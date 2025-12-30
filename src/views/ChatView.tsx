import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import MessageBubble from '../components/MessageBubble';
import type { Message } from '../components/MessageBubble';
import { useSocket } from '../context/SocketContext';

interface ChatViewProps {
    roomId: string;
    roomName: string;
    onLeave: () => void;
    currentUserPersona: string;
    deviceId: string;
}

const ChatView: React.FC<ChatViewProps> = ({ roomId, roomName, onLeave, currentUserPersona, deviceId }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const { socket } = useSocket();

    useEffect(() => {
        if (!socket) return;

        // Join room
        socket.emit('join_room', roomId);

        // Listeners
        socket.on('receive_message', (msg: Message) => {
            setMessages((prev) => [...prev, msg]);
        });

        socket.on('message_history', (history: Message[]) => {
            setMessages(history);
        });

        return () => {
            socket.off('receive_message');
            socket.off('message_history');
        };
    }, [roomId, socket]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() || !socket) return;

        socket.emit('send_message', {
            roomId,
            text: inputText,
            senderId: deviceId,
            persona: currentUserPersona
        });

        setInputText('');
    };

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex flex-col h-[100dvh] w-full bg-slate-50 relative overflow-hidden">
            {/* Background Gradients */}
            <div className="fixed top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 pointer-events-none" />

            {/* Header */}
            <header className="relative z-10 px-4 py-4 backdrop-blur-md bg-white/30 border-b border-white/20 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onLeave}
                        className="p-2 -ml-2 hover:bg-black/5 rounded-full transition-colors text-slate-700"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 leading-tight">{roomName}</h1>
                        <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            Live
                        </p>
                    </div>
                </div>
                <div className="text-xs font-semibold px-2 py-1 bg-white/50 text-slate-600 rounded-lg">
                    {/* Online count could be dynamic */}
                    Online
                </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 relative z-10 scrollbar-hide">
                {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={{ ...msg, isMe: deviceId === msg.senderId }} />
                ))}
                <div ref={bottomRef} className="h-4" />
            </div>

            {/* Input Area */}
            <div className="relative z-10 p-4 pb- safe-area-bottom backdrop-blur-xl bg-white/60 border-t border-white/40 flex-shrink-0">
                <form onSubmit={handleSend} className="max-w-4xl mx-auto relative flex items-center gap-2">
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Whisper something..."
                        className="flex-1 bg-white/80 border border-white/50 rounded-full px-5 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-900 placeholder-slate-400 shadow-sm"
                    />
                    <button
                        type="submit"
                        disabled={!inputText.trim()}
                        className="p-3.5 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                    >
                        <Send size={20} className="ml-0.5" />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChatView;

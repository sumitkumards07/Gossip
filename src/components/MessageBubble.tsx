import React from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { format } from 'date-fns';

export interface Message {
    id: string;
    text: string;
    senderId: string;
    timestamp: Date | string;
    isMe: boolean;
    persona?: string;
}

interface MessageBubbleProps {
    message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
    // Normalize timestamp
    const date = typeof message.timestamp === 'string' ? new Date(message.timestamp) : message.timestamp;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={clsx(
                "flex flex-col mb-4 max-w-[85%]",
                message.isMe ? "self-end items-end" : "self-start items-start"
            )}
        >
            {!message.isMe && (
                <span className="text-xs ml-3 mb-1 font-bold tracking-tight text-slate-500">
                    {message.persona || 'Anonymous'}
                </span>
            )}
            <div
                className={clsx(
                    "px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm relative overflow-hidden transition-all",
                    message.isMe
                        ? "bg-blue-600 text-white rounded-br-none shadow-blue-200/50"
                        : "bg-white/70 backdrop-blur-md border border-white/40 text-slate-800 rounded-bl-none"
                )}
            >
                <div className="relative z-10">{message.text}</div>

                {!message.isMe && (
                    <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
                )}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 mx-2">
                {format(date, 'HH:mm')}
            </span>
        </motion.div>
    );
};

export default MessageBubble;

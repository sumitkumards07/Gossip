import React from 'react';
import { motion } from 'framer-motion';

const Radar: React.FC = () => {
    return (
        <div className="relative w-72 h-72 flex items-center justify-center">
            {/* Pulse effect */}
            <motion.div
                className="absolute w-full h-full bg-blue-400/20 rounded-full"
                animate={{
                    scale: [1, 1.5],
                    opacity: [0.5, 0],
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeOut",
                }}
            />
            <motion.div
                className="absolute w-full h-full bg-blue-400/20 rounded-full"
                animate={{
                    scale: [1, 1.5],
                    opacity: [0.5, 0],
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeOut",
                    delay: 1.5,
                }}
            />

            {/* Core Circle */}
            <div className="w-4 h-4 bg-blue-500 rounded-full shadow-[0_0_20px_rgba(59,130,246,0.5)] z-10 relative">
                <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-75"></div>
            </div>

            {/* Radar Rings */}
            <div className="absolute w-32 h-32 border border-blue-500/10 rounded-full" />
            <div className="absolute w-52 h-52 border border-blue-500/10 rounded-full" />
            <div className="absolute w-72 h-72 border border-blue-500/10 rounded-full" />

            {/* Scan Line */}
            <motion.div
                className="absolute w-1/2 h-1/2 origin-bottom-right bg-gradient-to-t from-transparent to-blue-500/20"
                style={{
                    top: 0,
                    left: 0,
                    borderRight: '1px solid rgba(59, 130, 246, 0.2)',
                    borderTopRightRadius: '100%',
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />
        </div>
    );
};

export default Radar;

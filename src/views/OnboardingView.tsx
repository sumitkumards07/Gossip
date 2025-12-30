import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';

interface OnboardingViewProps {
    onComplete: (username: string) => void;
}

const PERSONAS = [
    "Neon Wanderer", "Blue Shadow", "Midnight Fox", "Silver Crow",
    "Amber Ghost", "Electric Owl", "Static Raven", "Velvet Panther",
    "Digital Nomad", "Urban Legend", "Silent Echo", "Jade Dragon"
];

const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete }) => {
    const [username, setUsername] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleRandomize = () => {
        setIsGenerating(true);
        setTimeout(() => {
            const random = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
            setUsername(random);
            setIsGenerating(false);
        }, 400);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (username.trim()) {
            onComplete(username.trim());
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 relative overflow-hidden">
            <div className="fixed top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-100 via-white to-purple-100 pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="w-full max-w-md glass-card p-8 relative z-10"
            >
                <div className="flex flex-col items-center text-center mb-8">
                    <div className="w-20 h-20 mb-6 relative group">
                        <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full group-hover:bg-blue-500/30 transition-all duration-500" />
                        <img
                            src="/logo.png"
                            alt="Gossip Logo"
                            className="w-full h-full object-contain relative z-10 glass-card p-1 rounded-3xl"
                        />
                    </div>
                    <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 bg-clip-text text-transparent">Gossip</h1>
                    <p className="text-slate-500 font-medium">Anonymous whispers in your radius.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="relative">
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter username..."
                            className="w-full bg-white/50 border border-white/50 rounded-2xl px-6 py-4 focus:outline-none focus:ring-4 focus:ring-blue-500/10 text-slate-900 placeholder-slate-400 text-lg font-medium transition-all"
                            maxLength={20}
                        />
                        <button
                            type="button"
                            onClick={handleRandomize}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-blue-500 transition-colors"
                        >
                            <motion.div animate={isGenerating ? { rotate: 360 } : {}}>
                                <Sparkles size={20} />
                            </motion.div>
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={!username.trim()}
                        className="w-full bg-slate-900 text-white rounded-2xl py-4 font-bold text-lg flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        Enter Radar
                        <ArrowRight size={20} />
                    </button>
                </form>

                <div className="mt-8 pt-8 border-t border-slate-200/50">
                    <p className="text-xs text-center text-slate-400 font-medium uppercase tracking-widest">
                        Real Humans • No Bots • Ephemeral
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default OnboardingView;

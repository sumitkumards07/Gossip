import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus } from 'lucide-react';

interface CreateRoomModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (name: string) => void;
}

const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ isOpen, onClose, onCreate }) => {
    const [roomName, setRoomName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (roomName.trim()) {
            onCreate(roomName);
            setRoomName('');
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
                    >
                        <div className="glass-card w-[90%] max-w-md p-6 rounded-3xl pointer-events-auto mx-4">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-slate-900">New Whisper Room</h2>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-black/5 rounded-full transition-colors"
                                >
                                    <X size={20} className="text-slate-500" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit}>
                                <div className="mb-6">
                                    <label htmlFor="roomName" className="block text-sm font-medium text-slate-600 mb-2">
                                        Room Name
                                    </label>
                                    <input
                                        type="text"
                                        id="roomName"
                                        value={roomName}
                                        onChange={(e) => setRoomName(e.target.value)}
                                        placeholder="e.g. Main Street Cafe Tea"
                                        className="w-full px-4 py-3 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent placeholder-slate-400 text-slate-900 transition-all"
                                        autoFocus
                                    />
                                    <p className="mt-2 text-xs text-slate-500">
                                        Visible to anyone within 10km for 3 hours.
                                    </p>
                                </div>

                                <button
                                    type="submit"
                                    disabled={!roomName.trim()}
                                    className="w-full py-3.5 bg-black text-white rounded-2xl font-medium active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <Plus size={18} />
                                    Start Whispering
                                </button>
                            </form>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default CreateRoomModal;

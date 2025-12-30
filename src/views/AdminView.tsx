import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Users, Layout, ShieldCheck, ArrowLeft, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

const AdminView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { socket } = useSocket();
    const [stats, setStats] = useState<{ rooms: any[], users: any[] }>({ rooms: [], users: [] });
    const [loading, setLoading] = useState(true);

    const fetchStats = () => {
        if (!socket) return;
        setLoading(true);
        socket.emit('get_admin_stats');
    };

    useEffect(() => {
        if (!socket) return;
        fetchStats();
        socket.on('admin_stats', (data) => {
            setStats(data);
            setLoading(false);
        });
        return () => { socket.off('admin_stats'); };
    }, [socket]);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-mono overflow-y-auto">
            {/* Header */}
            <div className="max-w-6xl mx-auto flex items-center justify-between mb-12">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="text-emerald-500" />
                        <h1 className="text-xl font-bold tracking-tighter uppercase">Gossip Command Center</h1>
                    </div>
                </div>
                <button
                    onClick={fetchStats}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all active:scale-95"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Refresh Stats
                </button>
            </div>

            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 pb-12">
                {/* Active Users */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl h-fit">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                            <Users size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">Active Humans</h2>
                            <p className="text-xs text-slate-500 uppercase tracking-widest">{stats.users.length} Online</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {stats.users.length === 0 && <p className="text-slate-600 text-sm">No active users.</p>}
                        {stats.users.map((user, i) => (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={i}
                                className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5"
                            >
                                <span className="font-bold text-slate-300">{user.persona}</span>
                                <span className="text-[10px] text-slate-600 bg-black/40 px-2 py-0.5 rounded uppercase tracking-tighter">
                                    {String(user.deviceId).slice(0, 8)}...
                                </span>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Active Rooms */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl h-fit">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                            <Layout size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">Active Whispers</h2>
                            <p className="text-xs text-slate-500 uppercase tracking-widest">{stats.rooms.length} Channels</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {stats.rooms.length === 0 && <p className="text-slate-600 text-sm">No active rooms.</p>}
                        {stats.rooms.map((room, i) => (
                            <motion.div
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={i}
                                className="p-3 bg-white/5 rounded-xl border border-white/5"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-bold text-emerald-400">{room.name}</span>
                                    <span className="text-[10px] text-slate-500 uppercase">
                                        {new Date(Number(room.createdAt)).toLocaleTimeString()}
                                    </span>
                                </div>
                                <div className="flex gap-2 text-[9px] text-slate-600">
                                    <span>LAT: {parseFloat(room.latitude).toFixed(4)}</span>
                                    <span>LON: {parseFloat(room.longitude).toFixed(4)}</span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminView;

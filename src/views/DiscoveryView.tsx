import React, { useEffect, useState } from 'react';
import { useLocation } from '../context/LocationContext';
import Radar from '../components/Radar';
import { Plus } from 'lucide-react';
import CreateRoomModal from '../components/CreateRoomModal';
import { useSocket } from '../context/SocketContext';

interface DiscoveryViewProps {
    onJoinRoom: (id: string, name: string) => void;
}

const DiscoveryView: React.FC<DiscoveryViewProps> = ({ onJoinRoom }) => {
    const { location } = useLocation();
    const { socket } = useSocket();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [nearbyRooms, setNearbyRooms] = useState<any[]>([]);

    useEffect(() => {
        if (!socket || !location) return;

        const interval = setInterval(() => {
            socket.emit('get_nearby_rooms', {
                latitude: location.latitude,
                longitude: location.longitude,
                radiusKm: 10
            });
        }, 5000);

        socket.emit('get_nearby_rooms', {
            latitude: location.latitude,
            longitude: location.longitude,
            radiusKm: 10
        });

        socket.on('nearby_rooms', (rooms) => {
            setNearbyRooms(rooms);
        });

        socket.on('room_created', (room) => {
            onJoinRoom(room.id, room.name);
        });

        return () => {
            clearInterval(interval);
            socket.off('nearby_rooms');
            socket.off('room_created');
        };
    }, [socket, location, onJoinRoom]);

    const handleCreateRoom = (name: string) => {
        if (!socket || !location) return;
        socket.emit('create_room', {
            name,
            latitude: location.latitude,
            longitude: location.longitude
        });
    };

    return (
        <div className="min-h-screen bg-slate-50 relative overflow-hidden">
            <div className="fixed top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 pointer-events-none" />

            <div className="relative z-10 p-6 flex flex-col h-full">
                <header className="mb-8 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 glass-card p-1 rounded-xl">
                            <img src="/logo.png" alt="Gossip Logo" className="w-full h-full object-contain" />
                        </div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Gossip</h1>
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-white/80 backdrop-blur shadow-sm p-3 rounded-full text-blue-600 hover:bg-white transition-colors border border-white/50"
                    >
                        <Plus size={24} />
                    </button>
                </header>

                <div className="flex-1 flex flex-col items-center justify-center relative w-full max-w-lg mx-auto">
                    <Radar />

                    <div className="absolute inset-0 z-10 pointer-events-none">
                        {nearbyRooms.map((room, index) => (
                            <button
                                key={room.id}
                                onClick={() => onJoinRoom(room.id, room.name)}
                                className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 glass px-4 py-3 rounded-2xl flex flex-col items-center gap-1 active:scale-95 transition-transform hover:bg-white/50 animate-float"
                                style={{
                                    animationDelay: `${index * 0.5}s`,
                                    top: `${50 + (Math.sin(index) * 20)}%`,
                                    left: `${50 + (Math.cos(index) * 20)}%`
                                }}
                            >
                                <span className="font-bold text-slate-800 text-sm">{room.name}</span>
                                <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">Live</span>
                            </button>
                        ))}

                        {nearbyRooms.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="bg-white/50 px-3 py-1 rounded-full text-xs text-slate-500 backdrop-blur-sm shadow-sm ring-1 ring-black/5">
                                    No whispers nearby... start one?
                                </span>
                            </div>
                        )}
                    </div>

                    <p className="absolute bottom-8 text-sm font-medium text-slate-400 uppercase tracking-widest text-center">
                        Scanning 10km Radius
                    </p>
                </div>
            </div>

            <CreateRoomModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onCreate={handleCreateRoom}
            />
        </div>
    );
};

export default DiscoveryView;

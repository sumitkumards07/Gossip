import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DiscoveryView from './views/DiscoveryView'
import ChatView from './views/ChatView'
import OnboardingView from './views/OnboardingView'
import { useLocation } from './context/LocationContext'
import { v4 as uuidv4 } from 'uuid'

function App() {
  const { location, error, loading } = useLocation();
  const [username, setUsername] = useState<string | null>(localStorage.getItem('gossip_user'));
  const [deviceId] = useState<string>(() => {
    const saved = localStorage.getItem('gossip_device_id');
    if (saved) return saved;
    const newId = uuidv4();
    localStorage.setItem('gossip_device_id', newId);
    return newId;
  });
  const [currentView, setCurrentView] = useState<'discovery' | 'chat'>('discovery');
  const [activeRoom, setActiveRoom] = useState<{ id: string, name: string } | null>(null);

  const handleOnboardingComplete = (name: string) => {
    localStorage.setItem('gossip_user', name);
    setUsername(name);
  };

  const handleJoinRoom = (id: string, name: string) => {
    setActiveRoom({ id, name });
    setCurrentView('chat');
  };

  const handleLeaveRoom = () => {
    setCurrentView('discovery');
    setTimeout(() => setActiveRoom(null), 500);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium animate-pulse">Locating you...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mb-4">
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Permission Needed</h2>
        <p className="text-slate-500 max-w-xs">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold transition-all active:scale-95"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!username) {
    return <OnboardingView onComplete={handleOnboardingComplete} />;
  }

  if (!location) return null;

  return (
    <div className="w-full h-screen overflow-hidden bg-slate-50">
      <AnimatePresence mode="wait">
        {currentView === 'discovery' ? (
          <motion.div
            key="discovery"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            transition={{ duration: 0.3 }}
            className="w-full h-full"
          >
            <DiscoveryView onJoinRoom={handleJoinRoom} />
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full h-full fixed inset-0 z-50 bg-white"
          >
            {activeRoom && (
              <ChatView
                roomId={activeRoom.id}
                roomName={activeRoom.name}
                onLeave={handleLeaveRoom}
                currentUserPersona={username || 'Anonymous'}
                deviceId={deviceId}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;

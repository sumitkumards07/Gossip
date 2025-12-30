import React, { createContext, useContext, useEffect, useState } from 'react';
import { getDistanceFromLatLonInKm } from '../utils/geolocation';
import type { Coordinates } from '../utils/geolocation';

interface LocationContextType {
    location: Coordinates | null;
    error: string | null;
    loading: boolean;
    isWithinRadius: (target: Coordinates, radiusKm: number) => boolean;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [location, setLocation] = useState<Coordinates | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser');
            setLoading(false);
            return;
        }

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                setLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
                setLoading(false);
                setError(null);
            },
            (err) => {
                setError(err.message);
                setLoading(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0,
            }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    const isWithinRadius = (target: Coordinates, radiusKm: number) => {
        if (!location) return false;
        const distance = getDistanceFromLatLonInKm(location, target);
        return distance <= radiusKm;
    };

    return (
        <LocationContext.Provider value={{ location, error, loading, isWithinRadius }}>
            {children}
        </LocationContext.Provider>
    );
};

export const useLocation = () => {
    const context = useContext(LocationContext);
    if (context === undefined) {
        throw new Error('useLocation must be used within a LocationProvider');
    }
    return context;
};

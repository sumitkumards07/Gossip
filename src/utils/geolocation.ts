export interface Coordinates {
    latitude: number;
    longitude: number;
}

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula.
 * @param start Coordinates of the starting point
 * @param end Coordinates of the ending point
 * @returns Distance in kilometers
 */
export function getDistanceFromLatLonInKm(start: Coordinates, end: Coordinates): number {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(end.latitude - start.latitude);
    const dLon = deg2rad(end.longitude - start.longitude);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(start.latitude)) *
        Math.cos(deg2rad(end.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
}

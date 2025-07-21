import { useState, useEffect } from 'react';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  country: string | null;
  loading: boolean;
  error: string | null;
}

// Fallback function to get location from IP
async function getLocationFromIP(): Promise<Partial<GeolocationState>> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (response.ok) {
      const data = await response.json();
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city,
        country: data.country_name,
      };
    }
  } catch (error) {
    // IP geolocation failed
  }
  return {};
}

export function useGeolocation() {
  const [location, setLocation] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    city: null,
    country: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      getLocationFromIP().then(ipLocation => {
        if (ipLocation.latitude && ipLocation.longitude) {
          setLocation({
            latitude: ipLocation.latitude,
            longitude: ipLocation.longitude,
            city: ipLocation.city ?? null,
            country: ipLocation.country ?? null,
            loading: false,
            error: null,
          });
        } else {
          setLocation(prev => ({
            ...prev,
            loading: false,
            error: 'Geolocation is not supported by your browser',
          }));
        }
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Use reverse geocoding to get city and country
          // Add User-Agent header as required by Nominatim
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=en`,
            {
              headers: {
                'Accept': 'application/json',
              }
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            
            setLocation({
              latitude,
              longitude,
              city: data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || null,
              country: data.address?.country || null,
              loading: false,
              error: null,
            });
          } else {
            // If reverse geocoding fails, still set coordinates
            setLocation({
              latitude,
              longitude,
              city: null,
              country: null,
              loading: false,
              error: null,
            });
          }
        } catch (error) {
          // If reverse geocoding fails, still set coordinates
          setLocation({
            latitude,
            longitude,
            city: null,
            country: null,
            loading: false,
            error: null,
          });
        }
      },
      async (error) => {
        // Try IP-based geolocation as fallback
        const ipLocation = await getLocationFromIP();
        
        if (ipLocation.latitude && ipLocation.longitude) {
          setLocation({
            latitude: ipLocation.latitude,
            longitude: ipLocation.longitude,
            city: ipLocation.city ?? null,
            country: ipLocation.country ?? null,
            loading: false,
            error: null,
          });
        } else {
          setLocation(prev => ({
            ...prev,
            loading: false,
            error: 'Unable to detect location. You can still search, but location-based results won\'t be available.',
          }));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }, []);

  return location;
}
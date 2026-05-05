'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Pusher from 'pusher-js';

interface VehicleSnap {
    deviceSerial: string;
    vehicleId: string | null;
    vehicleLabel: string;
    lat: number;
    lon: number;
    speedMph: number | null;
    heading: number | null;
    ignition: boolean | null;
    ts: string;
}

interface Props {
    fleetId: string;
    initial: VehicleSnap[];
    pusherKey: string;
    pusherHost: string;
    pusherPort: number;
    mapTilerKey: string;
}

export default function LiveMap({
    fleetId,
    initial,
    pusherKey,
    pusherHost,
    pusherPort,
    mapTilerKey,
}: Props) {
    const mapDiv = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const markers = useRef<Map<string, maplibregl.Marker>>(new Map());
    const [count, setCount] = useState(initial.length);

    useEffect(() => {
        if (!mapDiv.current || mapRef.current) return;
        const styleUrl = mapTilerKey
            ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`
            : 'https://demotiles.maplibre.org/style.json';

        const center: [number, number] = initial[0]
            ? [initial[0].lon, initial[0].lat]
            : [-95.64, 29.85];

        const map = new maplibregl.Map({
            container: mapDiv.current,
            style: styleUrl,
            center,
            zoom: 11,
        });
        map.addControl(new maplibregl.NavigationControl());
        mapRef.current = map;

        initial.forEach(upsertMarker);

        return () => {
            map.remove();
            mapRef.current = null;
            markers.current.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const pusher = new Pusher(pusherKey, {
            wsHost: pusherHost,
            wsPort: pusherPort,
            wssPort: pusherPort,
            forceTLS: pusherPort === 443,
            enabledTransports: ['ws', 'wss'],
            cluster: 'mt1',
            disableStats: true,
        });
        const ch = pusher.subscribe(`fleet.${fleetId}.locations`);
        ch.bind('location', (evt: VehicleSnap) => {
            upsertMarker({ ...evt, vehicleLabel: evt.deviceSerial });
            setCount(markers.current.size);
        });
        return () => {
            pusher.unsubscribe(`fleet.${fleetId}.locations`);
            pusher.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fleetId]);

    function upsertMarker(v: VehicleSnap) {
        const map = mapRef.current;
        if (!map) return;
        const existing = markers.current.get(v.deviceSerial);
        const el = document.createElement('div');
        el.className = 'rounded-full shadow-lg ring-2 ring-white';
        el.style.width = '14px';
        el.style.height = '14px';
        el.style.background = v.ignition ? '#16a34a' : '#6b7280';

        if (existing) {
            existing.setLngLat([v.lon, v.lat]);
        } else {
            const m = new maplibregl.Marker({ element: el })
                .setLngLat([v.lon, v.lat])
                .setPopup(
                    new maplibregl.Popup({ offset: 12 }).setHTML(
                        `<div class="text-sm"><b>${v.vehicleLabel}</b><br/>` +
                        `${v.speedMph ?? 0} mph · ${v.ignition ? 'ON' : 'OFF'}<br/>` +
                        `<span class="text-gray-500">${new Date(v.ts).toLocaleTimeString()}</span></div>`
                    )
                )
                .addTo(map);
            markers.current.set(v.deviceSerial, m);
        }
    }

    return (
        <div className="relative h-screen">
            <div ref={mapDiv} className="absolute inset-0" />
            <div className="absolute top-4 left-4 z-10 bg-white/90 rounded-lg shadow px-3 py-2 text-sm">
                {count} vehicle{count === 1 ? '' : 's'} tracked
            </div>
        </div>
    );
}

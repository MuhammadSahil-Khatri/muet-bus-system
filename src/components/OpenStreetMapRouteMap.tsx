import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { AlertCircle, Navigation } from 'lucide-react';
import type { BusRoute, BusStop } from '../types/bus';
import { escapeHtml, routeStops } from '../utils/maps';

interface OpenStreetMapRouteMapProps {
  route: BusRoute | null;
}

const MUET_CENTER = { lat: 25.4055, lng: 68.2598 };

export const OpenStreetMapRouteMap: React.FC<OpenStreetMapRouteMapProps> = ({ route }) => {
  const stops = useMemo<BusStop[]>(() => routeStops(route), [route]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [duration, setDuration] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const leafletMap = L.map(mapContainerRef.current, {
      center: [MUET_CENTER.lat, MUET_CENTER.lng],
      zoom: 12,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(leafletMap);
    setMap(leafletMap);
    const timer = setTimeout(() => leafletMap.invalidateSize(), 100);
    return () => {
      clearTimeout(timer);
      leafletMap.remove();
      setMap(null);
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    const controller = new AbortController();
    setDistance(null);
    setDuration(null);

    if (stops.length < 2) {
      setNotice(route ? 'This route has no stop coordinates to draw.' : null);
      return () => layer.remove();
    }
    setNotice(null);

    const latLngs: [number, number][] = stops.map((stop) => [stop.lat, stop.lng]);
    map.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
    stops.forEach((stop, index) => {
      const color = index === 0 ? '#059669' : index === stops.length - 1 ? '#dc2626' : '#2563eb';
      const icon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `<div style="background:${color};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)">${index + 1}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([stop.lat, stop.lng], { icon, title: stop.name })
        .addTo(layer)
        .bindPopup(`<strong>${index + 1}. ${escapeHtml(stop.name)}</strong><br/>${escapeHtml(stop.time)}`);
    });

    const coords = stops.map((stop) => `${stop.lng},${stop.lat}`).join(';');
    setIsRouting(true);
    fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        setIsRouting(false);
        if (data.code !== 'Ok' || !data.routes?.length) throw new Error(data.code || 'No route');
        const best = data.routes[0];
        const path: [number, number][] = best.geometry.coordinates.map((point: [number, number]) => [point[1], point[0]]);
        L.polyline(path, { color: '#1d4ed8', weight: 8, opacity: 0.9 }).addTo(layer);
        const line = L.polyline(path, { color: '#3b82f6', weight: 5, opacity: 1 }).addTo(layer);
        map.fitBounds(line.getBounds(), { padding: [50, 50] });
        setDistance(`${(best.distance / 1000).toFixed(1)} km`);
        setDuration(`${Math.round(best.duration / 60)} mins`);
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setIsRouting(false);
        L.polyline(latLngs, { color: '#3b82f6', weight: 4, dashArray: '8 8' }).addTo(layer);
        setNotice('Road routing is unavailable right now, so straight lines between stops are shown.');
      });

    return () => {
      controller.abort();
      layer.remove();
      setIsRouting(false);
    };
  }, [map, route, stops]);

  const first = stops[0];
  return (
    <div className="relative w-full h-full min-h-[360px] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shadow-sm flex flex-col">
      <div className="absolute top-3 left-3 right-3 z-30 flex items-start pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm max-w-full">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            Street route (OpenStreetMap)
          </span>
          {route && first && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 border-l border-slate-200 pl-2">
              <strong className="text-slate-900">Point {route.number}</strong>
              <span className="text-slate-400">·</span>
              <span>{stops.length} stops</span>
              {distance && (
                <span className="ml-1 text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold border border-blue-200 inline-flex items-center gap-1">
                  <Navigation className="w-3 h-3" />
                  {distance}{duration ? ` • ${duration}` : ''}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="relative flex-1 w-full h-full">
        <div ref={mapContainerRef} className="absolute inset-0 z-10" />
        {!route && <div className="absolute inset-0 z-20 flex items-center justify-center text-xs text-slate-500 bg-slate-50/80">Select a route to see its path on the map.</div>}
        {isRouting && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-white/95 border border-slate-200 px-3 py-1 rounded-full shadow-md text-xs text-slate-700 font-medium flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            Calculating route through all stops...
          </div>
        )}
        {notice && (
          <div className="absolute bottom-4 left-4 right-4 mx-auto max-w-lg bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-md z-30 text-left">
            <div className="flex items-start gap-2.5 text-amber-800 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import type { BusRoute, BusStop } from '../types/bus';

/** Escapes text before it is placed inside HTML strings (map popups). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Stops that have usable coordinates (0,0 means "not set"). */
export function routeStops(route: BusRoute | null | undefined): BusStop[] {
  if (!route) return [];
  return route.stops.filter(
    (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && !(s.lat === 0 && s.lng === 0)
  );
}

/** Picks at most `max` items spread evenly, always keeping the first and last. */
export function sampleEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  if (max < 2) return items.slice(0, max);
  const result: T[] = [];
  for (let i = 0; i < max; i++) {
    result.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  }
  return result;
}

/** Builds an external Google Maps directions link without loading Google APIs. */
export function buildGoogleMapsLink(route: BusRoute | null | undefined): string | null {
  const stops = routeStops(route);
  if (stops.length < 2) return null;

  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const waypoints = sampleEvenly(stops.slice(1, -1), 9);
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'driving',
  });
  if (waypoints.length) {
    params.set('waypoints', waypoints.map((stop) => `${stop.lat},${stop.lng}`).join('|'));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

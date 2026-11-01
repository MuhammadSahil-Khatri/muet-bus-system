export interface BusStop {
  sequence: number;
  name: string;
  lat: number;
  lng: number;
  time: string;
}

export interface BusRoute {
  number: string;
  name: string;
  startLocation: string;
  destination: string;
  morningTime: string;
  returnTime: string;
  capacity: number;
  driverName: string;
  driverPhone: string;
  stops: BusStop[];
}

/** Shape sent to the server when an admin creates or edits a route. */
export interface BusInput {
  number: string;
  name: string;
  startLocation: string;
  destination: string;
  morningTime: string;
  returnTime: string;
  capacity: number;
  driverName: string;
  driverPhone: string;
  stops: { name: string; lat: number; lng: number; time: string }[];
}

export interface PointItem {
  name: string;
  lat: number;
  lng: number;
  busNumber: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  count?: number;
  engine?: string;
  durationMs?: number;
  buses?: BusRoute[];
  points?: PointItem[];
  error?: string;
}

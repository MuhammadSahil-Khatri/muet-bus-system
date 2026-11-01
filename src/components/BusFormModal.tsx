import React, { useEffect, useState } from 'react';
import { X, Bus, AlertCircle, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { BusRoute, BusInput } from '../types/bus';
import { apiFetch, ApiError } from '../utils/api';

interface BusFormModalProps {
  isOpen: boolean;
  /** null = create a new route, otherwise edit this route */
  bus: BusRoute | null;
  onClose: () => void;
  onSaved: (busNumber: string) => void;
  /** called when the server says the admin session has expired */
  onAuthLost: () => void;
}

interface StopRow {
  name: string;
  lat: string;
  lng: string;
  time: string;
}

const emptyStop = (): StopRow => ({ name: '', lat: '', lng: '', time: '' });

const inputCls =
  'w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white';

export const BusFormModal: React.FC<BusFormModalProps> = ({ isOpen, bus, onClose, onSaved, onAuthLost }) => {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [startLocation, setStartLocation] = useState('MUET Jamshoro');
  const [destination, setDestination] = useState('');
  const [morningTime, setMorningTime] = useState('07:30 AM');
  const [returnTime, setReturnTime] = useState('02:15 PM & 04:30 PM');
  const [capacity, setCapacity] = useState('65');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [stops, setStops] = useState<StopRow[]>([
    { name: 'MUET Main Gate', lat: '25.4055', lng: '68.2598', time: '07:30 AM' },
    emptyStop(),
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = bus !== null;

  // Fill the form whenever it is opened
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (bus) {
      setNumber(bus.number);
      setName(bus.name);
      setStartLocation(bus.startLocation);
      setDestination(bus.destination);
      setMorningTime(bus.morningTime);
      setReturnTime(bus.returnTime);
      setCapacity(String(bus.capacity));
      setDriverName(bus.driverName);
      setDriverPhone(bus.driverPhone);
      setStops(bus.stops.map((s) => ({ name: s.name, lat: String(s.lat), lng: String(s.lng), time: s.time })));
    } else {
      setNumber('');
      setName('');
      setStartLocation('MUET Jamshoro');
      setDestination('');
      setMorningTime('07:30 AM');
      setReturnTime('02:15 PM & 04:30 PM');
      setCapacity('65');
      setDriverName('');
      setDriverPhone('');
      setStops([{ name: 'MUET Main Gate', lat: '25.4055', lng: '68.2598', time: '07:30 AM' }, emptyStop()]);
    }
  }, [isOpen, bus]);

  if (!isOpen) return null;

  const updateStop = (index: number, patch: Partial<StopRow>) =>
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const moveStop = (index: number, dir: -1 | 1) =>
    setStops((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });

  // Pasting "25.4055, 68.2598" fills both coordinate boxes
  const handleCoordPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const m = e.clipboardData.getData('text').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      e.preventDefault();
      updateStop(index, { lat: m[1], lng: m[2] });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payloadStops = [];
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const lat = Number(s.lat);
      const lng = Number(s.lng);
      if (!s.name.trim() || !s.time.trim() || s.lat.trim() === '' || s.lng.trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        setError(`Stop ${i + 1}: name, time, latitude and longitude are all required.`);
        return;
      }
      payloadStops.push({ name: s.name.trim(), lat, lng, time: s.time.trim() });
    }

    const payload: BusInput = {
      number: number.trim(),
      name: name.trim(),
      startLocation: startLocation.trim(),
      destination: destination.trim(),
      morningTime: morningTime.trim(),
      returnTime: returnTime.trim(),
      capacity: parseInt(capacity, 10) || 60,
      driverName: driverName.trim() || 'Staff Driver',
      driverPhone: driverPhone.trim() || 'N/A',
      stops: payloadStops,
    };

    setLoading(true);
    try {
      await apiFetch(isEdit ? `/api/buses/${encodeURIComponent(bus!.number)}` : '/api/buses', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      onSaved(payload.number);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthLost();
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-xl overflow-hidden text-left">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Bus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{isEdit ? `Edit Point ${bus!.number}` : 'Add Bus Route'}</h3>
              <p className="text-xs text-slate-500">
                Saved to <code className="text-emerald-700 font-semibold">data/buses.txt</code> by the C++ engine
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bus / Point No. *</label>
              <input className={inputCls} placeholder="e.g. 09" value={number} onChange={(e) => setNumber(e.target.value)} required />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Route Name *</label>
              <input className={inputCls} placeholder="e.g. Point 09" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Location *</label>
              <input className={inputCls} value={startLocation} onChange={(e) => setStartLocation(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Destination *</label>
              <input className={inputCls} placeholder="e.g. Gul Centre, Hyderabad" value={destination} onChange={(e) => setDestination(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Morning Departure *</label>
              <input className={inputCls} value={morningTime} onChange={(e) => setMorningTime(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Return Shifts *</label>
              <input className={inputCls} value={returnTime} onChange={(e) => setReturnTime(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Capacity</label>
              <input className={inputCls} type="number" min={1} max={200} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Driver Name</label>
              <input className={inputCls} value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Driver Contact</label>
              <input className={inputCls} placeholder="0300-1234567" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
            </div>
          </div>

          {/* Stops editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">Stops in order (first = start, last = end) *</label>
              <button
                type="button"
                onClick={() => setStops((prev) => [...prev, emptyStop()])}
                className="flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add stop
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              Tip: paste coordinates in the format "25.4055, 68.2598" into the Latitude box to fill both fields.
            </p>
            <div className="space-y-2">
              {stops.map((stop, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-center bg-slate-50 border border-slate-200 rounded-xl p-2">
                  <span className="col-span-1 text-center text-[11px] font-bold text-sky-700">{i + 1}</span>
                  <input className={`${inputCls} col-span-4`} placeholder="Stop name" value={stop.name} onChange={(e) => updateStop(i, { name: e.target.value })} />
                  <input className={`${inputCls} col-span-2`} placeholder="Lat" inputMode="decimal" value={stop.lat} onChange={(e) => updateStop(i, { lat: e.target.value })} onPaste={(e) => handleCoordPaste(i, e)} />
                  <input className={`${inputCls} col-span-2`} placeholder="Lng" inputMode="decimal" value={stop.lng} onChange={(e) => updateStop(i, { lng: e.target.value })} />
                  <input className={`${inputCls} col-span-2`} placeholder="07:30 AM" value={stop.time} onChange={(e) => updateStop(i, { time: e.target.value })} />
                  <div className="col-span-1 flex flex-col items-center">
                    <button type="button" onClick={() => moveStop(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Move up">
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button type="button" onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Move down">
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                  {stops.length > 2 && (
                    <button type="button" onClick={() => setStops((prev) => prev.filter((_, idx) => idx !== i))} className="col-span-12 justify-self-end text-[11px] text-rose-600 hover:text-rose-700 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Remove stop {i + 1}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow disabled:opacity-50 transition-all">
              {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Bus Route'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

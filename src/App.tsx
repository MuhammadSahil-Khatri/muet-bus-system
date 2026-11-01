/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bus,
  MapPin,
  Search,
  Clock,
  Phone,
  Plus,
  Navigation,
  RotateCcw,
  ArrowRight,
  Trash2,
  Pencil,
  AlertCircle,
  Lock,
  LogOut,
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import type { BusRoute } from './types/bus';
import { OpenStreetMapRouteMap } from './components/OpenStreetMapRouteMap';
import { BusFormModal } from './components/BusFormModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { apiFetch, ApiError } from './utils/api';
import { buildGoogleMapsLink } from './utils/maps';

export default function App() {
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchMode, setSearchMode] = useState<'point' | 'bus'>('point');
  const [searchTerm, setSearchTerm] = useState('');

  // Admin session
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<BusRoute | null>(null);

  const showNotice = (type: 'ok' | 'error', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 5000);
  };

  // Keeps the selected route if it still exists (or picks `preferNumber`)
  const applyRoutes = useCallback((list: BusRoute[], preferNumber?: string) => {
    setRoutes(list);
    setSelectedRoute((prev) => {
      const wanted = preferNumber ?? prev?.number;
      return list.find((b) => b.number === wanted) ?? list[0] ?? null;
    });
  }, []);

  // Fetch all buses via C++ backend
  const fetchAllBuses = useCallback(
    async (preferNumber?: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch('/api/buses');
        if (data.buses) {
          applyRoutes(data.buses, preferNumber);
        } else {
          setError(data.message || 'No buses loaded');
        }
      } catch (err: any) {
        setError(err.message || 'Error communicating with C++ backend');
      } finally {
        setLoading(false);
      }
    },
    [applyRoutes]
  );

  // Perform search via C++ backend
  const performSearch = useCallback(
    async (term: string, mode: 'point' | 'bus', preferNumber?: string) => {
      if (!term.trim()) {
        return fetchAllBuses(preferNumber);
      }

      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch(`/api/search?q=${encodeURIComponent(term)}&type=${mode}`);
        if (data.success && data.buses?.length) {
          applyRoutes(data.buses, preferNumber);
        } else {
          setRoutes([]);
          setSelectedRoute(null);
          setError(`No matching routes found for "${term}"`);
        }
      } catch (err: any) {
        setError(err.message || 'Search execution failed');
      } finally {
        setLoading(false);
      }
    },
    [applyRoutes, fetchAllBuses]
  );

  const reload = (preferNumber?: string) =>
    searchTerm.trim() ? performSearch(searchTerm, searchMode, preferNumber) : fetchAllBuses(preferNumber);

  // Initial load: routes and whether we are already logged in
  useEffect(() => {
    fetchAllBuses();
    apiFetch('/api/auth/me')
      .then((m) => setIsAdmin(Boolean(m.admin)))
      .catch(() => undefined);
  }, [fetchAllBuses]);

  // ----- admin session helpers -----
  const handleAuthLost = () => {
    setIsAdmin(false);
    setIsFormOpen(false);
    setIsLoginOpen(true);
    showNotice('error', 'Your admin session expired. Please sign in again.');
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setIsAdmin(false);
    setIsFormOpen(false);
    showNotice('ok', 'Signed out.');
  };

  // ----- admin actions -----
  const openAddForm = () => {
    setEditingBus(null);
    setIsFormOpen(true);
  };

  const openEditForm = (bus: BusRoute, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBus(bus);
    setIsFormOpen(true);
  };

  const handleDeleteBus = async (busNumber: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to remove Point ${busNumber} from data/buses.txt?`)) return;

    try {
      await apiFetch(`/api/buses/${encodeURIComponent(busNumber)}`, { method: 'DELETE' });
      showNotice('ok', `Point ${busNumber} deleted.`);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return handleAuthLost();
      showNotice('error', err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleSaved = (busNumber: string) => {
    showNotice('ok', editingBus ? `Point ${busNumber} updated.` : `Point ${busNumber} added.`);
    reload(busNumber);
  };

  // ----- search -----
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(searchTerm, searchMode);
  };

  const handleResetSearch = () => {
    setSearchTerm('');
    fetchAllBuses();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-sky-600 text-white shrink-0">
              <Bus className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">MUET Bus &amp; Route Management</h1>
              <p className="text-[11px] text-slate-500 truncate">Mehran University of Engineering &amp; Technology, Jamshoro</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin ? (
              <>
                <span className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" /> Admin
                </span>
                <button
                  onClick={openAddForm}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add Route</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 border border-slate-200 shadow-xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsLoginOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 border border-slate-200 shadow-xs"
              >
                <Lock className="w-3.5 h-3.5 text-sky-600" />
                Admin Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Toast */}
      {notice && (
        <div
          className={`fixed top-16 right-4 z-40 max-w-sm px-4 py-2.5 rounded-xl shadow-lg border text-xs font-medium flex items-center gap-2 ${
            notice.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notice.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {notice.text}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex-1 flex flex-col gap-5 w-full">
        {/* Search */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setSearchMode('point')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  searchMode === 'point' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-sky-600" />
                Search Point / Stop
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('bus')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  searchMode === 'bus' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Bus className="w-3.5 h-3.5 text-sky-600" />
                Search Bus Number
              </button>
            </div>

            <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={
                    searchMode === 'point'
                      ? "Enter destination or stop (e.g. 'Hyder Chowk', 'Latifabad')..."
                      : "Enter bus number (e.g. '05', '31', '01')..."
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 transition-all"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={handleResetSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Find Route</span>
              </button>
            </form>
          </div>
        </div>

        {/* Routes + Map */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Map (first on phones, right column on desktop) */}
          <div className="lg:col-span-7 lg:order-2 flex flex-col gap-3 lg:sticky lg:top-20">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-sky-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Route Map</h2>
              </div>
              {selectedRoute && (
                <span className="text-xs text-slate-500 truncate">
                  {selectedRoute.startLocation} ⇄ {selectedRoute.destination}
                </span>
              )}
            </div>
            <div className="h-[380px] lg:h-[calc(100vh-11rem)] w-full">
              <OpenStreetMapRouteMap route={selectedRoute} />
            </div>
          </div>

          {/* Routes list */}
          <div className="lg:col-span-5 lg:order-1 flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Available Buses ({routes.length})
                </h2>
              </div>
              {searchTerm && (
                <button onClick={handleResetSearch} className="text-xs text-sky-600 hover:text-sky-700 font-semibold">
                  Clear Filter
                </button>
              )}
            </div>

            {loading && (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
                <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Loading routes from file database...</p>
              </div>
            )}

            {error && !loading && (
              <div className="p-4 bg-white border border-rose-200 rounded-2xl text-left">
                <div className="flex items-start gap-2.5 text-rose-700 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-rose-900">Notification:</strong> {error}
                    <div className="mt-2">
                      <button onClick={handleResetSearch} className="text-xs text-sky-600 underline hover:text-sky-700 font-semibold">
                        Reset and show all routes
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!loading && routes.length === 0 && !error && (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
                <p className="text-xs text-slate-500">No routes found in local database.</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              {routes.map((bus) => {
                const isSelected = selectedRoute?.number === bus.number;
                const googleMapsUrl = buildGoogleMapsLink(bus);
                return (
                  <div
                    key={bus.number}
                    onClick={() => setSelectedRoute(bus)}
                    className={`p-4 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-white border-sky-500 ring-2 ring-sky-500/20 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2.5 py-0.5 rounded-lg bg-sky-100 text-sky-800 font-bold text-xs tracking-wider shrink-0">
                            Point {bus.number}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{bus.name}</h3>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={(e) => openEditForm(bus, e)}
                              className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                              title="Edit route"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteBus(bus.number, e)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete route"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="mt-2 text-xs flex items-center gap-1.5 text-slate-600 flex-wrap">
                        <span className="font-semibold text-emerald-700">{bus.startLocation}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-amber-700">{bus.destination}</span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <div>
                            <div className="text-[10px] text-slate-400">Morning Shift</div>
                            <span className="font-semibold text-slate-900">{bus.morningTime}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <div>
                            <div className="text-[10px] text-slate-400">Return Shifts</div>
                            <span className="font-semibold text-slate-900">{bus.returnTime}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>
                            {bus.driverName} ({bus.driverPhone})
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                          {bus.stops.length} Stops
                        </span>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <div className="text-[10px] uppercase font-bold text-sky-700 tracking-wider mb-2">
                          Route Stops &amp; Timings:
                        </div>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {bus.stops.map((stop, sIdx) => (
                            <div
                              key={sIdx}
                              className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-slate-50 border border-slate-200"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-[10px] font-bold">
                                  {stop.sequence}
                                </span>
                                <span className="text-slate-800 font-medium">{stop.name}</span>
                              </div>
                              <span className="text-slate-500 font-mono text-[11px]">{stop.time}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {googleMapsUrl && (
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View route in Google Maps
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Admin login */}
      <AdminLoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoggedIn={() => {
          setIsAdmin(true);
          setIsLoginOpen(false);
          showNotice('ok', 'Signed in as admin.');
        }}
      />

      {/* Admin only: create/edit form (never mounted for visitors) */}
      {isAdmin && (
        <>
          <BusFormModal
            isOpen={isFormOpen}
            bus={editingBus}
            onClose={() => setIsFormOpen(false)}
            onSaved={handleSaved}
            onAuthLost={handleAuthLost}
          />
        </>
      )}
    </div>
  );
}

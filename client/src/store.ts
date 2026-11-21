import { create } from 'zustand';
import type { HostState, PlayerState } from '../../shared/types';
import { socket } from './socket';

type View = 'home' | 'create' | 'host' | 'player' | 'admin';

type Store = {
  view: View;
  host: HostState | null;
  player: PlayerState | null;
  kicked: boolean;
  /** serverTime - clientTime, so countdowns follow the server clock */
  clockOffset: number;
  setView: (v: View) => void;
  reset: () => void;
};

const initialView: View = location.pathname.startsWith('/admin') ? 'admin' : 'home';

export const useStore = create<Store>((set) => ({
  view: initialView,
  host: null,
  player: null,
  kicked: false,
  clockOffset: 0,
  setView: (view) => {
    if (view === 'admin') history.pushState(null, '', '/admin');
    else if (location.pathname !== '/') history.pushState(null, '', '/');
    set({ view });
  },
  reset: () => {
    sessionStorage.removeItem('hostPin');
    sessionStorage.removeItem('hostKey');
    sessionStorage.removeItem('pin');
    sessionStorage.removeItem('playerId');
    set({ view: 'home', host: null, player: null, kicked: false });
  },
}));

export const serverNow = () => Date.now() + useStore.getState().clockOffset;

socket.on('host:state', (s: HostState) => useStore.setState({ host: s, clockOffset: s.serverNow - Date.now() }));
socket.on('player:state', (s: PlayerState) => useStore.setState({ player: s, clockOffset: s.serverNow - Date.now() }));
socket.on('player:kicked', () => useStore.setState({ kicked: true }));

// Re-attach after refresh / reconnect
socket.on('connect', () => {
  const hostPin = sessionStorage.getItem('hostPin');
  const hostKey = sessionStorage.getItem('hostKey');
  if (hostPin && hostKey) {
    socket.emit('host:rejoin', { pin: hostPin, hostKey }, (r: { ok: boolean }) => {
      if (r.ok) useStore.setState({ view: 'host' });
      else {
        sessionStorage.removeItem('hostKey');
        sessionStorage.removeItem('hostPin');
      }
    });
  }
  const pin = sessionStorage.getItem('pin');
  const playerId = sessionStorage.getItem('playerId');
  if (pin && playerId) {
    socket.emit('player:join', { pin, name: '', playerId }, (r: { ok: boolean }) => {
      if (r.ok) useStore.setState({ view: 'player' });
      else {
        sessionStorage.removeItem('playerId');
        sessionStorage.removeItem('pin');
      }
    });
  }
});

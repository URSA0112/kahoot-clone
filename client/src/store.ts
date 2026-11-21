import { create } from 'zustand';
import type { HostState, PlayerState } from '../../shared/types';
import { socket } from './socket';

type View = 'home' | 'create' | 'host' | 'player';

type Store = {
  view: View;
  host: HostState | null;
  player: PlayerState | null;
  kicked: boolean;
  setView: (v: View) => void;
  reset: () => void;
};

export const useStore = create<Store>((set) => ({
  view: 'home',
  host: null,
  player: null,
  kicked: false,
  setView: (view) => set({ view }),
  reset: () => {
    sessionStorage.clear();
    set({ view: 'home', host: null, player: null, kicked: false });
  },
}));

socket.on('host:state', (s: HostState) => useStore.setState({ host: s }));
socket.on('player:state', (s: PlayerState) => useStore.setState({ player: s }));
socket.on('player:kicked', () => useStore.setState({ kicked: true }));

// Re-attach after refresh / reconnect
socket.on('connect', () => {
  const hostPin = sessionStorage.getItem('hostPin');
  const hostKey = sessionStorage.getItem('hostKey');
  if (hostPin && hostKey) {
    socket.emit('host:rejoin', { pin: hostPin, hostKey }, (r: { ok: boolean }) => {
      if (r.ok) useStore.setState({ view: 'host' });
      else sessionStorage.removeItem('hostKey');
    });
  }
  const pin = sessionStorage.getItem('pin');
  const playerId = sessionStorage.getItem('playerId');
  if (pin && playerId) {
    socket.emit('player:join', { pin, name: '', playerId }, (r: { ok: boolean }) => {
      if (r.ok) useStore.setState({ view: 'player' });
      else sessionStorage.removeItem('playerId');
    });
  }
});

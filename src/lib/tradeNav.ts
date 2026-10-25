// src/lib/tradeNav.ts
//
// Tiny shared store for the TRADE tabs, so picking a country on the
// LEADERBOARD opens it on COUNTRY, and the COMPARE list survives switching
// tabs. In-memory only (resets on reload), like the rest of the app's UI state.

import { useSyncExternalStore } from 'react'

export const COMPARE_MAX = 8

interface TradeNavState {
  country: string     // ISO3 shown on the COUNTRY tab
  compare: string[]   // ISO3s on the COMPARE tab, in the order added
}

let state: TradeNavState = { country: 'USA', compare: ['USA', 'CHN', 'DEU', 'JPN', 'IND', 'MEX'] }
const listeners = new Set<() => void>()

function set(next: Partial<TradeNavState>) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

export const setTradeCountry = (iso3: string) => set({ country: iso3 })
export const setCompareList = (list: string[]) => set({ compare: list.slice(0, COMPARE_MAX) })
export const toggleCompare = (iso3: string) =>
  set({
    compare: state.compare.includes(iso3)
      ? state.compare.filter(c => c !== iso3)
      : state.compare.length < COMPARE_MAX ? [...state.compare, iso3] : state.compare,
  })

export function useTradeNav() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => state,
  )
}

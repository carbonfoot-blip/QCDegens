import { useState } from 'react'

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : initial
    } catch { return initial }
  })

  function set(val) {
    const v = val instanceof Function ? val(value) : val
    setValue(v)
    try { localStorage.setItem(key, JSON.stringify(v)) } catch {}
  }

  return [value, set]
}

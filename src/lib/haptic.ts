// Light tap feedback. Android: the vibrate API. iOS 18+ Safari has no vibrate, but flipping an
// <input switch> gives the system toggle tick, so we flip a hidden one. Only works inside a tap.
// ponytail: relies on Safari's switch-tick behaviour; if Apple drops it this silently does nothing.
export function haptic() {
  try {
    if (navigator.vibrate) return void navigator.vibrate(10)
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    label.style.display = 'none'
    label.ariaHidden = 'true'
    label.append(input)
    document.head.append(label)
    label.click()
    label.remove()
  } catch { /* no haptics here, that's fine */ }
}

// Tap feedback. iOS Safari has no vibrate API, but a real finger tap on a label for an
// <input switch> gives the system toggle tick. Flipping the switch from code doesn't, and neither
// does a link (it cancels the click), so: put <Tap /> inside a button with `relative`. It's an
// invisible label over the button for the hidden switch in index.html; the click still bubbles to
// the button. Android gets the vibrate API. Not for submit buttons (the label swallows the submit)
// or disabled ones (it would still tick).
// ponytail: leans on Safari's switch tick (tested on iOS 26); if Apple drops it, taps just go quiet.
export const Tap = () => <label htmlFor="haptic" aria-hidden className="absolute inset-0 rounded-[inherit]" onClick={() => navigator.vibrate?.(10)} />

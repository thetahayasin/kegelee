// Livewire 4 ships and boots its own bundle (including Alpine), so this file
// only carries small, app-wide helpers used by the workout player.

window.kegel = {
    // Light haptic tap on supported devices (no-op elsewhere / when disabled).
    haptic(ms = 20) {
        try {
            if (window.navigator?.vibrate) window.navigator.vibrate(ms);
        } catch (e) {
            /* ignore */
        }
    },
};

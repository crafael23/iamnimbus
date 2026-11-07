/** Browser storage helpers. Every access is guarded: storage can throw. */

const BOOT_KEY = "grid.booted";
const THREAD_KEY = "grid.guestThread";
const CLEAR_KEY = "grid.clearedAt:";

function read(store: Storage | undefined, key: string): string | null {
	try {
		return store?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function write(store: Storage | undefined, key: string, value: string) {
	try {
		store?.setItem(key, value);
	} catch {
		// Private mode or blocked storage: the feature degrades, nothing breaks.
	}
}

const session = () => (typeof window === "undefined" ? undefined : window.sessionStorage);

export const hasBooted = () => read(session(), BOOT_KEY) === "1";
export const markBooted = () => write(session(), BOOT_KEY, "1");

export const savedGuestThread = () => read(session(), THREAD_KEY) ?? undefined;
export const saveGuestThread = (id: string) => write(session(), THREAD_KEY, id);

export const clearedAt = (threadId: string) => Number(read(session(), CLEAR_KEY + threadId) ?? 0) || 0;
export const saveClearedAt = (threadId: string, count: number) => write(session(), CLEAR_KEY + threadId, String(count));

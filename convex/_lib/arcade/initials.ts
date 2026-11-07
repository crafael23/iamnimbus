export const INITIALS_LENGTH = 3;

const BLOCKED = new Set([
	"ASS",
	"CUM",
	"FAG",
	"FUC",
	"FUK",
	"FCK",
	"KKK",
	"NIG",
	"NGR",
	"TIT",
	"DIK",
	"DIC",
	"COK",
	"CUN",
	"KYS",
	"SHT",
]);

export function normalizeInitials(input: string): string | null {
	const initials = input.trim().toUpperCase();
	return /^[A-Z0-9]{3}$/.test(initials) && !BLOCKED.has(initials) ? initials : null;
}

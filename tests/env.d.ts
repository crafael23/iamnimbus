// Vite's import.meta.glob, without depending on vite's own type package.
interface ImportMeta {
	glob(
		pattern: string | string[],
	): Record<string, () => Promise<unknown>>;
}

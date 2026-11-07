/** Loaded with the game only, so none of this reaches the chat's initial bundle. */

export type Credit = { name: string; url: string; note: string };

/**
 * The open-source light-cycle projects this game learned from. Ideas only:
 * every line of the game is original, and no code or assets were copied.
 */
export const CREDITS: Credit[] = [
	{
		name: "CodeClash LightCycles",
		url: "https://github.com/CodeClash-ai/LightCycles",
		note: "deterministic tick rules, simultaneous and head-on crashes",
	},
	{
		name: "momajd/Tron",
		url: "https://github.com/momajd/Tron",
		note: "the reactive opponent that steers away from walls",
	},
	{
		name: "nlieb/PyTron",
		url: "https://github.com/nlieb/PyTron",
		note: "territory scoring for the opponent that cuts you off",
	},
	{
		name: "Tortured-Metaphor/LightCycle",
		url: "https://github.com/Tortured-Metaphor/LightCycle",
		note: "boost on a regenerating meter, and arcade game feel",
	},
	{
		name: "Armagetron Advanced",
		url: "https://www.armagetronad.org/",
		note: "riding close to walls as a skill, and decades of tuning",
	},
	{
		name: "erichlof/3dLightCycles",
		url: "https://github.com/erichlof/3dLightCycles",
		note: "trails that break apart when a rider crashes",
	},
	{
		name: "michaelsmueller/light-cycles",
		url: "https://github.com/michaelsmueller/light-cycles",
		note: "a plain browser canvas is enough for this game",
	},
	{
		name: "alecdwm/webtron",
		url: "https://github.com/alecdwm/webtron",
		note: "a modern browser light-cycle architecture",
	},
];

/** Read too, and worth reading. */
export const FURTHER: Credit[] = [
	{ name: "light-merch/TRON_multiplayer", url: "https://github.com/light-merch/TRON_multiplayer", note: "" },
	{ name: "kanishkdan/tron-game", url: "https://github.com/kanishkdan/tron-game", note: "" },
	{ name: "Balajanovski/tron-clone", url: "https://github.com/Balajanovski/tron-clone", note: "" },
	{ name: "philippotto/Tron3D", url: "https://github.com/philippotto/Tron3D", note: "" },
	{ name: "gsobell/lightcycle", url: "https://github.com/gsobell/lightcycle", note: "" },
];

export type CommandSpec = {
	name: string;
	hint: string;
	/** Local commands never reach the AI. */
	local?: boolean;
};

export const COMMANDS: CommandSpec[] = [
	{ name: "/projects", hint: "what has been built" },
	{ name: "/about", hint: "a short introduction" },
	{ name: "/resume", hint: "experience and skills" },
	{ name: "/blog", hint: "published writing" },
	{ name: "/contact", hint: "how to reach out" },
	{ name: "/help", hint: "list commands", local: true },
	{ name: "/clear", hint: "clear the screen", local: true },
];

export function matchCommands(input: string): CommandSpec[] {
	if (!input.startsWith("/") || /\s/.test(input)) return [];
	const q = input.toLowerCase();
	return COMMANDS.filter((c) => c.name.startsWith(q));
}

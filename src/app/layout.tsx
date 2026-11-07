import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Sixtyfour, VT323 } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { CrtScreen } from "@/components/CrtScreen";

/** Display: a variable face with real bleed and scanline axes, for titles only. */
const display = Sixtyfour({
	variable: "--nf-display",
	subsets: ["latin"],
	axes: ["BLED", "SCAN"],
});

/** The terminal's own glyphs, from a DEC VT320 character ROM. */
const crt = VT323({
	variable: "--nf-crt",
	subsets: ["latin"],
	weight: "400",
});

/** Long-form reading, code and the admin. */
const mono = IBM_Plex_Mono({
	variable: "--nf-mono",
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	style: ["normal", "italic"],
});

export const metadata: Metadata = {
	title: { default: "nimbus // grid", template: "%s · nimbus" },
	description: "A portfolio you can talk to. Ask the terminal about projects, writing and work.",
};

export const viewport: Viewport = {
	themeColor: "#000000",
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${display.variable} ${crt.variable} ${mono.variable}`}>
			<body>
				<ConvexClientProvider>
					<CrtScreen>{children}</CrtScreen>
				</ConvexClientProvider>
			</body>
		</html>
	);
}

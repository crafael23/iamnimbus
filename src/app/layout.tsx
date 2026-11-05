import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Martian_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";

const display = Martian_Mono({
	variable: "--nf-display",
	subsets: ["latin"],
	weight: ["300", "400", "600"],
});

const mono = IBM_Plex_Mono({
	variable: "--nf-mono",
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	style: ["normal", "italic"],
});

const prose = IBM_Plex_Sans({
	variable: "--nf-prose",
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	style: ["normal", "italic"],
});

export const metadata: Metadata = {
	title: { default: "nimbus // grid", template: "%s · nimbus" },
	description:
		"A portfolio you can talk to. Ask the terminal about projects, writing and work.",
};

export const viewport: Viewport = {
	themeColor: "#04070a",
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${display.variable} ${mono.variable} ${prose.variable}`}>
			<body>
				<ConvexClientProvider>{children}</ConvexClientProvider>
			</body>
		</html>
	);
}

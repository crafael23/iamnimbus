"use client";

import type { RefObject } from "react";
import { Field, inputClass } from "./ui";
import { slugify } from "./utils";

type TitleSlug = { title: string; slug: string };

/**
 * A title input and a slug input side by side. The slug follows the title
 * until someone edits it by hand; `slugTouchedRef` remembers that.
 */
export function TitleSlugFields({
	idPrefix,
	basePath,
	title,
	slug,
	slugTouchedRef,
	onChange,
}: TitleSlug & {
	idPrefix: string;
	basePath: string;
	slugTouchedRef: RefObject<boolean>;
	onChange: (next: TitleSlug) => void;
}) {
	return (
		<div className="grid gap-5 sm:grid-cols-2">
			<Field label="Title" htmlFor={`${idPrefix}-title`}>
				<input
					id={`${idPrefix}-title`}
					value={title}
					onChange={(e) =>
						onChange({ title: e.target.value, slug: slugTouchedRef.current ? slug : slugify(e.target.value) })
					}
					className={inputClass}
				/>
			</Field>
			<Field label="Slug" htmlFor={`${idPrefix}-slug`} hint={`${basePath}${slug || "…"}`}>
				<input
					id={`${idPrefix}-slug`}
					value={slug}
					onChange={(e) => {
						slugTouchedRef.current = true;
						onChange({ title, slug: e.target.value });
					}}
					className={inputClass}
				/>
			</Field>
		</div>
	);
}

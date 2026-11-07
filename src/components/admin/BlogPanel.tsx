"use client";

import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { SkeletonRows } from "./KnowledgePanel";
import { Button, Field, inputClass, MarkdownEditor, PanelHeader, StatusBadge } from "./ui";
import { TitleSlugFields } from "./TitleSlugFields";
import { errorMessage, formatTime } from "./utils";

export function BlogPanel() {
	const posts = useQuery(api.blog.queries.adminList);
	const [editing, setEditing] = useState<Id<"blogPosts"> | "new" | null>(null);

	if (editing) return <PostEditor postId={editing} onClose={() => setEditing(null)} />;

	return (
		<div>
			<PanelHeader
				title="Blog"
				description="Drafts are invisible to visitors and to the terminal. Publishing makes a post public and indexes it in one step; unpublishing reverses both."
				action={
					<Button tone="primary" onClick={() => setEditing("new")}>
						New post
					</Button>
				}
			/>
			{posts === undefined ? (
				<SkeletonRows />
			) : posts.length === 0 ? (
				<p className="border border-dashed border-line p-8 text-[13px] text-fog">
					No posts yet. Start one with <span className="text-cyan">New post</span>.
				</p>
			) : (
				<ul className="divide-y divide-line border-y border-line">
					{posts.map((post) => (
						<li key={post._id}>
							<button
								type="button"
								onClick={() => setEditing(post._id)}
								className="grid w-full gap-1 py-3.5 text-left transition-colors hover:bg-deep/60 sm:grid-cols-[1fr_7rem_10rem] sm:items-center sm:gap-4 sm:px-2"
							>
								<span className="min-w-0">
									<span className="block truncate text-[14px] text-ice">{post.title}</span>
									<span className="block text-[12px] text-dim">/blog/{post.slug}</span>
								</span>
								<StatusBadge status={post.status} />
								<span className="text-[12px] text-dim">{formatTime(post.updatedAt)}</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function PostEditor({ postId, onClose }: { postId: Id<"blogPosts"> | "new"; onClose: () => void }) {
	const post = useQuery(api.blog.queries.adminGet, postId === "new" ? "skip" : { postId });
	if (postId !== "new" && post === undefined) return <SkeletonRows />;
	return <PostForm key={post?._id ?? "new"} post={post ?? null} onClose={onClose} />;
}

type PostStatus = Doc<"blogPosts">["status"];

function initialPostForm(post: Doc<"blogPosts"> | null) {
	return {
		title: post?.title ?? "",
		slug: post?.slug ?? "",
		excerpt: post?.excerpt ?? "",
		content: post?.content ?? "",
	};
}

function PostForm({ post, onClose }: { post: Doc<"blogPosts"> | null; onClose: () => void }) {
	const [form, setForm] = useState(() => initialPostForm(post));
	// Only read while typing the title: changing it never needs a render.
	const slugTouched = useRef(Boolean(post));
	const [postId, setPostId] = useState<Id<"blogPosts"> | null>(post?._id ?? null);

	const live = useQuery(api.blog.queries.adminGet, postId ? { postId } : "skip");
	const create = useMutation(api.blog.mutations.create);
	const update = useMutation(api.blog.mutations.update);

	const status = live?.status ?? post?.status ?? "draft";

	const save = async (): Promise<Id<"blogPosts">> => {
		if (postId) {
			await update({ postId, ...form });
			return postId;
		}
		const id = await create(form);
		setPostId(id);
		return id;
	};

	return (
		<div>
			<PostHeader postId={postId} status={status} />
			<div className="grid gap-5">
				<TitleSlugFields
					idPrefix="post"
					basePath="/blog/"
					title={form.title}
					slug={form.slug}
					slugTouchedRef={slugTouched}
					onChange={(next) => setForm({ ...form, ...next })}
				/>
				<Field label="Excerpt" htmlFor="post-excerpt" hint="One or two sentences for the index page.">
					<textarea
						id="post-excerpt"
						rows={2}
						value={form.excerpt}
						onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
						className={`${inputClass} resize-y`}
					/>
				</Field>
				<Field label="Body" htmlFor="post-body">
					<MarkdownEditor id="post-body" value={form.content} onChange={(content) => setForm({ ...form, content })} />
				</Field>
				<PostActions
					postId={postId}
					status={status}
					liveSlug={live?.slug}
					canSave={Boolean(form.title.trim())}
					save={save}
					onClose={onClose}
				/>
			</div>
		</div>
	);
}

function PostHeader({ postId, status }: { postId: Id<"blogPosts"> | null; status: PostStatus }) {
	const index = useQuery(
		api.knowledge.queries.statusForSource,
		postId ? { source: "blog", sourceKey: postId } : "skip",
	);
	return (
		<PanelHeader
			title={postId ? "Edit post" : "New post"}
			description={
				status === "published"
					? "Published. Saving updates the live page and re-indexes it."
					: "Draft. Only you can see it."
			}
			action={
				<div className="flex items-center gap-3 text-[12px]">
					<StatusBadge status={status} />
					{index && <StatusBadge status={index.status} chunks={index.chunkCount} error={index.error} />}
				</div>
			}
		/>
	);
}

type Run = (label: string, fn: () => Promise<unknown>) => Promise<void>;

/** One action at a time: `busy` names the running action, `error` holds the last failure. */
function useBusyAction() {
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const run: Run = async (label, fn) => {
		setBusy(label);
		setError(null);
		try {
			await fn();
		} catch (e) {
			setError(errorMessage(e));
		}
		setBusy(null);
	};
	return { busy, error, run };
}

function saveLabel(busy: string | null, status: PostStatus) {
	if (busy === "save") return "Saving…";
	return status === "published" ? "Save changes" : "Save draft";
}

function PostActions({
	postId,
	status,
	liveSlug,
	canSave,
	save,
	onClose,
}: {
	postId: Id<"blogPosts"> | null;
	status: PostStatus;
	liveSlug: string | undefined;
	canSave: boolean;
	save: () => Promise<Id<"blogPosts">>;
	onClose: () => void;
}) {
	const { busy, error, run } = useBusyAction();
	const blocked = Boolean(busy);

	return (
		<>
			{error && <p className="text-[13px] text-danger">{error}</p>}
			<div className="flex flex-wrap gap-2">
				<Button onClick={() => void run("save", save)} disabled={blocked || !canSave}>
					{saveLabel(busy, status)}
				</Button>
				{status === "draft" ? (
					<PublishButton busy={busy} disabled={blocked || !canSave} run={run} save={save} />
				) : (
					<UnpublishButton busy={busy} postId={postId} run={run} />
				)}
				{status === "published" && liveSlug !== undefined && (
					<a href={`/blog/${liveSlug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center px-2 text-[13px] text-cyan hover:text-ice">
						View post ↗
					</a>
				)}
				<span className="flex-1" />
				<Button tone="ghost" onClick={onClose}>
					Back to posts
				</Button>
				{postId && <DeletePostButton postId={postId} disabled={blocked} run={run} onDeleted={onClose} />}
			</div>
		</>
	);
}

function PublishButton({
	busy,
	disabled,
	run,
	save,
}: {
	busy: string | null;
	disabled: boolean;
	run: Run;
	save: () => Promise<Id<"blogPosts">>;
}) {
	const publish = useMutation(api.blog.mutations.publish);
	return (
		<Button
			tone="primary"
			disabled={disabled}
			onClick={() =>
				void run("publish", async () => {
					const id = await save();
					await publish({ postId: id });
				})
			}
		>
			{busy === "publish" ? "Publishing…" : "Publish"}
		</Button>
	);
}

function UnpublishButton({ busy, postId, run }: { busy: string | null; postId: Id<"blogPosts"> | null; run: Run }) {
	const unpublish = useMutation(api.blog.mutations.unpublish);
	return (
		<Button disabled={Boolean(busy) || !postId} onClick={() => postId && void run("unpublish", () => unpublish({ postId }))}>
			{busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
		</Button>
	);
}

function DeletePostButton({
	postId,
	disabled,
	run,
	onDeleted,
}: {
	postId: Id<"blogPosts">;
	disabled: boolean;
	run: Run;
	onDeleted: () => void;
}) {
	const remove = useMutation(api.blog.mutations.remove);
	return (
		<Button
			tone="danger"
			disabled={disabled}
			onClick={() => {
				if (window.confirm("Delete this post? A published post is also removed from the terminal's memory.")) {
					void run("delete", async () => {
						await remove({ postId });
						onDeleted();
					});
				}
			}}
		>
			Delete
		</Button>
	);
}

# Portfolio OS — Product Feature Specification

---

## Vision

Most developer portfolios are static artifacts. A list of projects. A PDF resume linked somewhere. A blog that hasn't been updated in two years. They are read, not experienced. They answer the question _"what has this person built?"_ but never _"who is this person?"_

This product answers both. It presents work, writing, and identity — but its defining feature is a living, conversational AI that lets any visitor have a genuine dialogue with a digital representation of me. Not a chatbot. Not a FAQ widget. A thoughtful, knowledgeable presence that knows my story, understands my work, and speaks to my ambitions with the depth and fluency of someone who has absorbed everything I have ever written or built.

The product has three surfaces: a **Blog**, a **Portfolio**, and a **Terminal Chat**. The first two establish credibility and context. The third is the reason someone stays.

---

## Tech Stack

| Layer               | Technology                                       |
| ------------------- | ------------------------------------------------ |
| Frontend            | Next.js (App Router)                             |
| Backend / DB        | Convex                                           |
| AI / LLM            | Anthropic Claude via AI SDK                      |
| Embeddings          | AI SDK (`text-embedding-3-small`)                |
| Agent & Threads     | `@convex-dev/agent`                              |
| RAG / Vector Search | `@convex-dev/rag`                                |
| Streaming           | `@convex-dev/persistent-text-streaming`          |
| Rate Limiting       | `@convex-dev/rate-limiter` (via Agent component) |
| Auth                | `@convex-dev/workos-authkit`                     |
| GitHub Integration  | GitHub REST API                                  |

---

## The Blog

The blog is a space for long-form thinking — technical deep dives, opinions on craft, reflections on projects. Each post is an artifact of deliberate thought. Posts live as private drafts until consciously published. Draft state is entirely invisible to the world — unindexed, unlinked, unreachable. Publishing is a single, decisive action.

What makes the blog architecturally significant is what happens at the moment of publication. Publishing a post does not just render it as a public page — it immediately triggers ingestion into the AI's knowledge base. The post is chunked, embedded, and indexed without any further action required. From the moment it is live, the AI can draw on it when answering questions. A visitor who asks _"have you written about authentication?"_ receives an answer grounded in what has actually been published. Writing and the AI's memory are the same act. There is no synchronization step between them.

---

## The Portfolio

The portfolio is a curated record of what I have built — not a GitHub dump, but a considered selection that represents who I am as a builder.

Each project is a structured document: the problem, the solution, the technical decisions made, the technologies involved, and the outcome. This narrative framing matters. It tells the story of how I think, not just what I shipped. The difference between a list of projects and a portfolio is the presence of judgment — why this, why this way, what would I do differently.

The portfolio draws from two sources simultaneously. Projects are authored manually with full narrative control. GitHub is connected as a live data source — the AI has access to public repositories, descriptions, languages, README content, and activity data, synced on demand. Every project document is ingested into the knowledge base. The portfolio is not just a visual surface — it is directly queryable through the terminal chat. Asking _"what stack did you use for that?"_ returns answers drawn from the actual project records.

---

## The Terminal Chat

This is the product. Everything else leads here.

The terminal chat is a TRON-inspired, full-screen conversational interface where any visitor can have a real conversation with an AI that knows everything about me. It is not a support bot. It is a character — a digital proxy that speaks to my background, projects, thinking, goals, and availability with the depth of someone who has absorbed everything I have ever written or built.

### Visual Identity — TRON as Philosophy

The visual language is TRON — not as a surface-level theme, but as a philosophy. The grid. The glow. The sense that you have stepped into a system.

The terminal is dark, near black, with neon cyan text carrying a faint luminescence. The font is monospace throughout. The background holds a subtle geometric grid pattern referencing the iconic TRON landscape without literally recreating it. Every UI element — borders, prompts, cursor — glows. The environment has weight. It feels like a place.

When the page loads, a **boot sequence** plays. Lines of text initialize the system, introduce the experience, and settle into a blinking input prompt. The boot sequence is not decoration. It is the door — before a single word is typed, the visitor understands what kind of experience they are entering. The atmosphere is established in advance of the conversation.

Responses stream in token by token, rendered as a typewriter effect. The AI does not pop in — it _types_. Every character appears sequentially, the cursor advancing as it goes. Reading a response feels like watching something come to life in real time. This is not just aesthetic — it is the primary feedback mechanism communicating that the AI is thinking, processing, present. When streaming concludes, the cursor blinks once and holds, signaling completion.

The layout is strictly terminal: input fixed at the bottom, history scrolling upward. User messages and AI responses are visually distinct — differentiated by color, indentation, and prompt prefix. The interface enforces the metaphor structurally, not just visually.

**Slash commands** are available as first-class shortcuts. `/projects`, `/resume`, `/contact`, `/about`, and others allow visitors who want to navigate with intent rather than open-ended conversation. These commands are handled by the AI as structured prompts — they produce consistent, formatted responses appropriate to what was requested.

### The AI's Knowledge and Voice

The AI is shaped by a rich, carefully authored **system prompt** that encodes my personal narrative, professional history, values, goals, and voice. It is instructed to speak as a knowledgeable representative of me — not as a generic assistant, not as a third-party narrator, but as a presence that has fully internalized who I am and can express it naturally and conversationally.

Behind the system prompt is a **structured knowledge base** — a curated collection of documents covering every significant project, my career arc, technical and soft skills, ambitions, and all published writing. When a visitor asks something that requires specific knowledge, the AI retrieves the most semantically relevant material from this knowledge base and incorporates it directly into its response before generating it.

Retrieval is not triggered on every message. The AI is explicitly instructed to evaluate each incoming message and decide whether reaching into the knowledge base will genuinely improve the response. Casual exchanges and general questions are handled directly. Specific questions about work, history, or background trigger a semantic vector search, pulling the highest-scoring chunks and injecting them as context. The distinction between retrieved and direct responses is invisible to the visitor. The conversation stays fluid — it never feels like a database lookup.

```
User message arrives
         │
         ▼
Agent evaluates: does this need retrieval?
         │
    ┌────┴────┐
   Yes        No
    │          │
    ▼          │
@convex-dev/rag    │
semantic search    │
across namespaces  │
    │              │
    ▼              │
Top-k chunks       │
injected into      │
context window     │
    │              │
    └──────┬───────┘
           ▼
   Agent generates response
           │
           ▼
@convex-dev/persistent-text-streaming
  ├── HTTP stream → terminal typewriter (live session)
  └── DB write   → persisted response (future sessions / refresh)
```

### Persistent Streaming Architecture

The typewriter effect is not merely cosmetic — it is backed by an architectural decision that makes it both maximally performant and durable.

`@convex-dev/persistent-text-streaming` combines two mechanisms in parallel. The active browser session receives an HTTP stream of tokens as they are generated — raw, low-latency, character by character. Simultaneously, the response is written to the Convex database at sentence boundaries. These two operations happen concurrently.

The consequence: the live session gets maximum streaming performance with no database roundtrip latency. Any other client, or a page refresh mid-response, retrieves the in-progress or completed response directly from the database — nothing is lost. A response that was streaming when a visitor accidentally closed the tab is fully available when they return.

The `status` field returned by `useStream` drives the cursor behavior directly: `"streaming"` advances the typewriter cursor; `"done"` finalizes the output, blinks once, holds. The UI state is derived entirely from stream state — no polling, no client-side timers, no manual cursor management.

```typescript
const { text, status } = useStream(
	api.chat.getChatBody,
	new URL(`${convexSiteUrl}/chat-stream`),
	isCurrentSession, // true = this client drives the HTTP stream
	message.streamId,
);
// status: "streaming" | "done" | "error"
// text: full accumulated response content
```

### Conversational Thread Persistence

Every conversation is a **thread** managed by `@convex-dev/agent`. A thread is not a message array — it is a first-class entity in the database with its own identity, ownership, and lifecycle.

For registered users, threads are persistent and cumulative. A thread created in one session is the exact thread resumed in the next. The AI has access to the complete prior conversation history as context on every new message. Conversations accumulate — questions build on prior answers, references to earlier exchanges are understood, the AI knows it is talking to the same person it spoke with last week. This continuity is what transforms the terminal from a feature into a relationship.

For guests, threads are ephemeral and scoped to the session. The experience is complete and functional — but it does not remember you.

The Agent component also provides **built-in hybrid vector and text search over the thread's own message history** — meaning that even within a single long conversation, the AI can retrieve relevant prior context efficiently rather than exhausting the context window with the entire history.

---

## User Tiers and Access Control

### Guest — Unauthenticated

Any visitor opens the terminal and starts chatting with no account required. This frictionlessness is intentional. The first impression must be pure — no signup wall, no authentication gate. Just the boot sequence and an open prompt.

Guest sessions use **Claude Haiku** — fast, capable for most conversational exchanges. The guest experience is real and complete. The knowledge base is accessible. The aesthetic is fully intact. The AI responds with full persona. The only differences are model depth and the absence of persistence.

Guests may send up to **10 messages per session**, enforced server-side via `@convex-dev/rate-limiter`, keyed to the session. It cannot be circumvented client-side.

At message **7**, the terminal prints a quiet inline notice in the natural flow of conversation — rendered in the AI's own voice, not as a system popup. A nudge that lives within the TRON world without disrupting it.

At message **10**, the session ends. The terminal acknowledges this in character. A glowing call-to-action presents the invitation to authenticate. The gate is framed as the beginning of something more substantial, not as a wall.

### Registered User — Authenticated

Authenticated users receive a materially different experience across two dimensions: **capability** and **continuity**.

The AI model upgrades to **Claude Sonnet** — stronger reasoning, greater coherence across multi-turn exchanges, richer responses to complex questions. The difference is perceptible. It earns the friction of sign-up.

The conversation becomes **persistent**. The user's thread survives page refreshes, browser closes, and return visits. The AI carries full context from all prior exchanges. Conversations build on themselves.

Registered users receive **30 messages per day**, on a rolling 24-hour window, enforced server-side.

The model routing decision is made entirely on the backend, keyed to auth state. There is no client-side flag, no trust in client-provided parameters:

```typescript
// Two agents defined — one per tier
export const guestAgent = new Agent(components.agent, {
	model: anthropic("claude-haiku-3-5"),
	system: baseSystemPrompt,
	maxTokens: 1024,
});

export const registeredAgent = new Agent(components.agent, {
	model: anthropic("claude-sonnet-4-5"),
	system: baseSystemPrompt,
	maxTokens: 2048,
});

// Server-side routing — auth state decides, always
const user = await authKit.getAuthUser(ctx);
const agent = user ? registeredAgent : guestAgent;
```

### The Visitor Profile — Onboarding as Conversation

After signing in, the terminal presents an optional onboarding sequence. Not a form — a continuation of the conversation. The AI poses a small set of questions, typed into the terminal one at a time, in full character. The visitor responds inline, skips freely at any point. There is no submit button. There is no sense of obligation.

The questions are purposeful: name, professional role, what brought them here, whether they are evaluating me for a role or collaboration, and optionally how they found the site. These answers are stored on the user record in Convex and injected into the system prompt context for the current session and every future one.

The AI uses this profile actively. A visitor who identifies as a **recruiter** experiences an AI that is more deliberate about surfacing achievements, experience, and availability — without being asked. A **fellow developer** encounters an AI that goes deeper on technical decisions and architectural tradeoffs without over-explaining. Someone just **exploring** gets a lighter, curiosity-driven conversation without professional framing.

If a name was provided, the AI uses it. Throughout every session, forever. The onboarding sequence does not repeat.

---

## Authentication and Identity

Authentication is handled through `@convex-dev/workos-authkit` — the official Convex-native WorkOS AuthKit integration. It provides a polished embeddable login experience with support for major social and enterprise identity providers (Google, GitHub, Microsoft, and others).

The component operates through a **webhook-driven sync model**. WorkOS fires `user.created`, `user.updated`, and `user.deleted` events to a Convex HTTP endpoint whenever identity changes occur. The component handles these events durably — the Convex `users` table is always an accurate reflection of the WorkOS identity state. There is no polling, no manual sync, no eventual consistency gap.

```typescript
// Durable, event-driven user sync
export const { authKitEvent } = authKit.events({
	"user.created": async (ctx, event) => {
		await ctx.db.insert("users", {
			authId: event.data.id,
			email: event.data.email,
			name: `${event.data.firstName} ${event.data.lastName}`,
			role: "user",
			onboardingComplete: false,
		});
	},
	"user.updated": async (ctx, event) => {
		const user = await ctx.db
			.query("users")
			.withIndex("authId", (q) => q.eq("authId", event.data.id))
			.unique();
		await ctx.db.patch(user._id, {
			email: event.data.email,
			name: `${event.data.firstName} ${event.data.lastName}`,
		});
	},
	"user.deleted": async (ctx, event) => {
		const user = await ctx.db
			.query("users")
			.withIndex("authId", (q) => q.eq("authId", event.data.id))
			.unique();
		await ctx.db.delete(user._id);
	},
});
```

There are exactly **three identity states** in this product:

A **guest** has no account. They experience the terminal in its limited, ephemeral form — real and complete, but bounded.

A **registered user** has an authenticated account. They receive Claude Sonnet, persistent threads, personalized profile context, 30 messages per day, and a growing conversational history.

The **admin** is exclusively me. This role is set manually in the database and cannot be granted through any product UI. WorkOS AuthKit's **Actions** feature provides an additional gate at the identity layer — registration can be restricted or blocked at the WorkOS level before it reaches the application. Every admin Convex function independently verifies the role:

```typescript
const user = await authKit.getAuthUser(ctx);
if (!user || user.role !== "admin") throw new Error("Unauthorized");
```

---

## The Knowledge Base

The knowledge base is the AI's memory. It is a curated, structured collection of documents the AI draws from when answering questions about my work, background, and identity. Built on `@convex-dev/rag`, it handles chunking, embedding, vector indexing, and semantic retrieval as first-class primitives — no external vector database, no secondary service.

Documents are organized into namespaces that reflect their nature and scope retrieval context:

| Namespace  | Contents                                                                    |
| ---------- | --------------------------------------------------------------------------- |
| `projects` | One document per project — problem, solution, stack, key decisions, outcome |
| `history`  | Biography, career arc, formative experiences                                |
| `skills`   | Technical depth and breadth, soft skills, ways of working                   |
| `goals`    | Direction, ambitions, what I am optimizing for, what I am not               |
| `blog`     | Every published post, ingested automatically at publication                 |
| `github`   | Live repository summaries synced from the GitHub REST API                   |

Every document goes through the same ingestion pipeline: split into semantically meaningful chunks, each chunk embedded into a high-dimensional vector, both stored in Convex's native vector index. This pipeline runs synchronously with document saves — writing a document and the AI knowing it are the same act.

Retrieval is filtered by namespace when context warrants it. A question about a specific project searches `projects` directly rather than scanning everything. Chunk context is configurable — the system can pull surrounding chunks (before and after the matched chunk) to provide the AI with enough context for a retrieved passage to make sense. This prevents the common RAG failure mode where a retrieved chunk is semantically similar to the query but meaningless without its neighbors.

The GitHub integration feeds the `github` namespace on demand. A sync pulls repository names, descriptions, primary languages, README content, star counts, and recency data, summarizes each as a document, and upserts into the knowledge base. The AI's awareness of current work is never more than one manual sync behind.

---

## The Admin Interface

The admin interface is a private, auth-gated workspace. It is the operational center for every living part of this product — not a CMS, but a command center for a product that needs to evolve as I do.

### Knowledge Base Manager

Every document in the knowledge base is visible, queryable, and manageable. Documents display namespace, indexing status, last update time, and chunk count. The health of the knowledge base is transparent at all times — no invisible background state.

Creating or editing a document triggers immediate re-ingestion. The document is rechunked, re-embedded, and updated vectors replace prior ones. The AI's knowledge updates synchronously with the save. Document deletion removes the document and all associated chunks and embeddings atomically — no orphaned or stale vectors.

The GitHub sync control lives here. A single action pulls the current state of all public repositories and updates the `github` namespace. The sync is idempotent and the last sync time is always visible.

### Blog Editor

The blog is authored entirely within the admin. Posts have explicit draft and published states — no ambiguity about what is visible to the world. Publishing performs two atomic operations: the post becomes publicly accessible on the blog, and it is ingested into the `blog` namespace. These happen together or not at all. Unpublishing reverses both.

### System Prompt Editor

The system prompt is a first-class document maintained through a dedicated editor. Every save creates a new version. The complete version history is browsable. Any prior version can be restored instantly. Changes take effect on the next chat request — no deployment, no restart, no propagation delay.

This matters because the system prompt is not static. As my career evolves, as I finish projects and start new ones, as my goals shift, the AI's narrative must shift with it. The system prompt editor makes this a deliberate, low-friction act of maintenance — not an engineering task.

The `@convex-dev/agent` **Agent Playground** is also accessible from the admin — a built-in debug interface for inspecting conversation context, testing retrieval behavior, and iterating on prompts against real knowledge base data during development and tuning.

### Visitor Analytics

The admin surfaces behavioral signal from the terminal: session volume split by guest and registered, visitor profile distribution (developers, recruiters, explorers), conversion rate from guest to registered, sign-ups attributed directly to the message limit gate, and the most frequently asked topics.

This is not vanity analytics. The most-asked topics reveal which parts of my story resonate and where the knowledge base has gaps. Conversion rate signals how compelling the first 10 messages are. Recruiter versus developer distribution informs how to balance depth and accessibility in the system prompt. Every metric feeds back into improving the product.

The `@convex-dev/agent` component provides **built-in usage tracking** per user, per model, and per agent. Token consumption by tier (guest Haiku vs. registered Sonnet) is available without any custom instrumentation — it is an inherent capability of the Agent component.

---

## Data Architecture

The entire product runs on Convex. There is no external database, no separate vector store, no secondary service for sessions or caching. Every piece of state — user records, chat threads, knowledge base chunks, blog posts, system prompt versions, streaming responses — lives in Convex.

```
users                → linked to WorkOS identity via authId; holds role, visitor profile, onboarding state
threads              → owned by @convex-dev/agent; one per user session
messages             → owned by @convex-dev/agent; full conversation history per thread
streamBodies         → owned by @convex-dev/persistent-text-streaming; persisted response content
ragEntries           → owned by @convex-dev/rag; document chunks with embeddings and namespace tags
blogPosts            → authored content with explicit draft / published state
systemPromptVersions → complete version history of the system prompt
```

The `@convex-dev/agent` component owns thread and message management. The application instructs the agent; the agent manages its own state. Message history, context window management, usage tracking, and rate limiting are all handled by the component — no custom logic required for any of these concerns.

---

## Design Principles

**The AI is me, not a product.** Every decision about voice, knowledge, and behavior serves one goal: the experience should feel like a genuine conversation with a person, not an interaction with a tool. The AI should feel like I am, in some meaningful sense, present.

**The aesthetic is not decoration.** The TRON visual identity is not a theme applied to a generic chat UI. It is the product's personality. The glow, the grid, the boot sequence, the typewriter effect — each earns its place by making the visitor feel like they have entered something intentional and alive. Nothing is cosmetic. Everything is load-bearing.

**Friction is a product decision.** The 10-message guest cap exists to create a meaningful moment of commitment, not to restrict. The onboarding questions exist to make the AI a better partner, not to capture leads. Every point of friction is deliberate and should feel like it is serving the visitor.

**The knowledge base is the heart.** A chat UI can be copied. A TRON aesthetic can be replicated. A knowledge base that accurately represents who I am, what I have built, and where I am going cannot be. Keeping it current and deep is the most important ongoing responsibility this product creates.

**Writing is infrastructure.** Every blog post, every project document, every entry added to the knowledge base makes the AI more accurate and more interesting to talk to. This product creates a direct incentive to write well and write often. The quality of the AI's answers is a direct reflection of the quality of what I have written. The two are inseparable.

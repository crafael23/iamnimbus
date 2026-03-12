# Portfolio OS — Product Feature Specification

---

## Vision

This is not a portfolio. Or rather — it is not *only* a portfolio.

Most developer portfolios are static artifacts. A list of projects. A PDF resume linked somewhere. A blog that hasn't been updated in two years. They are read, not experienced. They answer the question *"what has this person built?"* but never *"who is this person?"*

This product answers both. It presents work, writing, and identity — but its defining feature is a living, conversational AI that lets any visitor have a genuine dialogue with a digital representation of me. Not a chatbot. Not a FAQ widget. A thoughtful, knowledgeable presence that knows my story, understands my work, and can speak to my ambitions as fluently as I can.

The product has three surfaces: a **Blog**, a **Portfolio**, and a **Terminal Chat**. The first two exist to establish credibility and context. The third is the reason someone stays.

---

## The Blog

The blog is a space for long-form thinking — technical deep dives, opinions on the craft, reflections on projects, and anything worth writing down. It is not a content marketing feed. Each post is an artifact of thought, authored with care and published deliberately.

Posts are written and managed exclusively through the Admin interface. They support rich formatting and are rendered publicly with clean, distraction-free typography. The blog is not just a reading destination — every published post is automatically woven into the AI's knowledge base. A visitor who asks *"have you written about authentication?"* will get an answer that draws directly from what I've actually published. Writing and memory are the same act.

Posts live in draft state until deliberately published. A draft exists privately in the admin, invisible to the world, until it is ready. Publishing is a conscious decision, not an accident.

---

## The Portfolio

The portfolio is a curated record of what I have built. It is not a dump of every public repository — it is a considered selection of work that represents who I am as a builder, presented with enough depth to be genuinely informative.

Each project is more than a title and a screenshot. It captures the problem, what I built to solve it, the decisions I made, the technologies involved, and what the outcome was. This narrative framing matters: it tells the story of how I think, not just what I shipped.

The portfolio draws from two sources. Projects I care about are authored manually with full narrative control. GitHub is connected as a live data source — the AI is aware of my public repositories, their descriptions, the languages used, and the activity within them. This gives the portfolio a living dimension: it reflects work happening now, not just a curated snapshot from the last time I remembered to update the site.

---

## The Terminal Chat

This is the product. Everything else leads here.

The terminal chat is a TRON-inspired, full-screen conversational interface that lets any visitor have a real conversation with an AI that knows everything about me. It is not a support bot. It is not a FAQ engine. It is a character — a digital proxy that can speak to my background, my projects, my thinking, my goals, and my availability, with the depth and fluency of someone who has read everything I've ever written or built.

### The Aesthetic

The visual language is TRON — not as a surface-level theme, but as a philosophy. The grid. The glow. The sense that you have stepped into a system. The terminal is dark, almost black, with neon cyan text that carries a faint luminescence. The font is monospace. The background holds a subtle grid pattern, referencing the iconic TRON landscape without recreating it literally.

When the page loads, a boot sequence plays. Lines of text initialize the system, introduce the experience, and settle into a blinking input prompt. This is the moment the visitor understands what kind of experience they are entering — before a single word is typed, the atmosphere is established. The boot sequence is not decoration. It is the door.

Responses stream in token by token, rendered with a typewriter effect that reinforces the terminal metaphor. The AI does not pop in — it *types*. Reading a response feels like watching something come to life in real time.

The layout is strictly terminal: input fixed at the bottom, history scrolling upward. The user's messages and the AI's responses are visually distinct. Slash commands are available as shortcuts — `/projects`, `/resume`, `/contact`, and others — for visitors who want to navigate with intent rather than through open conversation.

### The AI's Voice and Knowledge

The AI is shaped by a rich, carefully authored system prompt that encodes my personal narrative, my professional history, my values, my goals, and my voice. It is instructed to speak as a knowledgeable representative of me — not as a generic assistant, not as a third-party narrator, but as a presence that has fully internalized who I am and can express it naturally and conversationally.

Behind the system prompt is a structured knowledge base: a curated collection of documents covering every significant project I have worked on, my career arc, my technical and soft skills, my ambitions, and my published writing. When a visitor asks something that requires specific knowledge — *"tell me about the authentication system you built"* or *"what do you want to be doing in five years?"* — the AI retrieves the most relevant material from this knowledge base and incorporates it into its response.

This is not a chatbot making things up. Everything the AI says about me is grounded in documents I have written and maintained. The knowledge base is the source of truth, and the AI is its voice.

Retrieval is not triggered on every message. The AI is instructed to decide, based on the nature of the question, whether reaching into the knowledge base will genuinely improve the response. Casual conversation and general questions are handled directly. Specific questions about work, history, or background trigger a semantic search and inject the most relevant context before the response is generated. The conversation stays fluid — it never feels like a database lookup.

### Guest Access

Any visitor can open the terminal and start chatting without an account. This frictionlessness is intentional. The first impression should be pure — no signup wall, no authentication gate, just the boot sequence and an open prompt.

Guest sessions use a lightweight AI model that is fast and capable for most conversational exchanges. The experience is complete: the AI is fully functional, the knowledge base is accessible, and the aesthetic is intact. Guests can send up to 10 messages per session.

At message 7, the terminal prints a subtle inline notice — not a modal, not a disruption, just a quiet line in the flow of conversation. Something like: *"a few messages remaining — sign in for more, and a smarter AI."* This is a nudge that lives within the terminal's voice. It does not break the experience.

At message 10, the session ends. The terminal acknowledges this in character — the system announces the session has concluded — and a glowing call-to-action invites the visitor to sign in or create a free account to continue. The gate is framed as an upgrade. It is the natural end of a sample and the beginning of something more.

### Registered Access

Authenticated users receive a meaningfully different experience across two dimensions: capability and continuity.

The AI model is upgraded to a more capable, more nuanced version — one that handles complex, multi-part questions with greater depth, maintains more coherent reasoning across longer exchanges, and produces richer, more considered responses. The difference is perceptible. It earns the moment of friction that sign-up required.

The conversation is no longer ephemeral. A registered user's thread is persistent — it survives page refreshes, browser closes, and return visits days later. Coming back to the site picks up exactly where the conversation left off. The AI carries the context of prior exchanges, allowing conversations to build on themselves rather than restart from zero each time. This is what transforms the terminal from a feature into a relationship.

Registered users receive 30 messages per day, resetting on a rolling basis. This is generous enough for any meaningful conversation.

### The Visitor Profile

After signing in, the terminal presents an optional onboarding sequence — not a form, but a continuation of the conversation. The AI poses a small set of questions, typed into the terminal one at a time, in character. The visitor responds inline, skips freely, and ends the sequence at any point. There is no submit button. There is no sense of obligation.

The questions are purposeful: who are you, what brings you here, what is your professional context, are you open to connecting? The answers are not collected as data — they are used to make the AI a better conversational partner immediately.

If a visitor identifies as a recruiter or someone evaluating me for a role, the AI shifts in a natural way — it becomes more deliberate about surfacing professional achievements, relevant experience, and availability. If they are a fellow developer, the AI goes deeper into technical territory, discussing architectural decisions and tradeoffs without over-explaining. If they are just exploring, the tone stays light, curious, and wide-ranging.

The AI addresses the visitor by name throughout the conversation if they have provided it. The profile carries forward into every future session — the AI remembers who it is talking to, and the onboarding sequence does not repeat.

---

## The Admin Interface

The admin interface is a private, fully gated workspace accessible only to me. It is the control center for everything: the knowledge base, the blog, the AI's voice, and the analytics of who is visiting and what they care about. It is not a CMS. It is a command center for a living product.

### Knowledge Base Management

The knowledge base is the AI's memory. It is a collection of documents — authored manually or pulled from connected sources — that the AI draws from when answering questions about my work and background. The admin makes this knowledge base fully transparent and fully manageable.

Documents are organized into clear categories: individual project write-ups, personal history and biography, skills and experience, goals and direction, and blog posts. Each document can be created, edited, or removed at any time. When a document is saved, it is immediately processed and indexed — the AI's knowledge updates without delay. There is no batch job, no deployment, no waiting period. Writing something new and the AI knowing it are the same act.

The admin displays the indexing status of every document. Successfully embedded and indexed documents are clearly marked. Anything pending or errored is surfaced for attention. The health of the knowledge base is always visible.

GitHub is a live connected source. The admin can trigger a sync at any time, pulling the current state of public repositories — descriptions, languages, README content, activity — and pushing that information into the knowledge base. The AI's awareness of my GitHub work is always current, without any manual curation on my part.

### Blog Authoring

The blog is written entirely within the admin. The editor supports rich text and markdown, with real-time preview. Posts are saved privately as drafts and can be iterated on indefinitely before publication.

Publishing a post does two things simultaneously: it makes the post publicly visible on the blog, and it automatically ingests it into the knowledge base. From the moment of publication, the AI can speak to the ideas in that post. There is no separate step to surface writing to the AI — the act of publishing is the act of teaching.

### System Prompt Control

The AI's voice and behavior are governed by the system prompt — the document that encodes who I am, how I speak, and what I want the AI to do when someone asks it a question. This is not a config value buried in an environment variable. It is a first-class artifact, authored and maintained through a dedicated editor in the admin.

The system prompt can be edited at any time and takes effect immediately. Previous versions are retained, and any prior state can be restored. This matters because the system prompt is not static. As I grow, as my goals shift, as my work evolves, the AI's narrative must evolve with it. The system prompt editor makes this intentional and low-friction.

### Visitor Analytics

The admin surfaces a clear picture of who is using the terminal and what they are asking. Session volume broken down by guest versus authenticated visitors. The most commonly asked topics. Conversion rate from guest to registered. Visitor profile breakdowns — developers, recruiters, explorers. Sign-ups attributed to the message limit gate.

This is not vanity analytics. It is signal. Knowing what people ask the AI reveals what aspects of my story resonate, what is unclear, and where the knowledge base has gaps. It turns visitor behavior into a feedback loop for improving the product.

---

## Access & Identity

Authentication is handled through WorkOS AuthKit, which provides a clean, embeddable login experience with support for major social and enterprise identity providers. Visitors are not asked to fill out a form to sign up — they authenticate through their chosen provider, and the product takes it from there.

There are three distinct identity states in the product.

A **guest** has no account. They experience the terminal in its limited, ephemeral form — a real but bounded introduction to what the product offers.

A **registered user** has a verified account. They receive the full experience: the more capable AI model, persistent conversation threads, personalized responses based on their profile, and 30 messages per day. Their identity and history are stored, and every return visit builds on the last.

The **admin** is exclusively me. This role unlocks the private workspace — the knowledge base manager, the blog editor, the system prompt editor, and the analytics dashboard. The admin role is not self-service and cannot be granted through the product UI.

---

## Design Principles

**The AI is me, not a product.** Every decision about the AI's voice, knowledge, and behavior should serve one goal: making the experience feel like a genuine conversation with a person, not an interaction with a tool. The AI should feel like I am, in some meaningful sense, present.

**The aesthetic is not decoration.** The TRON visual identity is not a theme layered over a generic chat UI. It is the product's personality. The glow, the grid, the boot sequence, the typewriter effect — each one earns its place by making the visitor feel like they have entered something intentional and alive.

**Friction is a product decision.** The guest limit exists not to restrict but to create a meaningful moment of commitment. The onboarding questions exist not to capture data but to make the AI a better partner. Every point of friction in this product is deliberate, purposeful, and should always feel like it is serving the visitor — not extracting from them.

**The knowledge base is the heart.** A chat UI can be copied. A TRON aesthetic can be replicated. But a knowledge base that accurately represents who I am, what I have built, and where I am going — that is irreducible. Keeping it accurate, deep, and current is the most important ongoing responsibility this product creates.

**Writing is infrastructure.** Every blog post, every project write-up, every document added to the knowledge base makes the AI more accurate and more interesting to talk to. This product creates a direct incentive to write well and write often — the quality of the AI's answers is a direct reflection of the quality of what I have written. The two are inseparable.
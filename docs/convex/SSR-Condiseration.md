Convex is designed to work well for both:

1. **Client-side, reactive apps (client–server communication)**
    - The main JS clients (`ConvexReactClient`, `ConvexClient`, `ConvexHttpClient`) give you live queries over WebSocket and one-off queries/mutations over HTTP from browsers and other JS runtimes. [[JS client](https://docs.convex.dev/client/javascript); [API modules](https://docs.convex.dev/api/)]
    - In a Next.js app, you typically use `ConvexReactClient` with `<ConvexProvider>` on the client for fully reactive UI. [[Next.js quickstart](https://docs.convex.dev/quickstart/nextjs); [Next.js app router](https://docs.convex.dev/client/nextjs/app-router/)]

2. **Server-side usage in Next.js (SSR, Server Components, Server Actions, Route Handlers)**  
   Convex has a dedicated `convex/nextjs` module for server-side integration: [[Nextjs module](https://docs.convex.dev/api/modules/nextjs)]
    - **Server Components / SSR (non‑reactive data):**  
      Use `fetchQuery` to load Convex data directly in Server Components. [[Server rendering](https://docs.convex.dev/client/nextjs/app-router/server-rendering#using-convex-to-render-server-components)]

        ```ts
        import { fetchQuery } from "convex/nextjs";
        import { api } from "@/convex/_generated/api";

        export async function StaticTasks() {
          const tasks = await fetchQuery(api.tasks.list, { list: "default" });
          return <div>...</div>;
        }
        ```

    - **Preloading for SSR + client reactivity:**  
      Use `preloadQuery` in a Server Component and `usePreloadedQuery` in a Client Component to get SSR plus live updates after hydration. [[Server rendering](https://docs.convex.dev/client/nextjs/app-router/server-rendering)]
    - **Server Actions & Route Handlers:**  
      Use `fetchMutation` / `fetchAction` / `fetchQuery` from `convex/nextjs` inside Server Actions and Route Handlers to read/write Convex from the Next.js backend. [[Server actions & routes](https://docs.convex.dev/client/nextjs/app-router/server-rendering#server-actions-and-route-handlers)]

        ```ts
        import { api } from "@/convex/_generated/api";
        import { fetchMutation, fetchQuery } from "convex/nextjs";
        import { revalidatePath } from "next/cache";

        export default async function PureServerPage() {
          const tasks = await fetchQuery(api.tasks.list, { list: "default" });
          async function createTask(formData: FormData) {
            "use server";
            await fetchMutation(api.tasks.create, {
              text: formData.get("text") as string,
            });
            revalidatePath("/example");
          }
          return <form action={createTask}>...</form>;
        }
        ```

3. **Authentication on the server side**
    - For standard auth providers (Clerk, Auth0, custom JWT), you can pass a token into `fetchQuery` / `fetchMutation` via the `NextjsOptions` `{ token }` when you need authenticated calls from the Next.js server. [[Nextjs module](https://docs.convex.dev/api/modules/nextjs); [Pages router SSR](https://docs.convex.dev/client/nextjs/pages-router/#server-side-rendering)]
    - With Convex Auth / Better Auth, there are helpers like `convexAuthNextjsToken` and `fetchAuthMutation` that wire authentication into server actions automatically. [[Server-side auth](https://labs.convex.dev/auth/authz/nextjs#calling-authenticated-mutations-and-actions); [Better Auth Next.js](https://labs.convex.dev/better-auth/framework-guides/next#usage)]

Summary: Convex is not only for client-side communication; it has first-class support for Next.js server features (SSR, Server Components, Server Actions, Route Handlers) via `convex/nextjs`, while still encouraging client-side reactivity for live data.

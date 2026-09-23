import { getUsageStats, statsEmitter, getActiveRequests, getLast10Minutes } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  const state = { closed: false, keepalive: null, send: null, sendPending: null, cachedStats: null };

  const stream = new ReadableStream({
    async start(controller) {
      // Tell EventSource the base reconnect delay (client backoff overrides on repeated failures)
      try {
        controller.enqueue(encoder.encode("retry: 3000\n\n"));
      } catch { /* client already gone */ }
      // Full stats refresh (heavy) + immediate lightweight push
      state.send = async () => {
        if (state.closed) return;
        try {
          // Push lightweight update immediately so UI reflects changes fast
          if (state.cachedStats) {
            const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
            const last10Minutes = await getLast10Minutes();
            const quickStats = { ...state.cachedStats, activeRequests, recentRequests, errorProvider, last10Minutes };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(quickStats)}\n\n`));
          }
          // Then do full recalc and update cache
          const stats = await getUsageStats();
          state.cachedStats = stats;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(stats)}\n\n`));
        } catch {
          state.closed = true;
          statsEmitter.off("update", state.send);
          statsEmitter.off("pending", state.sendPending);
          clearInterval(state.keepalive);
        }
      };

      // Lightweight push: only refresh activeRequests + recentRequests on pending changes
      state.sendPending = async () => {
        if (state.closed || !state.cachedStats) return;
        try {
          const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
          const last10Minutes = await getLast10Minutes();
          const stats = { ...state.cachedStats, activeRequests, recentRequests, errorProvider, last10Minutes };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(stats)}\n\n`));
        } catch {
          state.closed = true;
          statsEmitter.off("update", state.send);
          statsEmitter.off("pending", state.sendPending);
          clearInterval(state.keepalive);
        }
      };

      await state.send();

      statsEmitter.on("update", state.send);
      statsEmitter.on("pending", state.sendPending);

      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          state.closed = true;
          clearInterval(state.keepalive);
        }
      }, 25000);

      // The bucket series advances with wall-clock time, not with traffic, so it
      // must be re-sent even when no request event fires. Without this the stream
      // keeps serving the window captured at connect time.
      state.bucketTick = setInterval(() => {
        if (state.closed || !state.cachedStats) return;
        state.sendPending();
      }, 60000);
    },

    cancel() {
      state.closed = true;
      statsEmitter.off("update", state.send);
      statsEmitter.off("pending", state.sendPending);
      clearInterval(state.keepalive);
      clearInterval(state.bucketTick);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

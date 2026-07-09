interface Env {
  ASSETS?: Fetcher;
}

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json(
        {
          ok: true,
          service: "artinchip-flash-web",
          runtime: "cloudflare-workers"
        },
        { headers: jsonHeaders }
      );
    }

    if (url.pathname === "/api/version") {
      return Response.json(
        {
          name: "artinchip-flash-web",
          version: "0.1.0",
          webusb: {
            vendorId: "0x33c3",
            productId: "0x6677"
          }
        },
        { headers: jsonHeaders }
      );
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;

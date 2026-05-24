export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    
    // Default to the Fronius Solar.web API if no target is specified
    let targetUrl = 'https://swqapi.solarweb.com';
    
    // Add the path from the original request
    targetUrl += url.pathname + url.search;

    // Handle OPTIONS requests (CORS preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, AccessKeyId, AccessKeyValue, Accept",
          "Access-Control-Max-Age": "86400",
        }
      });
    }

    // Prepare headers for the target API
    const newHeaders = new Headers(request.headers);
    // Spoof origin/referer as the target API strictly checks it
    newHeaders.set("Origin", "https://swqapi.solarweb.com");
    newHeaders.set("Referer", "https://swqapi.solarweb.com/");
    
    // Remove headers that might cause the target server to reject the proxy
    newHeaders.delete("Host");

    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: "follow",
    });

    try {
      const response = await fetch(modifiedRequest);
      
      // Copy the response to modify headers
      const modifiedResponse = new Response(response.body, response);
      
      // Add generous CORS headers to the response back to the client
      modifiedResponse.headers.set("Access-Control-Allow-Origin", "*");
      modifiedResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      
      return modifiedResponse;
    } catch (e: any) {
      return new Response(e.message || "Proxy Error", { 
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};

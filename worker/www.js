// www.foreveranvil.com → foreveranvil.com (permanent redirect, same path and query).
// A separate tiny Worker (wrangler.www.jsonc), so the main site's pages keep being served
// without running any code.
export default {
  fetch(request) {
    const url = new URL(request.url);
    url.hostname = "foreveranvil.com";
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }
};

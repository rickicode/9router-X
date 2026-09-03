import { bearerAuth } from "./_base.js";

const BASE = "https://api.cloudflare.com/client/v4/accounts";

export default {
  buildUrl: (_model, creds) => {
    const accountId = creds?.providerSpecificData?.accountId;
    if (!accountId) throw new Error("cloudflare-ai requires accountId in providerSpecificData");
    return `${BASE}/${accountId}/ai/v1/embeddings`;
  },
  buildHeaders: (creds) => ({ "Content-Type": "application/json", ...bearerAuth(creds) }),
  buildBody: (model, { input, encoding_format, dimensions }) => {
    const body = { model, input };
    if (encoding_format) body.encoding_format = encoding_format;
    if (dimensions != null && dimensions !== "") {
      const dim = Number(dimensions);
      if (Number.isFinite(dim) && dim > 0) body.dimensions = dim;
    }
    return body;
  },
  normalize: (responseBody) => responseBody,
};

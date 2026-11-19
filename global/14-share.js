/** query শেয়ারের লিংক: URL-এর # অংশে query আর dataset (সার্ভারে কিছু যায় না) */
(function (root) {
    var isNode = typeof module !== 'undefined' && module.exports;
    var M0 = isNode ? require('./10-datasets.js') : root.SqlDatasets;
    var isDatasetId = M0.isDatasetId;

    const toBase64Url = (text) => {
        const bytes = new TextEncoder().encode(text);
        let binary = "";
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const fromBase64Url = (data) => {
        const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
        return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    };
    function encodeShare(query, dataset) {
        return `#d=${dataset}&q=${toBase64Url(query)}`;
    }
    function decodeShare(hash) {
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const q = params.get("q");
        const d = params.get("d");
        if (!q || !isDatasetId(d))
            return null;
        try {
            const query = fromBase64Url(q);
            return query.length > 0 && query.length < 20_000 ? { query, dataset: d } : null;
        }
        catch {
            return null;
        }
    }

    var api = { encodeShare: encodeShare, decodeShare: decodeShare };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SqlShare = api;
})(typeof self !== 'undefined' ? self : this);

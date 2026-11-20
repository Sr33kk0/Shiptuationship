/** @type {import('next').NextConfig} */
export default {
  agentRules: false,
  // No framing (a framed page could trick a moderator into clicking Clear / Save review) and no MIME sniffing.
  headers: async () => [{
    source: "/:path*",
    headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ],
  }],
};

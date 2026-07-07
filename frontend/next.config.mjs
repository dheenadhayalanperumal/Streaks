/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static HTML export — deployable to any static host (cPanel public_html).
  output: "export",
  // Emit /route/index.html so Apache serves clean URLs on refresh.
  trailingSlash: true,
  // No image optimization server in a static export.
  images: { unoptimized: true },
};

export default nextConfig;

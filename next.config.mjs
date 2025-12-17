/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const isProxied = process.env.USE_PROXY === 'true';

const nextConfig = {
    reactStrictMode: false,
    basePath: (isProd || isProxied) ? '/document_processing' : '',
    assetPrefix: (isProd || isProxied) ? '/document_processing' : '',
};

export default nextConfig;

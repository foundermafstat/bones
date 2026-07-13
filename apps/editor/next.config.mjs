import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const editorDir = dirname(fileURLToPath(import.meta.url));
const workspaceDist = (packageName) => resolve(editorDir, `../../packages/${packageName}/dist/index.js`);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@bones/compiler": workspaceDist("compiler"),
      "@bones/ldtk-adapter": workspaceDist("ldtk-adapter"),
      "@bones/platformer-preview": workspaceDist("platformer-preview"),
      "@bones/runtime-pixi": workspaceDist("runtime-pixi"),
      "@bones/schema": workspaceDist("schema"),
      "@bones/vector-core": workspaceDist("vector-core")
    };
    return config;
  }
};

export default nextConfig;

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react()],
  define: {
    // 版本号取自 package.json，构建时间取构建那一刻。
    // 不用 git 信息是因为 .dockerignore 排除了 .git，镜像构建时读不到。
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});

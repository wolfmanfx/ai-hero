import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    setupFiles: ["dotenv/config"],
		testTimeout: 240_000, // 2 minutes
  },
  plugins: [tsconfigPaths()],
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/utils/money.ts',
        'src/utils/password.ts',
        'src/utils/token.ts',
        'src/services/permission.service.ts',
        'src/config/permissions.ts'
      ]
    }
  }
});

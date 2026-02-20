import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: 'schema',
  migrations: {
    path: 'migrations',
  },
});

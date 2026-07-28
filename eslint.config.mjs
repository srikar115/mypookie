import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Architecture boundaries — enforced in CI per `.cursor/rules/architecture.mdc`
 * rule 12. These rules encode the dependency direction from the SOLID modular
 * monolith blueprint (`.agents/docs/nextjs_fullstack_solid_modular_architecture.docx`).
 *
 * If you're about to disable one of these locally: stop, read the rule, and
 * ask whether the code belongs in a different layer.
 */
const architectureBoundaries = {
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            // Rule 4 & 5: domain/application layers must not import framework,
            // React, Prisma client, or provider SDKs. Enforced by pattern
            // matching on the *importer's* file path via per-file overrides
            // below — this base rule bans deep module imports from anywhere.
            group: [
              "@/modules/*/domain/*",
              "@/modules/*/application/*",
              "@/modules/*/infrastructure/*",
              "@/modules/*/presentation/*",
              "@/modules/*/composition/*",
            ],
            message:
              "Deep module imports are forbidden (rule 7). Import from the module's public API at '@/modules/<feature>' instead.",
          },
          {
            group: ["@/lib/*"],
            message:
              "'@/lib' no longer exists. Use '@/shared/*', '@/modules/*', or '@/config/*'. See .cursor/rules/architecture.mdc.",
          },
        ],
      },
    ],
  },
};

/**
 * Domain layer: plain TypeScript, no framework / no infrastructure.
 * Applies to every file under any module's `domain/` folder.
 */
const domainLayerRules = {
  files: ["src/modules/*/domain/**/*.{ts,tsx}", "src/shared/domain/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "next",
              "next/*",
              "react",
              "react-dom",
              "react/*",
              "@prisma/client",
              "@prisma/adapter-*",
              "ioredis",
              "stripe",
              "openai",
              "@anthropic-ai/*",
              "@aws-sdk/*",
              "@/shared/infrastructure/*",
              "@/modules/*/infrastructure/*",
              "@/modules/*/presentation/*",
              "@/modules/*/composition/*",
              "@/composition/*",
              "@/app/*",
              "@/components/*",
              "@/shared/presentation/*",
            ],
            message:
              "Domain layer must be plain TypeScript — no framework, no infrastructure, no presentation (rules 4, 5, 6). Move framework-dependent code to application/infrastructure/presentation.",
          },
        ],
      },
    ],
  },
};

/**
 * Application layer: use cases + ports. No framework or concrete infra.
 */
const applicationLayerRules = {
  files: ["src/modules/*/application/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "next",
              "next/*",
              "react",
              "react-dom",
              "react/*",
              "@prisma/client",
              "@prisma/adapter-*",
              "stripe",
              "openai",
              "@anthropic-ai/*",
              "@aws-sdk/*",
              "@/shared/infrastructure/*",
              "@/modules/*/infrastructure/*",
              "@/modules/*/presentation/*",
              "@/composition/*",
              "@/app/*",
              "@/components/*",
              "@/shared/presentation/*",
            ],
            message:
              "Application layer depends on abstractions, not framework or concrete infrastructure (rule 4). Define a port here and implement it in infrastructure.",
          },
        ],
      },
    ],
  },
};

/**
 * app/ delivery layer: only imports module public APIs, shared, composition,
 * and config. No direct Prisma / provider SDK / deep module reach.
 */
const appLayerRules = {
  files: ["src/app/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "@prisma/client",
              "@prisma/adapter-*",
              "stripe",
              "openai",
              "@anthropic-ai/*",
            ],
            message:
              "Delivery layer must not use Prisma or provider SDKs directly (rule 3). Call a use case via composition.",
          },
          {
            group: [
              "@/modules/*/domain/*",
              "@/modules/*/application/*",
              "@/modules/*/infrastructure/*",
              "@/modules/*/presentation/*",
              "@/modules/*/composition/*",
            ],
            message:
              "app/ may only import from module public APIs (rule 7): '@/modules/<feature>'.",
          },
        ],
      },
    ],
  },
};

/**
 * Client Components ("use client") must not reach into server-only modules.
 * We can't detect the "use client" pragma statically, but we can ban server-
 * only modules from being pulled through the client-safe surface.
 *
 * Any file under `src/components/**` that imports server-only infra is a bug —
 * components should receive data as props from Server Components.
 */
const componentLayerRules = {
  files: ["src/components/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "@/shared/infrastructure/*",
              "@/modules/*/infrastructure/*",
              "@/composition/*",
              "@/config/env",
              "@prisma/client",
              "ioredis",
              "pg",
              "@aws-sdk/*",
              "next-auth",
            ],
            message:
              "Client components must not import server-only modules (rule 8). Pass data down as props from a Server Component instead.",
          },
        ],
      },
    ],
  },
};

/**
 * config/env.ts is the ONLY place allowed to read `process.env.*`. Everything
 * else imports the validated `env` object.
 */
const envAccessRule = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/config/env.ts", "src/instrumentation.ts"],
  rules: {
    "no-restricted-properties": [
      "error",
      {
        object: "process",
        property: "env",
        message:
          "Direct 'process.env' access is banned. Import 'env' from '@/config/env'. See .cursor/rules/architecture.mdc.",
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  architectureBoundaries,
  domainLayerRules,
  applicationLayerRules,
  appLayerRules,
  componentLayerRules,
  envAccessRule,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

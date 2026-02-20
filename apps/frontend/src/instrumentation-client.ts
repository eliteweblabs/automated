import posthog from 'posthog-js';

if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    defaults: '2025-11-30',
    api_host: '/relay',
    person_profiles: 'always',
    ui_host: 'https://us.posthog.com',
  });
}

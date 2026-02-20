import type { Workflow } from './types';

export const HACKER_NEWS_DEV_TOOLS: Workflow = {
  name: 'Top Hacker News Dev Tools',
  startingUrl: 'https://news.ycombinator.com',
  steps: [
    {
      type: 'loop',
      description: 'Top 30 posts',
      steps: [
        {
          type: 'extract',
          description: 'Extract the title and the link of the post',
        },
        {
          type: 'conditional',
          condition: 'If the post is a developer tool',
          trueSteps: [
            {
              type: 'save',
              description: 'Save the title and the link of the post',
            },
          ],
        },
      ],
    },
  ],
};

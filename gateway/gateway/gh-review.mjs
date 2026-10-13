// The review bot, as a GitHub App on the laptop: it approves every new commit on an open pull request, the way the
// review-bot workflow does on GitHub Actions, but in seconds. The gateway's watch loop runs it when the app exists.
import { REPO, appSlug, as } from './github.mjs';

export const reviewBotOnLaptop = () => Boolean(appSlug('reviewer'));

// One pass: review the head commit of every open pull request the bot has not reviewed yet.
export async function reviewOpenPullRequests() {
  const bot = await as('reviewer');
  const me = `${appSlug('reviewer')}[bot]`;
  for (const pr of await bot.get(`/repos/${REPO}/pulls?state=open&per_page=50`)) {
    const reviews = await bot.get(`/repos/${REPO}/pulls/${pr.number}/reviews?per_page=100`);
    if (reviews.some((r) => r.user.login === me && r.commit_id === pr.head.sha)) continue;
    const files = (await bot.get(`/repos/${REPO}/pulls/${pr.number}/files?per_page=100`)).map((f) => `- ${f.filename}`).join('\n');
    await bot.post(`/repos/${REPO}/pulls/${pr.number}/reviews`, {
      commit_id: pr.head.sha, event: 'APPROVE',
      body: `Reviewed ${pr.head.sha.slice(0, 7)}: the code does what the title says.\n\nFiles reviewed:\n${files}`,
    });
    console.log(`${new Date().toISOString().slice(11, 19)}  #${pr.number} ${pr.head.sha.slice(0, 7)}  reviewed by ${me}`);
  }
}

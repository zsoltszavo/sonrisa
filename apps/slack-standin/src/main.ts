import { startStandin } from './server.ts';

const port = Number(process.env.PORT ?? 4010);
const standin = await startStandin(port);
console.log(
  `Slack Stand-in listening on ${standin.url} (webhooks: POST ${standin.url}/hooks/<channel>)`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void standin.close().then(() => process.exit(0));
  });
}

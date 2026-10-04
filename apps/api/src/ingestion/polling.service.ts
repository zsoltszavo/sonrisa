import {
  ConflictException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EventSourceKey, PollResult } from '@sonrisa/shared';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { dedupeByExternalId } from './adapter.js';
import { AdapterRegistry } from './adapter-registry.js';
import { IngestionService } from './ingestion.service.js';

/** How often the scheduler looks for due sources. Intervals are whole seconds ≥ 30 (D5). */
const TICK_MS = 5_000;
/** A poll (fetch + storing) that takes longer than this stops and is recorded as failed. */
const POLL_TIMEOUT_MS = 30_000;
/** lastError is shown in the admin view; a whole stack trace or HTML error page is not useful there. */
const MAX_ERROR_LENGTH = 1_000;

export interface PollSchedule {
  enabled: boolean;
  intervalSec: number | null;
  lastPollAt: Date | null;
}

/** A source is due when it is enabled, polled at all, and its interval has passed since the last poll. */
export function isDue(source: PollSchedule, now: Date): boolean {
  if (!source.enabled || source.intervalSec === null) return false;
  if (source.lastPollAt === null) return true;
  return now.getTime() - source.lastPollAt.getTime() >= source.intervalSec * 1000;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The DB-driven scheduler (D5). Every tick re-reads the Event Sources, so an admin's change to
 * `enabled` or `intervalSec` applies from the next tick without a restart. Polls of one source
 * never overlap: a source with a poll in flight is skipped by the scheduler and "poll now"
 * answers 409. The interval counts from the end of the previous poll (lastPollAt).
 *
 * Assumes one API instance: the in-flight guard is in memory. Running several would need a
 * database lease (e.g. a conditional update on lastPollAt) — see the S4 retro.
 */
@Injectable()
export class PollingService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PollingService.name);
  private readonly inFlight = new Map<EventSourceKey, Promise<PollResult>>();
  private readonly shutdown = new AbortController();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapters: AdapterRegistry,
    private readonly ingestion: IngestionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('INGESTION_SCHEDULER', { infer: true }) === 'on') this.scheduleTick();
  }

  async onModuleDestroy(): Promise<void> {
    clearTimeout(this.timer);
    this.shutdown.abort();
    await this.whenIdle();
  }

  /** Resolves once every poll in flight has finished (each one records its own outcome). */
  async whenIdle(): Promise<void> {
    await Promise.allSettled(this.inFlight.values());
  }

  /** Starts a poll of every due source that has none in flight; returns the keys it started. */
  async tick(now = new Date()): Promise<EventSourceKey[]> {
    const sources = await this.prisma.eventSource.findMany({
      select: { key: true, enabled: true, intervalSec: true, lastPollAt: true },
    });
    // Shutdown may have begun while we read; whenIdle() would not wait for polls started now (CR32).
    if (this.shutdown.signal.aborted) return [];
    const due = sources.filter((source) => isDue(source, now) && !this.inFlight.has(source.key));
    for (const { key } of due) {
      // Not awaited: a slow GDACS poll must not hold up the next USGS tick.
      this.poll(key).catch((error: unknown) => {
        // Only reachable if recording the outcome itself failed (e.g. the database is down).
        this.logger.error(`Poll of ${key} could not be recorded: ${describe(error)}`);
      });
    }
    return due.map((source) => source.key);
  }

  /** Polls one source now ("poll now", or a due tick). Throws 409 if one is already running. */
  poll(key: EventSourceKey): Promise<PollResult> {
    // Check and claim in the same synchronous step, so two callers can never both get through.
    if (this.inFlight.has(key)) {
      return Promise.reject(new ConflictException(`A poll of ${key} is already running`));
    }
    const run = this.run(key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  private scheduleTick(): void {
    this.timer = setTimeout(() => {
      this.tick()
        .catch((error: unknown) => {
          // The loop must survive a database outage; the next tick tries again.
          this.logger.error(`Scheduler tick failed: ${describe(error)}`);
        })
        .finally(() => {
          if (!this.shutdown.signal.aborted) this.scheduleTick();
        });
    }, TICK_MS);
  }

  private async run(key: EventSourceKey): Promise<PollResult> {
    const source = await this.prisma.eventSource.findUniqueOrThrow({
      where: { key },
      select: { id: true },
    });
    const result: PollResult = {
      source: key,
      fetched: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      ignored: 0,
      skipped: 0,
      failed: 0,
      error: null,
    };

    const signal = AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(POLL_TIMEOUT_MS)]);
    try {
      const batch = await this.adapters.get(key).poll(signal);
      const { events, duplicates } = dedupeByExternalId(batch.events);
      const skipped = [...batch.skipped, ...duplicates];
      const summary = await this.ingestion.ingest(source.id, events, signal);
      Object.assign(result, {
        fetched: batch.fetched,
        created: summary.created,
        updated: summary.updated,
        unchanged: summary.unchanged,
        ignored: batch.ignored,
        skipped: skipped.length,
        failed: summary.failed.length,
      });
      const done = summary.created + summary.updated + summary.unchanged + summary.failed.length;
      const problems = [
        ...skipped.map((item) => `skipped ${item.externalId ?? '(no id)'}: ${item.reason}`),
        ...summary.failed.map((item) => `failed ${item.externalId}: ${item.reason}`),
      ];
      if (done < events.length) {
        result.error = `Stopped after ${String(done)} of ${String(events.length)} Events: ${describe(signal.reason)}`;
      } else if (problems.length > 0) {
        result.error = `${String(problems.length)} item(s) not stored; first: ${problems[0] ?? ''}`;
      }
    } catch (error) {
      // The whole poll failed (network, HTTP status, feed shape): recorded, not thrown.
      result.error = describe(error);
    }

    // Cut short by shutdown: not the source's fault, so nothing is recorded (and the database
    // may already be closing). The next start polls it again (CR31).
    if (this.shutdown.signal.aborted) {
      this.logger.log(`Poll of ${key} interrupted by shutdown`);
      return { ...result, error: 'Interrupted by shutdown' };
    }
    if (result.error !== null) this.logger.warn(`Poll of ${key}: ${result.error}`);
    await this.prisma.eventSource.update({
      where: { id: source.id },
      data: { lastPollAt: new Date(), lastError: result.error?.slice(0, MAX_ERROR_LENGTH) ?? null },
    });
    return result;
  }
}

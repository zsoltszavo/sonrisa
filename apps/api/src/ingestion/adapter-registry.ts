import { Injectable } from '@nestjs/common';
import type { EventSourceKey } from '@sonrisa/shared';
import type { EventSourceAdapter } from './adapter.js';
import { GdacsAdapter } from './gdacs.adapter.js';
import { SimulatedAdapter } from './simulated.adapter.js';
import { UsgsAdapter } from './usgs.adapter.js';

/** One adapter per Event Source key; the Record type makes a missing adapter a compile error. */
@Injectable()
export class AdapterRegistry {
  private readonly adapters: Record<EventSourceKey, EventSourceAdapter>;

  constructor(usgs: UsgsAdapter, gdacs: GdacsAdapter, simulated: SimulatedAdapter) {
    this.adapters = { usgs, gdacs, simulated };
  }

  get(key: EventSourceKey): EventSourceAdapter {
    return this.adapters[key];
  }
}

import type { UnitDescriptor as UnitDescriptorContract } from '../contracts.js';

export class UnitDescriptor implements UnitDescriptorContract {
  constructor(
    readonly key: string,
    readonly symbol: string,
    readonly dimensionKey: string
  ) {
    Object.freeze(this);
  }
}

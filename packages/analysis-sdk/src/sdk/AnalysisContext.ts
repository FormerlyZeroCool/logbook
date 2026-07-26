export class AnalysisContext {
  readonly from: string;
  readonly to: string;
  readonly now: string;
  readonly fromMs: number;
  readonly toMs: number;
  readonly nowMs: number;
  readonly timeZone: string;

  constructor(input: { from: string; to: string; now: string; timeZone: string }) {
    this.from = input.from;
    this.to = input.to;
    this.now = input.now;
    this.fromMs = Date.parse(input.from);
    this.toMs = Date.parse(input.to);
    this.nowMs = Date.parse(input.now);
    this.timeZone = input.timeZone;
    Object.freeze(this);
  }
}

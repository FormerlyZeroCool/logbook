import type { AnalysisRunRequest, AnalysisWorkerResponse } from './protocol';

type ResultMessage = Extract<AnalysisWorkerResponse, { type: 'result' }>;
type Job = {
  request: AnalysisRunRequest;
  resolve: (value: ResultMessage) => void;
  reject: (error: Error) => void;
  panelKey: string;
};
type Slot = { worker: Worker; busy: Job | null; watchdog: number | null };

export class AnalysisWorkerPool {
  private readonly slots: Slot[];
  private readonly queue: Job[] = [];
  private readonly activeByPanel = new Map<string, string>();

  constructor(size: number) {
    this.slots = Array.from({ length: Math.max(1, size) }, () => this.createSlot());
  }

  run(panelKey: string, request: AnalysisRunRequest): Promise<ResultMessage> {
    this.cancelPanel(panelKey);
    this.activeByPanel.set(panelKey, request.requestId);
    return new Promise((resolve, reject) => {
      this.queue.push({ panelKey, request, resolve, reject });
      this.dispatch();
    });
  }

  cancelPanel(panelKey: string): void {
    const requestId = this.activeByPanel.get(panelKey);
    if (!requestId) return;
    const queued = this.queue.findIndex((job) => job.request.requestId === requestId);
    if (queued >= 0) {
      const [job] = this.queue.splice(queued, 1);
      job?.reject(new DOMException('Cancelled', 'AbortError'));
    }
    for (const slot of this.slots) {
      if (slot.busy?.request.requestId === requestId) {
        // Cancellation is made immediate and reliable by replacing the worker.
        const job = slot.busy;
        this.replaceWorker(slot);
        job.reject(new DOMException('Cancelled', 'AbortError'));
      }
    }
    this.activeByPanel.delete(panelKey);
    this.dispatch();
  }

  dispose(): void {
    for (const slot of this.slots) {
      if (slot.watchdog !== null) window.clearTimeout(slot.watchdog);
      slot.worker.terminate();
      slot.busy?.reject(new Error('Worker pool disposed'));
      slot.busy = null;
    }
    this.queue.splice(0).forEach((job) => job.reject(new Error('Worker pool disposed')));
    this.activeByPanel.clear();
  }

  private newWorker(): Worker {
    return new Worker(new URL('./analysis.worker.ts', import.meta.url), {
      type: 'module',
      name: 'logbook-analysis-worker'
    });
  }

  private createSlot(): Slot {
    const slot: Slot = { worker: this.newWorker(), busy: null, watchdog: null };
    this.bindWorker(slot);
    return slot;
  }

  private bindWorker(slot: Slot): void {
    slot.worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => this.finish(slot, event.data);
    slot.worker.onerror = (event) => this.failSlot(slot, new Error(event.message));
    slot.worker.onmessageerror = () => this.failSlot(slot, new Error('Analysis worker returned an unreadable message'));
  }

  private replaceWorker(slot: Slot): void {
    if (slot.watchdog !== null) window.clearTimeout(slot.watchdog);
    slot.watchdog = null;
    slot.worker.terminate();
    slot.worker = this.newWorker();
    slot.busy = null;
    this.bindWorker(slot);
  }

  private dispatch(): void {
    for (const slot of this.slots) {
      if (slot.busy || !this.queue.length) continue;
      const job = this.queue.shift();
      if (!job) continue;
      slot.busy = job;
      slot.watchdog = window.setTimeout(() => {
        const timedOutJob = slot.busy;
        this.replaceWorker(slot);
        timedOutJob?.reject(new Error(`Analysis timed out after ${job.request.limits.timeoutMs} ms`));
        if (this.activeByPanel.get(job.panelKey) === job.request.requestId) {
          this.activeByPanel.delete(job.panelKey);
        }
        this.dispatch();
      }, job.request.limits.timeoutMs + 250);
      slot.worker.postMessage(job.request);
    }
  }

  private finish(slot: Slot, response: AnalysisWorkerResponse): void {
    const job = slot.busy;
    if (!job || response.requestId !== job.request.requestId) return;
    if (slot.watchdog !== null) window.clearTimeout(slot.watchdog);
    slot.watchdog = null;
    slot.busy = null;
    if (this.activeByPanel.get(job.panelKey) === job.request.requestId) {
      this.activeByPanel.delete(job.panelKey);
    }
    if (response.type === 'result') job.resolve(response);
    else job.reject(new Error(response.message));
    this.dispatch();
  }

  private failSlot(slot: Slot, error: Error): void {
    const job = slot.busy;
    this.replaceWorker(slot);
    if (job) {
      if (this.activeByPanel.get(job.panelKey) === job.request.requestId) {
        this.activeByPanel.delete(job.panelKey);
      }
      job.reject(error);
    }
    this.dispatch();
  }
}

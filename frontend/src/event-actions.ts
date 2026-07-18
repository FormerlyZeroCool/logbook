export type FinishEventRequest = {
  eventId: string;
  endedAt: string;
};

export function buildFinishEventRequest(eventId: string, finishedAt: Date = new Date()): FinishEventRequest {
  if (!eventId.trim()) {
    throw new Error('eventId is required');
  }

  const endedAt = finishedAt.toISOString();
  return { eventId, endedAt };
}

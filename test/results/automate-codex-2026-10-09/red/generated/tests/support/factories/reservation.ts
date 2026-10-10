export type ReservationPayload = {
  parcelId: string;
  durationMinutes: number;
};

export function reservationPayload(
  overrides: Partial<ReservationPayload> = {},
): ReservationPayload {
  return {
    parcelId: `parcel-${crypto.randomUUID()}`,
    durationMinutes: 30,
    ...overrides,
  };
}

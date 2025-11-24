/**
 * Calendar Slot representation for scheduling views
 */
export interface CalendarSlot {
  id: string;
  time: string;
  duration: number;
  available: boolean;
  patient?: string;
  procedure?: string;
}

export type RequestStatus = "open" | "assigned" | "in_progress" | "closed";
export type Req = {
  id: string;
  createdBy?: string;
  assignedVolunteerId?: string;
  type?: string;
  urgency?: string;
  status?: RequestStatus;
  description?: string;
  location?: { lat?: number; lng?: number };
  volunteerLive?: { lat?: number; lng?: number };
  timeline?: Array<{ step?: string; at?: any; by?: string }>;
  etaMinutes?: number;
  checkInAt?: any;
  checkOutAt?: any;
  completionNote?: string;
  createdAt?: any;
  updatedAt?: any;
};

export type HostStatus = "In office" | "In a meeting" | "Away";

export type Host = {
  id: string;
  employeeId?: string;
  name: string;
  dept: string;
  designation?: string;
  location?: string;
  extension?: string;
  status?: HostStatus;
  backupContact?: string;
};

export type VisitorType = "Guest" | "Vendor" | "VIP" | "Candidate";
export type PassKind = "valid" | "expired" | "cancelled" | "used" | "otherdate" | "blocked";
export type VisitStatus = "invited" | "in" | "out-temp" | "signed-out";

export type Pass = {
  id: string;
  name: string;
  phone: string;
  host: Host;
  slot: string;
  startHour: number;
  purpose: string;
  type: VisitorType;
  kind: PassKind;
  needsApproval?: boolean;
  validDates?: string;
  daysRemaining?: number;

  // Detailed visit info
  hostEmployeeId?: string;
  designation?: string;
  department?: string;
  location?: string;
  extension?: string;
  hostStatus?: HostStatus;
  backupContact?: string;
  purposeCategory?: string;
  purposeDetails?: string;
  durationMinutes?: number;
  headcount?: number;
  bringList?: string[];
  nextStep?: string;
  dayNumber?: number;
  totalDays?: number;
  safetyNote?: string;
  approvalStatus?: string;
};

export const EMPLOYEES: Host[] = [
  {
    id: "h1",
    employeeId: "EMP-1001",
    name: "Arun Kumar",
    dept: "Engineering",
    designation: "Senior Engineer",
    location: "Block A, Floor 3, Meeting Room 3B",
    extension: "Ext. 4022",
    status: "In office",
  },
  {
    id: "h2",
    employeeId: "EMP-1002",
    name: "Meera Shah",
    dept: "HR",
    designation: "HR Manager",
    location: "Block B, Floor 2, Room 210",
    extension: "Ext. 2210",
    status: "In office",
  },
  {
    id: "h3",
    employeeId: "EMP-1003",
    name: "Rahul Das",
    dept: "Finance",
    designation: "Finance Lead",
    location: "Block C, Floor 1, Room 104",
    extension: "Ext. 1104",
    status: "Away",
    backupContact: "Meera Shah",
  },
  {
    id: "h4",
    employeeId: "EMP-1004",
    name: "Sana Iqbal",
    dept: "Operations",
    designation: "Operations Manager",
    location: "Executive Tower, Floor 5, Suite 502",
    extension: "Ext. 3105",
    status: "In a meeting",
    backupContact: "Arun Kumar",
  },
  {
    id: "h5",
    employeeId: "EMP-1005",
    name: "Kavya Rao",
    dept: "Legal",
    designation: "Legal Counsel",
    location: "Block A, Floor 4, Legal Office",
    extension: "Ext. 5012",
    status: "In office",
  },
  {
    id: "h6",
    employeeId: "EMP-1006",
    name: "Vikram Nair",
    dept: "Sales",
    designation: "Account Manager",
    location: "Block B, Floor 3, Sales Hub",
    extension: "Ext. 6118",
    status: "In office",
  },
];

const [ARUN, MEERA, RAHUL, SANA] = EMPLOYEES;
export const HOSTS: Host[] = EMPLOYEES;

export const DEPARTMENTS = ["Engineering", "HR", "Finance", "Operations", "Mailroom"];

export const PASSES: Pass[] = [
  {
    id: "VIS-1001",
    name: "Priya Raman",
    phone: "9845012123",
    host: ARUN,
    hostEmployeeId: "EMP-1001",
    designation: "Senior Engineer",
    department: "Engineering",
    location: "Block A, Floor 3, Meeting Room 3B",
    extension: "Ext. 4022",
    hostStatus: "In office",
    purposeCategory: "Meeting",
    purposeDetails:
      "Quarterly product demo for the engineering team. Bring your laptop and the signed NDA.",
    slot: "10:00 AM to 10:30 AM",
    startHour: 10,
    durationMinutes: 30,
    purpose: "Meeting",
    type: "Guest",
    kind: "valid",
    approvalStatus: "Pre-approved",
    headcount: 1,
    bringList: ["Government photo ID", "Laptop with HDMI adapter", "Signed NDA copy"],
    nextStep: "Please take the lift to Floor 3. Reception will guide you.",
    safetyNote: "Please wear your visitor badge visibly at all times and stay with your host.",
    dayNumber: 1,
    totalDays: 1,
  },
  {
    id: "VIS-1002",
    name: "Vikram Menon",
    phone: "9886045678",
    host: SANA,
    hostEmployeeId: "EMP-1004",
    designation: "Operations Manager",
    department: "Operations",
    location: "Executive Tower, Floor 5, Boardroom A",
    extension: "Ext. 3105",
    hostStatus: "In a meeting",
    backupContact: "Arun Kumar",
    purposeCategory: "Meeting",
    purposeDetails: "Executive briefing on regional facilities roadmap and lease renewals.",
    slot: "4:00 PM to 5:00 PM",
    startHour: 16,
    durationMinutes: 60,
    purpose: "Meeting",
    type: "VIP",
    kind: "valid",
    needsApproval: true,
    approvalStatus: "Approved by host",
    headcount: 2,
    bringList: ["Photo ID", "Visitor parking pass"],
    nextStep: "Proceed to Executive Lounge on Floor 5. Reception will escort you.",
    safetyNote: "Escorted access only on executive floors.",
    dayNumber: 1,
    totalDays: 1,
  },
  {
    id: "VIS-2002",
    name: "Anita Joseph",
    phone: "9900011122",
    host: MEERA,
    hostEmployeeId: "EMP-1002",
    designation: "HR Manager",
    department: "HR",
    location: "Block B, Floor 2, Room 210",
    extension: "Ext. 2210",
    hostStatus: "In office",
    purposeCategory: "Interview",
    purposeDetails: "Final round interview for Senior Systems Architect.",
    slot: "11:00 AM to 12:00 PM",
    startHour: 11,
    durationMinutes: 60,
    purpose: "Interview",
    type: "Candidate",
    kind: "expired",
    headcount: 1,
    bringList: ["Resume copy", "Photo ID"],
    nextStep: "Wait in HR Reception, Block B.",
  },
  {
    id: "VIS-3003",
    name: "Deepak Rao",
    phone: "9900033344",
    host: RAHUL,
    hostEmployeeId: "EMP-1003",
    designation: "Finance Lead",
    department: "Finance",
    location: "Block C, Floor 1, Room 104",
    extension: "Ext. 1104",
    hostStatus: "Away",
    backupContact: "Meera Shah",
    purposeCategory: "Vendor",
    purposeDetails: "Quarterly HVAC maintenance inspection and vendor invoice verification.",
    slot: "2:00 PM to 3:00 PM",
    startHour: 14,
    durationMinutes: 60,
    purpose: "Vendor or service",
    type: "Vendor",
    kind: "cancelled",
    headcount: 1,
    bringList: ["Safety vest", "Service badge"],
    nextStep: "Report to Facilities Bay.",
  },
  {
    id: "VIS-4004",
    name: "Lakshmi Nair",
    phone: "9900055566",
    host: ARUN,
    hostEmployeeId: "EMP-1001",
    designation: "Senior Engineer",
    department: "Engineering",
    location: "Block A, Floor 3, Meeting Room 3B",
    extension: "Ext. 4022",
    hostStatus: "In office",
    purposeCategory: "Meeting",
    purposeDetails: "Sprint planning and technical architecture review.",
    slot: "9:00 AM to 10:00 AM",
    startHour: 9,
    durationMinutes: 60,
    purpose: "Meeting",
    type: "Guest",
    kind: "used",
    headcount: 1,
  },
  {
    id: "VIS-6006",
    name: "Farhan Ali",
    phone: "9900077788",
    host: RAHUL,
    hostEmployeeId: "EMP-1003",
    designation: "Finance Lead",
    department: "Finance",
    location: "Block C, Floor 1, Room 104",
    extension: "Ext. 1104",
    hostStatus: "In office",
    purposeCategory: "Customer",
    purposeDetails: "Annual enterprise contract renewal review meeting.",
    slot: "3:00 PM to 4:00 PM",
    startHour: 15,
    durationMinutes: 60,
    purpose: "Customer",
    type: "Guest",
    kind: "otherdate",
    validDates: "12 to 14 October",
    headcount: 1,
  },
  {
    id: "VIS-7007",
    name: "Rohit Verma",
    phone: "9900099900",
    host: SANA,
    hostEmployeeId: "EMP-1004",
    designation: "Operations Manager",
    department: "Operations",
    location: "Executive Tower, Floor 5, Suite 502",
    extension: "Ext. 3105",
    hostStatus: "In office",
    purposeCategory: "Meeting",
    purposeDetails: "Vendor onboarding discussion.",
    slot: "12:00 PM to 1:00 PM",
    startHour: 12,
    durationMinutes: 60,
    purpose: "Meeting",
    type: "Guest",
    kind: "blocked",
    headcount: 1,
  },
  {
    id: "VIS-8008",
    name: "Karthik Iyer",
    phone: "9845098456",
    host: ARUN,
    hostEmployeeId: "EMP-1001",
    designation: "Senior Engineer",
    department: "Engineering",
    location: "Block A, Floor 4, Lab 2",
    extension: "Ext. 4022",
    hostStatus: "In office",
    purposeCategory: "Vendor",
    purposeDetails: "Server room network cabling installation and certification.",
    slot: "9:30 AM to 6:00 PM",
    startHour: 9,
    durationMinutes: 510,
    purpose: "Vendor or service",
    type: "Vendor",
    kind: "valid",
    approvalStatus: "Pre-approved",
    daysRemaining: 3,
    dayNumber: 2,
    totalDays: 3,
    validDates: "9 to 11 October",
    headcount: 1,
    bringList: ["Government photo ID", "Contractor safety kit", "Access permit"],
    nextStep: "Report to Security Control Room on Floor 1 for contractor badge.",
    safetyNote: "Safety shoes and high-vis vest required in server rooms.",
  },
];

export const DEMO_SCANS: { code: string; label: string }[] = [
  { code: "VIS-1001", label: "Valid · Priya Raman" },
  { code: "VIS-1002", label: "VIP · needs host approval" },
  { code: "VIS-2002", label: "Expired" },
  { code: "VIS-3003", label: "Cancelled" },
  { code: "VIS-4004", label: "Already used" },
  { code: "VIS-5005", label: "Not found" },
  { code: "VIS-6006", label: "Different date" },
  { code: "VIS-7007", label: "Blocked visitor" },
  { code: "VIS-8008", label: "Multi-day · checked in" },
  { code: "GARBLED##", label: "Unreadable QR" },
];

export const PURPOSES = [
  "Meeting",
  "Interview",
  "Vendor or service",
  "Customer",
  "Delivery",
  "Other",
];

export const CORRECT_OTP = "123456";
export const HELP_CODE = "4821";
export const PRINT_FAIL_CODE = "5372";
export const NO_RESPONSE_CODE = "7391";

export type FailReason =
  | "notfound"
  | "invalid"
  | "expired"
  | "cancelled"
  | "used"
  | "otherdate"
  | "blocked"
  | "notcheckedin";

export function maskPhone(p: string) {
  return `+91 XXXXX XX${p.slice(-3)}`;
}

export function firstName(n?: string) {
  return (n ?? "").trim().split(" ")[0] || "there";
}

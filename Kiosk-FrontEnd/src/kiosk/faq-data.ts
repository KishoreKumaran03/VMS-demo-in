export type FaqCategory =
  "All" | "Check-in" | "Walk-in" | "Pass and QR" | "Sign-out" | "Badge" | "Help";

export type FaqItem = {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  "All",
  "Check-in",
  "Walk-in",
  "Pass and QR",
  "Sign-out",
  "Badge",
  "Help",
];

export const FAQS: FaqItem[] = [
  {
    id: "faq-1",
    category: "Check-in",
    question: "How do I check in with an invitation?",
    answer:
      "Tap 'Sign in' on the home screen. Hold your QR code in front of the scanner, or choose 'Enter pass code instead' to type the 4-digit number from your invitation. Once verified, review your visit details and print your badge.",
  },
  {
    id: "faq-2",
    category: "Walk-in",
    question: "I do not have an invitation. What should I do?",
    answer:
      "Tap 'Walk-in' on the home screen. Enter your name, 10-digit mobile number, purpose of visit, and your host's employee ID (e.g. EMP-1001). We will send an approval request directly to your host.",
  },
  {
    id: "faq-3",
    category: "Pass and QR",
    question: "My QR code will not scan. What now?",
    answer:
      "Hold your phone screen about 15 to 20 cm away from the camera and turn your screen brightness up. If it still does not read, tap 'Enter pass code instead' and enter the 4 digits shown below your QR code (e.g. VIS-1001).",
  },
  {
    id: "faq-4",
    category: "Pass and QR",
    question: "Where do I find my pass code?",
    answer:
      "Your pass code is printed directly below the QR code in your visitor invitation email or SMS. It starts with 'VIS-' followed by 4 digits, for example VIS-1001.",
  },
  {
    id: "faq-5",
    category: "Pass and QR",
    question: "Why was my pass not accepted?",
    answer:
      "Passes may not be accepted if they have expired, were cancelled by your host, have already been used, or are scheduled for another date. Tap 'Need help' or speak with reception to resolve any pass discrepancies.",
  },
  {
    id: "faq-6",
    category: "Check-in",
    question: "How long does host approval take?",
    answer:
      "Most hosts respond in under 45 seconds. Your host receives an instant notification on their mobile phone and computer with your details as soon as you submit your check-in.",
  },
  {
    id: "faq-7",
    category: "Check-in",
    question: "What if my host does not respond?",
    answer:
      "If your host does not respond within 45 seconds, the kiosk will generate a temporary assistance code. Show this code to the front desk reception and they will contact your host or a backup colleague directly.",
  },
  {
    id: "faq-8",
    category: "Sign-out",
    question: "Can I step out for lunch and come back?",
    answer:
      "Yes. Tap 'Sign out' and select 'I am stepping out for a while'. Your pass remains active for today. When you return, simply scan your pass at 'Sign in' to check back in without needing new approval.",
  },
  {
    id: "faq-9",
    category: "Sign-out",
    question: "How do I sign out for good?",
    answer:
      "Tap 'Sign out' on the home screen, scan your pass or type your pass code, and choose 'I am done with my visit'. Verify your phone number with the 6-digit code to conclude your visit and deactivate your badge.",
  },
  {
    id: "faq-10",
    category: "Sign-out",
    question: "Why do I need a code to sign out?",
    answer:
      "A quick SMS verification ensures that only you can close your visit and deactivate multi-day building permissions, protecting your security and site audit integrity.",
  },
  {
    id: "faq-11",
    category: "Badge",
    question: "My badge did not print. What should I do?",
    answer:
      "If the printer encounters a paper jam or runs low on paper, the screen displays a 4-digit printer assistance code. You are already checked in—simply show the code to reception and they will hand you a badge.",
  },
  {
    id: "faq-12",
    category: "Walk-in",
    question: "What information do you collect and why?",
    answer:
      "We collect your full name, mobile number, company, and visit purpose solely for facility safety, emergency headcount, and host notification. Your records are retained for 90 days and never sold or shared.",
  },
  {
    id: "faq-13",
    category: "Help",
    question: "Can I change my host or reason after registering?",
    answer:
      "Once a visit has been submitted or checked in, details cannot be edited on the kiosk for security reasons. Please speak with reception, who can update the active visit record in the administrative console.",
  },
  {
    id: "faq-14",
    category: "Walk-in",
    question: "I am here for an interview. What should I do?",
    answer:
      "Select 'Walk-in', enter your details, choose 'Interview' as your purpose, and type your recruiter or HR contact's employee ID. Meera Shah (EMP-1002) is our HR point of contact if you were not assigned a specific recruiter.",
  },
  {
    id: "faq-15",
    category: "Walk-in",
    question: "I am making a delivery. What should I do?",
    answer:
      "Select 'Walk-in', provide your name and phone number, choose 'Delivery' as your purpose, and select the destination department (e.g. Mailroom, Engineering). The department team will receive an arrival alert.",
  },
  {
    id: "faq-16",
    category: "Help",
    question: "Who can I ask for help?",
    answer:
      "You can tap the 'Need help?' button in the top right corner of any kiosk screen at any time. A reception staff member will be alerted immediately and will assist you at the kiosk.",
  },
];

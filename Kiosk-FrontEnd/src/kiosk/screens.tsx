import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  Ban,
  CalendarX,
  CameraOff,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  DoorOpen,
  HelpCircle,
  Hourglass,
  Keyboard as KeyIcon,
  LifeBuoy,
  Loader2,
  LogOut,
  Phone,
  Printer,
  QrCode,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
  WifiOff,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CORRECT_OTP,
  DEMO_SCANS,
  DEPARTMENTS,
  NO_RESPONSE_CODE,
  PASSES,
  PRINT_FAIL_CODE,
  PURPOSES,
  firstName,
  maskPhone,
  type FailReason,
  type Pass,
  type VisitorType,
} from "./data";
import {
  checkInPass,
  checkOutPass,
  getKioskRequest,
  kioskSiteId,
  searchKioskHosts,
  submitWalkIn,
  verifyPass,
  type ApiVisit,
} from "./api";
import { FAQS, FAQ_CATEGORIES, type FaqCategory } from "./faq-data";
import { useCardSpotlightTilt } from "./pointer";
import {
  BadgePreview,
  Btn,
  FlowHeader,
  Keyboard,
  Keypad,
  Modal,
  OtpInput,
  Ring,
  StatusScreen,
  useNow,
} from "./components";
import { useCountdown, useKiosk, type Screen } from "./store";

const SI_STEPS = ["Your pass", "Welcome", "Badge"];
const WI_STEPS = ["Details", "Purpose", "Host", "Consent"];
const SO_STEPS = ["Find visit", "Choose", "Confirm"];

function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex h-full flex-col px-10 pb-8", className)}>{children}</div>;
}
function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[24px] font-bold leading-tight">{title}</h1>
      {sub && <p className="mt-1.5 text-[14px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
function HelpBtn() {
  const { setHelpOpen } = useKiosk();
  return (
    <Btn variant="secondary" onClick={() => setHelpOpen(true)}>
      <LifeBuoy className="h-5 w-5" /> Need help?
    </Btn>
  );
}
function AutoHome({
  seconds,
  label = "Returning to home in",
}: {
  seconds: number;
  label?: string;
}) {
  const { endSession } = useKiosk();
  const left = useCountdown(seconds, () => endSession());
  return (
    <p className="text-[13px] text-muted-foreground">
      {label} <span className="font-semibold tabular-nums text-foreground">{left}s</span>
    </p>
  );
}

/* ================= HOME ================= */
function HomeCard({
  t,
  d,
  icon: Icon,
  primary,
  on,
  staggerClass,
}: {
  t: string;
  d: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
  on: () => void;
  staggerClass: string;
}) {
  const { cardRef, hovered, onPointerMove, onPointerEnter, onPointerLeave } =
    useCardSpotlightTilt();
  return (
    <button
      ref={cardRef as React.RefObject<HTMLButtonElement>}
      onClick={on}
      onPointerMove={onPointerMove}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(
        "pressable group relative flex min-h-[132px] items-center gap-5 overflow-hidden rounded-3xl p-6 text-left transition-transform duration-200 ease-out",
        staggerClass,
        primary
          ? "bg-gradient-primary text-primary-foreground shadow-primary"
          : "bg-card shadow-soft hover:shadow-lift",
      )}
    >
      {/* Radial highlight following pointer inside the card */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl transition-opacity duration-300"
        style={{
          opacity: hovered ? 1 : 0,
          background: primary
            ? `radial-gradient(280px circle at var(--card-px, -999px) var(--card-py, -999px), rgba(255, 255, 255, 0.2), transparent 75%)`
            : `radial-gradient(280px circle at var(--card-px, -999px) var(--card-py, -999px), oklch(0.5 0.2 266 / 12%), transparent 75%)`,
        }}
      />
      {/* Border brightening near pointer */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl transition-opacity duration-300"
        style={{
          opacity: hovered ? 1 : 0,
          boxShadow: `inset 0 0 0 1.5px ${primary ? "rgba(255, 255, 255, 0.45)" : "oklch(0.5 0.2 266 / 35%)"}`,
        }}
      />
      <div
        className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-sm",
          primary
            ? "bg-primary-foreground/15 text-primary-foreground"
            : "bg-primary-soft text-primary",
        )}
      >
        <Icon className="h-6 w-6 stroke-[2]" />
      </div>
      <div className="flex-1">
        <div className="text-[20px] font-bold">{t}</div>
        <div
          className={cn(
            "mt-1 text-[14px] leading-snug",
            primary ? "text-primary-foreground/85" : "text-muted-foreground",
          )}
        >
          {d}
        </div>
      </div>
      <ArrowRight
        className={cn(
          "h-6 w-6 transition-transform group-hover:translate-x-1 group-active:translate-x-1",
          !primary && "text-primary",
        )}
      />
    </button>
  );
}

function Home() {
  const { go, update, notice } = useKiosk();
  const now = useNow();
  const h = now?.getHours() ?? 9;
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const start = (flow: "signin" | "walkin" | "signout", s: Screen) => {
    update({ flow });
    go(s);
  };
  const cards = [
    {
      t: "Sign in",
      d: "I have an invitation. Scan your QR code or type your pass code.",
      icon: QrCode,
      primary: true,
      stagger: "animate-stagger-1",
      on: () => start("signin", "si-scan"),
    },
    {
      t: "Walk-in",
      d: "No invitation? Register in about a minute.",
      icon: UserPlus,
      stagger: "animate-stagger-2",
      on: () => start("walkin", "wi-details"),
    },
    {
      t: "Sign out",
      d: "Leaving for the day, or just for lunch?",
      icon: LogOut,
      stagger: "animate-stagger-3",
      on: () => start("signout", "so-scan"),
    },
  ];
  return (
    <div className="grid h-full grid-cols-[1fr_520px] gap-16 px-16 pb-10">
      <div className="relative flex flex-col justify-center">
        {/* Subtle blurred blue glow shape behind the Home headline */}
        <div className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        {notice && (
          <div className="animate-fade mb-8 flex w-fit items-center gap-3 rounded-2xl bg-card px-5 py-3.5 text-[14px] font-medium shadow-soft">
            <ShieldAlert className="h-5 w-5 text-primary" /> {notice}
          </div>
        )}
        <span className="text-[13px] font-semibold tracking-[0.14em] text-primary">
          VISITOR CHECK-IN
        </span>
        <h1 className="mt-4 max-w-[480px] text-[32px] font-bold leading-[1.15] tracking-tight">
          {greet}, welcome to Northstar
        </h1>
        <p className="mt-3 text-[15px] text-muted-foreground">Choose an option to get started.</p>
        <div className="mt-auto flex items-center justify-between pt-8 text-[13px] text-muted-foreground">
          <p className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4" /> Have your pass handy. Tap Need help if you get stuck.
          </p>
          <button
            onClick={() => {
              update({ returnTo: "home" });
              go("faq");
            }}
            className="pressable flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-[13px] font-semibold text-primary shadow-soft hover:bg-primary-soft/50"
          >
            <HelpCircle className="h-4 w-4" /> FAQs
          </button>
        </div>
      </div>
      <div className="flex flex-col justify-center gap-6">
        {cards.map((c) => (
          <HomeCard
            key={c.t}
            t={c.t}
            d={c.d}
            icon={c.icon}
            primary={c.primary}
            staggerClass={c.stagger}
            on={c.on}
          />
        ))}
      </div>
    </div>
  );
}

/* ================= SCAN / CODE (shared) ================= */
function ScanScreen({ mode }: { mode: "signin" | "signout" }) {
  const { go, update } = useKiosk();
  const [demo, setDemo] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const pick = (code: string) => {
    setDemo(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    update({ code });
    go(mode === "signin" ? "si-verifying" : "so-verifying");
  };
  const startCamera = async () => {
    setCameraError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera access is unavailable in this browser.");
      const detectorCtor = (
        window as Window & {
          BarcodeDetector?: new (options?: { formats: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;
      if (!detectorCtor) throw new Error("QR scanning is unavailable. Type the pass code instead.");
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = streamRef.current;
      await videoRef.current.play();
      const detector = new detectorCtor({ formats: ["qr_code"] });
      const scan = async () => {
        if (!videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) return pick(codes[0].rawValue);
        } catch {
          /* camera frame is not ready yet */
        }
        frameRef.current = requestAnimationFrame(scan);
      };
      frameRef.current = requestAnimationFrame(scan);
    } catch (error) {
      setCameraError(
        error instanceof Error
          ? error.message
          : "Camera could not start. Type the pass code instead.",
      );
    }
  };
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  return (
    <Page>
      <FlowHeader
        onBack={() => go("home")}
        onCancel={() => {}}
        steps={mode === "signin" ? SI_STEPS : SO_STEPS}
        current={0}
      />
      <div className="grid flex-1 grid-cols-[1fr_380px] items-center gap-14">
        <div className="relative mx-auto aspect-[4/3] h-full max-h-[460px] overflow-hidden rounded-3xl bg-foreground/90 shadow-lift">
          <video
            ref={videoRef}
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          {[
            "left-6 top-6 border-l-4 border-t-4 rounded-tl-2xl",
            "right-6 top-6 border-r-4 border-t-4 rounded-tr-2xl",
            "left-6 bottom-6 border-l-4 border-b-4 rounded-bl-2xl",
            "right-6 bottom-6 border-r-4 border-b-4 rounded-br-2xl",
          ].map((c) => (
            <span key={c} className={cn("absolute h-14 w-14 border-primary-foreground", c)} />
          ))}
          {/* QR code alignment reticle / watermark */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-primary-foreground/20">
            <div className="flex flex-col items-center justify-center">
              <QrCode className="h-28 w-28 stroke-[1.25]" />
              <span className="mt-3 text-[12px] font-semibold tracking-wider uppercase text-primary-foreground/40">
                Align QR Code
              </span>
            </div>
          </div>

          {/* Animated Horizontal Laser Scanning Line (moves from top to bottom) */}
          <div className="pointer-events-none absolute inset-x-6 top-6 bottom-20 overflow-hidden">
            <div className="animate-laser-scan absolute inset-x-0">
              {/* Blue laser beam light trail above the beam */}
              <div className="laser-trail-blue absolute bottom-full left-0 right-0 h-20 pointer-events-none" />

              {/* High-intensity horizontal blue laser line with electric glow */}
              <div className="laser-line-blue relative h-[3.5px] w-full rounded-full">
                <span className="absolute -left-1.5 -top-[3.5px] h-2.5 w-2.5 rounded-full bg-blue-200 shadow-[0_0_8px_#3b82f6,0_0_16px_#1d4ed8]" />
                <span className="absolute -right-1.5 -top-[3.5px] h-2.5 w-2.5 rounded-full bg-blue-200 shadow-[0_0_8px_#3b82f6,0_0_16px_#1d4ed8]" />
              </div>

              {/* Forward glow below the beam */}
              <div className="laser-glow-blue absolute top-full left-0 right-0 h-6 pointer-events-none" />
            </div>
          </div>

          <p className="absolute inset-x-0 bottom-8 text-center text-[14px] font-medium text-primary-foreground/90">
            Hold your QR code in front of the camera.
          </p>
        </div>
        <div>
          <Heading
            title={mode === "signin" ? "Scan your pass" : "Scan your pass or badge"}
            sub={
              mode === "signin"
                ? "You will find the QR code in your invitation email or message."
                : "We will find your visit in a moment."
            }
          />
          <div className="flex flex-col gap-6">
            <Btn onClick={startCamera}>
              <QrCode className="h-5 w-5" /> Start QR scanner
            </Btn>
            {cameraError && (
              <p role="alert" className="text-[13px] text-destructive">
                {cameraError}
              </p>
            )}
            <Btn variant="secondary" onClick={() => go(mode === "signin" ? "si-code" : "so-code")}>
              <KeyIcon className="h-5 w-5" /> Enter pass code instead
            </Btn>
          </div>
        </div>
      </div>
      {demo && import.meta.env.DEV && (
        <Modal onClose={() => setDemo(false)}>
          <h2 className="text-[20px] font-bold">Demo passes</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Pick a pass to simulate a scan.</p>
          <div className="mt-4 grid max-h-[440px] grid-cols-1 gap-2 overflow-auto">
            {DEMO_SCANS.map((d) => (
              <button
                key={d.code}
                onClick={() => pick(d.code)}
                className="pressable flex items-center justify-between rounded-xl border border-border px-4 py-3 text-left hover:bg-primary-soft"
              >
                <span className="text-[14px] font-semibold">{d.code}</span>
                <span className="text-[13px] text-muted-foreground">{d.label}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </Page>
  );
}

function CodeScreen({ mode }: { mode: "signin" | "signout" }) {
  const { go, update } = useKiosk();
  const [digits, setDigits] = useState("");
  return (
    <Page>
      <FlowHeader
        onBack={() => go(mode === "signin" ? "si-scan" : "so-scan")}
        onCancel={() => {}}
        steps={mode === "signin" ? SI_STEPS : SO_STEPS}
        current={0}
      />
      <div className="grid flex-1 grid-cols-2 items-center gap-16">
        <div>
          <Heading
            title="Enter your pass code"
            sub="Type the full code shown under the QR code in your invitation."
          />
          <input
            aria-label="Visitor pass code"
            autoCapitalize="none"
            autoComplete="off"
            value={digits}
            onChange={(event) => setDigits(event.target.value.trim())}
            placeholder="Paste or type your pass code"
            className="h-[84px] w-full rounded-2xl border-2 border-primary bg-card px-5 text-[20px] font-bold shadow-soft outline-none focus:ring-4 focus:ring-primary/15"
          />
          <div className="hidden">
            <span className="text-muted-foreground">VIS-</span>
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className={cn("w-[1.1em] text-center", !digits[i] && "text-border")}>
                {digits[i] ?? "•"}
              </span>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-4">
            <Btn
              disabled={digits.length < 20}
              onClick={() => {
                update({ code: digits });
                go(mode === "signin" ? "si-verifying" : "so-verifying");
              }}
            >
              Verify
            </Btn>
            <button
              onClick={() => go(mode === "signin" ? "si-scan" : "so-scan")}
              className="h-12 text-[14px] font-semibold text-primary"
            >
              Scan QR instead
            </button>
          </div>
        </div>
        <Keypad
          onDigit={(d) => setDigits((v) => (v.length < 64 ? v + d : v))}
          onBackspace={() => setDigits((v) => v.slice(0, -1))}
          onClear={() => setDigits("")}
        />
      </div>
    </Page>
  );
}

/* ================= VERIFICATION ================= */
function mapApiPass(visit: ApiVisit, code: string): Pass {
  const starts = new Date(visit.starts_at);
  const ends = new Date(visit.ends_at);
  return {
    id: code,
    name: visit.visitor_name,
    phone: visit.visitor_phone || "",
    host: { id: visit.host_id, employeeId: "", name: visit.host_name, dept: visit.host_department },
    hostEmployeeId: "",
    department: visit.host_department,
    purposeCategory: visit.purpose,
    purposeDetails: visit.purpose,
    slot: `${starts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} to ${ends.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    startHour: starts.getHours(),
    durationMinutes: Math.round((ends.getTime() - starts.getTime()) / 60000),
    purpose: visit.purpose,
    type: "Guest",
    kind: "valid",
    approvalStatus: "Approved",
  };
}

function Verifying({ mode }: { mode: "signin" | "signout" }) {
  const { session, go, update } = useKiosk();
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const visit = await verifyPass(session.code || "");
        if (cancelled) return;
        const pass = mapApiPass(visit, session.code || "");
        update({ pass, name: pass.name, phone: pass.phone });
        if (mode === "signin") {
          if (visit.status === "checked-in") return go("si-reentry");
          if (visit.status !== "scheduled") {
            update({ failReason: "used" });
            return go("fail");
          }
          update({ early: new Date() < new Date(visit.starts_at) });
          go("si-welcome");
        } else {
          if (visit.status === "checked-out") return go("so-already");
          if (visit.status !== "checked-in") {
            update({ failReason: "notcheckedin" });
            return go("fail");
          }
          go("so-choose");
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (message.includes("fetch") || message.includes("network")) go("network");
        else {
          update({ failReason: message.includes("expired") ? "expired" : "notfound" });
          go("fail");
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <StatusScreen
      tone="info"
      icon={<Loader2 className="animate-spin" />}
      title={mode === "signin" ? "Checking your pass" : "Finding your visit"}
      message="This only takes a moment."
    />
  );
}

const FAILS: Record<
  FailReason,
  { icon: ReactNode; title: string; next: string; tone: "error" | "warning" }
> = {
  notfound: {
    icon: <Search />,
    title: "We could not find this pass.",
    next: "Please check the code in your invitation and try again.",
    tone: "warning",
  },
  invalid: {
    icon: <QrCode />,
    title: "This QR code could not be read as a valid pass.",
    next: "Try holding it a little further away, or type your pass code.",
    tone: "warning",
  },
  expired: {
    icon: <Clock />,
    title: "This pass has expired.",
    next: "Please ask your host for a new invitation, or reception can help.",
    tone: "warning",
  },
  cancelled: {
    icon: <XCircle />,
    title: "This pass was cancelled by your host.",
    next: "Please contact your host, or reception can help you.",
    tone: "warning",
  },
  used: {
    icon: <CheckCircle2 />,
    title: "This pass has already been used to check in.",
    next: "If you think this is a mistake, reception can sort it out.",
    tone: "warning",
  },
  otherdate: {
    icon: <CalendarX />,
    title: "",
    next: "Please come back on one of those days, or reception can help.",
    tone: "warning",
  },
  blocked: {
    icon: <Ban />,
    title: "We are unable to check you in right now. Please see the reception desk.",
    next: "Reception has been notified and will be with you shortly.",
    tone: "error",
  },
  notcheckedin: {
    icon: <AlertCircle />,
    title: "This pass has not been used to check in yet.",
    next: "There is nothing to sign out. Use Sign in on the home screen if you are arriving.",
    tone: "warning",
  },
};

function Fail() {
  const { session, go } = useKiosk();
  const r = session.failReason ?? "notfound";
  const f = FAILS[r];
  const so = session.flow === "signout";
  const title =
    r === "otherdate"
      ? `This pass is valid on ${session.code === "VIS-6006" ? "12 to 14 October" : "other dates"}, not today.`
      : f.title;
  return (
    <Page>
      <FlowHeader onCancel={() => {}} />
      <StatusScreen tone={f.tone} icon={f.icon} title={title} message={f.next}>
        <Btn onClick={() => go(so ? "so-scan" : "si-scan")} className="min-w-[200px]">
          Try again
        </Btn>
        {r !== "blocked" && (
          <Btn variant="secondary" onClick={() => go(so ? "so-code" : "si-code")}>
            Enter pass code instead
          </Btn>
        )}
        <Btn
          variant="secondary"
          onClick={() => {
            update({ returnTo: "fail" });
            go("faq");
          }}
        >
          Read FAQs
        </Btn>
        <HelpBtn />
      </StatusScreen>
    </Page>
  );
}

/* ================= WELCOME / BADGE ================= */
function visitorTypeFor(purpose?: string): VisitorType {
  if (purpose === "Interview") return "Candidate";
  if (purpose === "Vendor or service" || purpose === "Delivery") return "Vendor";
  return "Guest";
}

function useVisitInfo() {
  const { session } = useKiosk();
  const p = session.pass;
  const hostLabel = p
    ? `${p.host.name}, ${p.host.dept}`
    : session.host
      ? `${session.host.name}, ${session.host.dept}`
      : session.dept
        ? `${session.dept} team`
        : "Reception";
  const hostShort = p
    ? p.host.name
    : (session.host?.name ?? (session.dept ? `${session.dept} team` : "Reception"));
  const hostEmployeeId = p?.hostEmployeeId ?? session.host?.employeeId;
  const designation = p?.designation ?? session.host?.designation;
  const department = p?.department ?? p?.host.dept ?? session.host?.dept ?? session.dept;
  const location = p?.location ?? session.host?.location;
  const extension = p?.extension ?? session.host?.extension;
  const hostStatus = p?.hostStatus ?? session.host?.status ?? "In office";
  const backupContact = p?.backupContact ?? session.host?.backupContact;

  const purposeCategory = p?.purposeCategory ?? (p ? p.purpose : (session.purpose ?? "Visit"));
  const purposeDetails =
    p?.purposeDetails ??
    session.purposeDetails ??
    (session.hostNote ? `Note for host: ${session.hostNote}` : undefined);
  const slot = p
    ? p.slot
    : `Today, from ${new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
  const durationMinutes = p?.durationMinutes;
  const type = p ? p.type : visitorTypeFor(session.purpose);
  const headcount = p?.headcount ?? 1;
  const bringList = p?.bringList;
  const nextStep = p?.nextStep;
  const safetyNote = p?.safetyNote;
  const approvalStatus =
    p?.approvalStatus ?? (p?.needsApproval ? "Approved by host" : "Pre-approved");
  const dayNumber = p?.dayNumber ?? 1;
  const totalDays = p?.totalDays ?? (p?.daysRemaining ? p.daysRemaining : 1);
  const passValidity = p?.validDates
    ? `${p.validDates} (Day ${dayNumber} of ${totalDays})`
    : totalDays > 1
      ? `Day ${dayNumber} of ${totalDays}`
      : "Today only";

  return {
    name: session.name,
    hostLabel,
    hostShort,
    hostEmployeeId,
    designation,
    department,
    location,
    extension,
    hostStatus,
    backupContact,
    purposeCategory,
    purposeDetails,
    slot,
    durationMinutes,
    type,
    headcount,
    bringList,
    nextStep,
    safetyNote,
    approvalStatus,
    passValidity,
    dayNumber,
    totalDays,
  };
}

function Welcome() {
  const { session, go, update, visits, setVisit } = useKiosk();
  const info = useVisitInfo();
  const [showMore, setShowMore] = useState(false);

  const print = async () => {
    const passCode = session.pass?.id;
    if (!passCode) {
      go("network");
      return;
    }
    try {
      const visit = await checkInPass(passCode);
      if (visit.status !== "checked-in") throw new Error("The visit was not checked in.");
      setVisit(passCode, { ...visits[passCode], status: "in", checkInAt: Date.now() });
    } catch {
      go("network");
      return;
    }
    update({ badgeNo: `B-${Math.floor(10000 + Math.random() * 89999)}` });
    go("printing");
  };

  const hostInitials = (info.hostShort || "Host")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  const isLong =
    (info.bringList && info.bringList.length > 2) ||
    (info.purposeDetails && info.purposeDetails.length > 90);

  return (
    <Page>
      <FlowHeader onCancel={() => {}} steps={SI_STEPS} current={1} />
      <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col justify-between py-1">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wider text-success">
                Visit details
              </p>
              <h1 className="text-[28px] font-bold tracking-tight">
                Welcome, {firstName(info.name)}.
              </h1>
            </div>
            {session.early && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-primary-soft px-4 py-2.5 text-[13px] font-medium text-primary">
                <Clock className="h-4 w-4" /> You are a little early. {info.hostShort} has been told
                you are here.
              </div>
            )}
          </div>

          {/* Two-column layout on 1280x800 */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left column: Who you are meeting */}
            <div className="flex flex-col rounded-3xl border border-border/80 bg-card p-6 shadow-soft">
              <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                Who you are meeting
              </span>
              <div className="mt-3 flex items-start gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary-soft text-[17px] font-bold text-primary shadow-sm">
                  {hostInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-[18px] font-bold">{info.hostShort}</h2>
                    {info.hostStatus && (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
                          info.hostStatus === "In office"
                            ? "bg-success-soft text-success"
                            : info.hostStatus === "In a meeting"
                              ? "bg-warning-soft text-warning-foreground"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {info.hostStatus}
                      </span>
                    )}
                  </div>
                  {info.hostEmployeeId && (
                    <div className="text-[13px] font-semibold text-primary">
                      {info.hostEmployeeId}
                      {info.designation ? ` · ${info.designation}` : ""}
                    </div>
                  )}
                  {info.department && (
                    <div className="text-[13px] text-muted-foreground">{info.department}</div>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-2.5 divide-y divide-border/60 border-t border-border/60 pt-2 text-[13px]">
                {info.location && (
                  <div className="flex items-start justify-between gap-4 pt-2">
                    <span className="font-semibold text-muted-foreground">Location</span>
                    <span className="text-right font-semibold text-foreground">
                      {info.location}
                    </span>
                  </div>
                )}
                {info.extension && (
                  <div className="flex items-center justify-between gap-4 pt-2">
                    <span className="font-semibold text-muted-foreground">Office extension</span>
                    <span className="font-semibold text-foreground">{info.extension}</span>
                  </div>
                )}
                {info.hostStatus === "Away" && info.backupContact && (
                  <div className="flex items-center justify-between gap-4 pt-2">
                    <span className="font-semibold text-muted-foreground">Backup contact</span>
                    <span className="font-semibold text-foreground">{info.backupContact}</span>
                  </div>
                )}
              </div>

              <div className="mt-auto pt-4 text-[13px] font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <span>{firstName(info.hostShort)} has been told you are here.</span>
              </div>
            </div>

            {/* Right column: About your visit */}
            <div className="flex flex-col rounded-3xl border border-border/80 bg-card p-6 shadow-soft">
              <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                About your visit
              </span>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="rounded-full bg-primary-soft px-3 py-1 text-[13px] font-semibold text-primary">
                  {info.purposeCategory}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
                      info.type === "VIP"
                        ? "bg-warning-soft text-warning-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {info.type}
                  </span>
                  {info.approvalStatus && (
                    <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-[12px] font-semibold text-success">
                      {info.approvalStatus}
                    </span>
                  )}
                </div>
              </div>

              {info.purposeDetails && (
                <p className="mt-3 text-[14px] leading-relaxed text-foreground">
                  {info.purposeDetails}
                </p>
              )}

              <div className="mt-4 space-y-2.5 divide-y divide-border/60 border-t border-border/60 pt-2 text-[13px]">
                <div className="flex items-center justify-between pt-2">
                  <span className="font-semibold text-muted-foreground">Time slot</span>
                  <span className="font-semibold text-foreground">
                    {info.slot}
                    {info.durationMinutes
                      ? ` (${info.durationMinutes >= 60 ? `${Math.round(info.durationMinutes / 60)} hr` : `${info.durationMinutes} mins`})`
                      : ""}
                  </span>
                </div>
                {info.passValidity && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="font-semibold text-muted-foreground">Pass validity</span>
                    <span className="font-semibold text-foreground">{info.passValidity}</span>
                  </div>
                )}
                {info.headcount && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="font-semibold text-muted-foreground">Pass headcount</span>
                    <span className="font-semibold text-foreground">
                      {info.headcount} {info.headcount === 1 ? "person" : "people"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom strip: Before you go in */}
          {(info.bringList?.length || info.nextStep || info.safetyNote) && (
            <div className="mt-4 rounded-2xl border border-border/80 bg-card/85 p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                  Before you go in
                </span>
                {isLong && (
                  <button
                    onClick={() => setShowMore(!showMore)}
                    className="text-[12px] font-semibold text-primary hover:underline"
                  >
                    {showMore ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-4 text-[13px]">
                {info.bringList?.length ? (
                  <div>
                    <span className="block text-[12px] font-semibold text-muted-foreground">
                      What to bring
                    </span>
                    <span className="text-foreground">
                      {showMore
                        ? info.bringList.join(", ")
                        : info.bringList.slice(0, 2).join(", ") +
                          (info.bringList.length > 2
                            ? ` (+${info.bringList.length - 2} more)`
                            : "")}
                    </span>
                  </div>
                ) : null}
                {info.nextStep ? (
                  <div>
                    <span className="block text-[12px] font-semibold text-muted-foreground">
                      Where to wait or go next
                    </span>
                    <span className="text-foreground">{info.nextStep}</span>
                  </div>
                ) : null}
                {info.safetyNote ? (
                  <div>
                    <span className="block text-[12px] font-semibold text-muted-foreground">
                      Site safety note
                    </span>
                    <span className="text-foreground">{info.safetyNote}</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
          <p className="text-[13px] text-muted-foreground">
            Badge will print below. Please wear it visibly at all times.
          </p>
          <Btn className="min-w-[240px]" onClick={print}>
            <Printer className="h-5 w-5" /> Print my badge
          </Btn>
        </div>
      </div>
    </Page>
  );
}

function Reentry() {
  const { session, go, update, visits, setVisit } = useKiosk();
  const back = () => {
    if (session.pass) setVisit(session.pass.id, { ...visits[session.pass.id], status: "in" });
  };
  return (
    <Page>
      <FlowHeader onCancel={() => {}} />
      <StatusScreen
        tone="success"
        icon={<DoorOpen />}
        title={`Welcome back, ${firstName(session.name)}.`}
        message="Good to see you again. Do you need a new badge?"
      >
        <Btn
          variant="secondary"
          onClick={() => {
            back();
            go("success");
          }}
        >
          I still have my badge
        </Btn>
        <Btn
          onClick={() => {
            back();
            update({ badgeNo: `B-${Math.floor(10000 + Math.random() * 89999)}` });
            go("printing");
          }}
        >
          <Printer className="h-5 w-5" /> Reprint my badge
        </Btn>
      </StatusScreen>
    </Page>
  );
}

function Printing() {
  const { go, printerFail } = useKiosk();
  useEffect(() => {
    const t = setTimeout(() => go(printerFail ? "print-fail" : "badge"), 2600);
    return () => clearTimeout(t);
  }, [go, printerFail]);
  return (
    <Page>
      <FlowHeader steps={SI_STEPS} current={2} />
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="relative mb-8 h-32 w-40">
          <div className="absolute inset-x-6 top-0 h-20 overflow-hidden">
            <div className="animate-print mx-auto h-24 w-24 rounded-md border border-border bg-card shadow-soft" />
          </div>
          <div className="absolute inset-x-0 bottom-0 grid h-20 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-primary">
            <Printer className="h-9 w-9" />
          </div>
        </div>
        <h1 className="text-[24px] font-bold">Printing your badge</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Almost there, it will appear just below the screen.
        </p>
      </div>
    </Page>
  );
}

function Badge() {
  const { session, go } = useKiosk();
  const info = useVisitInfo();
  const passCode = session.pass?.id ?? session.code;
  const badgePurpose =
    session.purpose === "Other" && session.purposeDetails
      ? `Other: ${session.purposeDetails}`
      : info.purposeCategory;
  return (
    <Page>
      <FlowHeader steps={SI_STEPS} current={2} />
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="mb-2 text-[14px] font-semibold text-success">Your badge is ready</p>
        <h1 className="mb-8 text-[24px] font-bold">Please collect it from the tray below</h1>
        <BadgePreview
          name={info.name}
          host={info.hostShort}
          dept={info.department}
          type={info.type}
          purpose={badgePurpose}
          badgeNo={session.badgeNo ?? "B-00000"}
          passCode={passCode ?? ""}
        />
        <Btn className="mt-10 min-w-[280px]" onClick={() => go("success")}>
          I have my badge
        </Btn>
      </div>
    </Page>
  );
}

function PrintFail() {
  const { go, update } = useKiosk();
  return (
    <Page>
      <FlowHeader onCancel={() => {}} />
      <StatusScreen
        tone="warning"
        icon={<Printer />}
        title="We could not print your badge."
        message="Please go to reception and show this code. You are already checked in."
        extra={
          <div className="rounded-2xl bg-card px-10 py-5 text-[40px] font-bold tracking-[0.2em] text-primary shadow-soft">
            {PRINT_FAIL_CODE}
          </div>
        }
      >
        <Btn onClick={() => go("printing")}>Try printing again</Btn>
        <Btn
          variant="secondary"
          onClick={() => {
            update({ returnTo: "print-fail" });
            go("faq");
          }}
        >
          Read FAQs
        </Btn>
        <HelpBtn />
      </StatusScreen>
    </Page>
  );
}

function Success() {
  const { endSession } = useKiosk();
  return (
    <StatusScreen
      tone="success"
      icon={<Check />}
      title="You are signed in."
      message="Please collect your badge and have a great day."
      extra={<AutoHome seconds={10} />}
    >
      <Btn className="min-w-[240px]" onClick={() => endSession()}>
        Done
      </Btn>
    </StatusScreen>
  );
}

/* ================= WALK-IN ================= */
type Field = "name" | "phone" | "company";
function Details() {
  const { session, update, go } = useKiosk();
  const [active, setActive] = useState<Field>("name");
  const val = session[active];
  const set = (v: string) => update({ [active]: v } as Partial<typeof session>);
  const valid = session.name.trim().length >= 2 && session.phone.length === 10;
  const typeChar = (k: string) => {
    if (val.length >= 40) return;
    const cap = val === "" || val.endsWith(" ");
    set(val + (/[A-Z]/.test(k) && !cap ? k.toLowerCase() : k));
  };
  const nextField = () =>
    setActive(active === "name" ? "phone" : active === "phone" ? "company" : "name");
  const F = ({
    f,
    label,
    opt,
    placeholder,
  }: {
    f: Field;
    label: string;
    opt?: boolean;
    placeholder: string;
  }) => (
    <button
      onClick={() => setActive(f)}
      className={cn(
        "block w-full rounded-2xl border-2 bg-card px-5 py-3 text-left transition-colors",
        active === f ? "border-primary shadow-soft" : "border-border",
      )}
    >
      <div className="text-[13px] font-semibold text-muted-foreground">
        {label} {opt && <span className="font-normal">(optional)</span>}
      </div>
      <div
        className={cn(
          "mt-0.5 h-7 truncate text-[18px] font-semibold",
          !session[f] && "text-muted-foreground/60",
        )}
      >
        {f === "phone" && session.phone ? `+91 ${session.phone}` : session[f] || placeholder}
        {active === f && (
          <span className="ml-0.5 inline-block h-5 w-0.5 animate-pulse bg-primary align-middle" />
        )}
      </div>
    </button>
  );
  return (
    <Page>
      <FlowHeader onBack={() => go("home")} onCancel={() => {}} steps={WI_STEPS} current={0} />
      <div className="grid flex-1 grid-cols-[1fr_1.15fr] items-center gap-10">
        <div>
          <Heading title="Tell us about you" sub="Just a few details and you are all set." />
          <div className="flex flex-col gap-3">
            {F({ f: "name", label: "Full name", placeholder: "e.g. Priya Raman" })}
            {F({ f: "phone", label: "Mobile number", placeholder: "10-digit number" })}
            {F({ f: "company", label: "Company", opt: true, placeholder: "Where you work" })}
          </div>
          <Btn className="mt-6 w-full" disabled={!valid} onClick={() => go("wi-purpose")}>
            Continue <ArrowRight className="h-5 w-5" />
          </Btn>
          {!valid && (
            <p className="mt-2 text-center text-[12px] text-muted-foreground">
              Add your name and a 10-digit mobile number to continue.
            </p>
          )}
        </div>
        {active === "phone" ? (
          <div className="mx-auto w-full max-w-[400px]">
            <Keypad
              onDigit={(d) => session.phone.length < 10 && update({ phone: session.phone + d })}
              onBackspace={() => update({ phone: session.phone.slice(0, -1) })}
              onClear={() => update({ phone: "" })}
            />
            <Btn variant="secondary" className="mt-4 w-full" onClick={nextField}>
              Next field
            </Btn>
          </div>
        ) : (
          <Keyboard onKey={typeChar} onBackspace={() => set(val.slice(0, -1))} onDone={nextField} />
        )}
      </div>
    </Page>
  );
}

function OtpScreen({
  phone,
  onSuccess,
  onBack,
  onChange,
  steps,
  current,
  cooldownReturn,
}: {
  phone: string;
  onSuccess: () => void;
  onBack: () => void;
  onChange?: () => void;
  steps: string[];
  current: number;
  cooldownReturn: Screen;
}) {
  const { go, update } = useKiosk();
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);
  const [tries, setTries] = useState(0);
  const [resendKey, setResendKey] = useState(0);
  const [resent, setResent] = useState(false);
  const left = useCountdown(30, undefined, resendKey);
  useEffect(() => {
    if (code.length !== 6) return;
    if (code === CORRECT_OTP) {
      const t = setTimeout(onSuccess, 250);
      return () => clearTimeout(t);
    }
    const n = tries + 1;
    setTries(n);
    setErr(true);
    const t = setTimeout(() => {
      setCode("");
      setErr(false);
      if (n >= 3) {
        update({ returnTo: cooldownReturn });
        go("otp-cooldown");
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  return (
    <Page>
      <FlowHeader onBack={onBack} onCancel={() => {}} steps={steps} current={current} />
      <div className="grid flex-1 grid-cols-2 items-center gap-16">
        <div>
          <Heading
            title="Let us verify your phone"
            sub={`Demo phone verification for ${maskPhone(phone)}. No SMS is sent.`}
          />
          <OtpInput value={code} error={err} />
          <div className="mt-3 h-5 text-[13px]">
            {tries > 0 && !err && (
              <span className="font-medium text-destructive">
                That code did not match. Let us try again. ({3 - tries}{" "}
                {3 - tries === 1 ? "try" : "tries"} left)
              </span>
            )}
            {resent && tries === 0 && (
              <span className="text-success">A new code is on its way.</span>
            )}
          </div>
          <div className="mt-6 flex gap-6">
            <button
              disabled={left > 0}
              onClick={() => {
                setResendKey((k) => k + 1);
                setResent(true);
              }}
              className="h-12 text-[14px] font-semibold text-primary disabled:text-muted-foreground"
            >
              {left > 0 ? `Resend code in ${left}s` : "Resend code"}
            </button>
            {onChange && (
              <button onClick={onChange} className="h-12 text-[14px] font-semibold text-primary">
                Change number
              </button>
            )}
          </div>
          <p className="mt-6 text-[12px] text-muted-foreground">
            Simulation only: no SMS is sent. Demo code: 123456.
          </p>
        </div>
        <Keypad
          onDigit={(d) => !err && setCode((c) => (c.length < 6 ? c + d : c))}
          onBackspace={() => setCode((c) => c.slice(0, -1))}
          onClear={() => setCode("")}
        />
      </div>
    </Page>
  );
}

function Cooldown() {
  const { session, go } = useKiosk();
  const left = useCountdown(30, () => go(session.returnTo ?? "home"));
  return (
    <Page>
      <FlowHeader onCancel={() => {}} />
      <StatusScreen
        tone="warning"
        icon={<Hourglass />}
        title="Let us take a short pause."
        message="That code did not match three times. For your security, you can try again in a moment. Reception can also help."
        extra={<Ring value={left} total={30} tone="warning" />}
      >
        <HelpBtn />
      </StatusScreen>
    </Page>
  );
}

function Purpose() {
  const { session, update, go } = useKiosk();
  const [selected, setSelected] = useState<string>(session.purpose ?? "");
  const [otherText, setOtherText] = useState(session.purposeDetails ?? "");
  const [hostNote, setHostNote] = useState(session.hostNote ?? "");
  const [showNote, setShowNote] = useState(!!session.hostNote);
  const [touchedOther, setTouchedOther] = useState(false);
  const [activeInput, setActiveInput] = useState<"other" | "note">("other");

  const isOther = selected === "Other";
  const otherValid = !isOther || (otherText.trim().length >= 10 && otherText.trim().length <= 200);
  const canContinue = selected !== "" && (!isOther || otherValid);
  const showOtherError =
    isOther && (touchedOther || otherText.length > 0) && otherText.trim().length < 10;

  const handleSelectPurpose = (p: string) => {
    setSelected(p);
    if (p === "Other") {
      setActiveInput("other");
    }
  };

  const handleChar = (k: string) => {
    if (activeInput === "other") {
      if (otherText.length >= 200) return;
      const cap = otherText === "" || otherText.endsWith(" ");
      const ch = /[A-Z]/.test(k) && !cap ? k.toLowerCase() : k;
      setOtherText((prev) => prev + ch);
    } else {
      if (hostNote.length >= 120) return;
      const cap = hostNote === "" || hostNote.endsWith(" ");
      const ch = /[A-Z]/.test(k) && !cap ? k.toLowerCase() : k;
      setHostNote((prev) => prev + ch);
    }
  };

  const handleBackspace = () => {
    if (activeInput === "other") {
      setOtherText((prev) => prev.slice(0, -1));
    } else {
      setHostNote((prev) => prev.slice(0, -1));
    }
  };

  const submit = () => {
    if (!canContinue) {
      if (isOther && otherText.trim().length < 10) setTouchedOther(true);
      return;
    }
    update({
      purpose: selected,
      purposeDetails: isOther ? otherText.trim() : undefined,
      hostNote: !isOther && hostNote.trim() ? hostNote.trim() : undefined,
      host: undefined,
      dept: undefined,
      hostUnsure: false,
    });
    go("wi-host");
  };

  return (
    <Page>
      <FlowHeader
        onBack={() => go("wi-details")}
        onCancel={() => {}}
        steps={WI_STEPS}
        current={1}
      />
      <div className="grid flex-1 grid-cols-[1.1fr_1fr] items-center gap-10">
        <div className="flex flex-col justify-center">
          <Heading
            title={`Nice to meet you, ${firstName(session.name)}. What brings you here today?`}
            sub="Choose an option below to let your host know."
          />
          <div className="grid grid-cols-3 gap-3">
            {PURPOSES.map((p) => (
              <button
                key={p}
                onClick={() => handleSelectPurpose(p)}
                className={cn(
                  "pressable min-h-[76px] rounded-2xl border-2 bg-card px-4 text-[15px] font-semibold shadow-soft",
                  selected === p
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-transparent text-foreground hover:border-border",
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Inline textarea when "Other" is selected */}
          {isOther && (
            <div className="mt-4 rounded-2xl border-2 border-primary/40 bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-semibold text-foreground">
                  Please tell us the reason for your visit
                </label>
                <span
                  className={cn(
                    "text-[12px] tabular-nums",
                    otherText.length < 10 ? "text-muted-foreground" : "font-semibold text-primary",
                  )}
                >
                  {otherText.length} / 200
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                A short sentence is enough.
              </p>
              <div
                onClick={() => setActiveInput("other")}
                className="mt-2 min-h-[64px] cursor-text rounded-xl border border-border bg-background p-3 text-[14px] leading-relaxed"
              >
                {otherText || (
                  <span className="text-muted-foreground/60">
                    e.g. Discussing project partnership...
                  </span>
                )}
                {activeInput === "other" && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-middle" />
                )}
              </div>
              {showOtherError && (
                <p className="mt-1.5 text-[12px] font-medium text-destructive">
                  Please add a few words so we can tell your host.
                </p>
              )}
            </div>
          )}

          {/* Collapsible note for other purposes */}
          {selected !== "" && !isOther && (
            <div className="mt-4">
              {!showNote ? (
                <button
                  onClick={() => {
                    setShowNote(true);
                    setActiveInput("note");
                  }}
                  className="text-[13px] font-semibold text-primary hover:underline"
                >
                  + Add a note for your host (optional)
                </button>
              ) : (
                <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <div className="flex items-center justify-between">
                    <label className="text-[13px] font-semibold text-foreground">
                      Add a note for your host
                    </label>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {hostNote.length} / 120
                    </span>
                  </div>
                  <div
                    onClick={() => setActiveInput("note")}
                    className="mt-2 min-h-[52px] cursor-text rounded-xl border border-border bg-background p-3 text-[14px]"
                  >
                    {hostNote || (
                      <span className="text-muted-foreground/60">
                        e.g. Bringing samples to room 302...
                      </span>
                    )}
                    {activeInput === "note" && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-middle" />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <Btn className="mt-6 w-full" disabled={!canContinue} onClick={submit}>
            Continue <ArrowRight className="h-5 w-5" />
          </Btn>
        </div>

        {/* On-screen keyboard for typing */}
        <div className="flex flex-col justify-center">
          <Keyboard
            onKey={handleChar}
            onBackspace={handleBackspace}
            onDone={submit}
            doneLabel="Continue"
          />
        </div>
      </div>
    </Page>
  );
}

function HostStep() {
  const { session, update, go, setHelpOpen } = useKiosk();
  const [digits, setDigits] = useState("");
  const [matched, setMatched] = useState<Host | null>(null);
  const [directoryError, setDirectoryError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const failedCountRef = useRef(0);
  const [cooldown, setCooldown] = useState(0);

  const delivery = session.purpose === "Delivery";
  const interview = session.purpose === "Interview";

  const pick = (p: Partial<typeof session>) => {
    update({ host: undefined, dept: undefined, hostUnsure: false, ...p });
    go("wi-consent");
  };

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const runLookup = async (num: string) => {
    if (num.length !== 4) return;
    const fullId = `EMP-${num}`;
    try {
      const rows = await searchKioskHosts(fullId);
      const found = rows.find((host) => host.employee_id.toUpperCase() === fullId);
      if (found) {
        setMatched({
          id: found.id,
          employeeId: found.employee_id,
          name: found.name,
          dept: found.department,
        });
        setNotFound(false);
        setDirectoryError("");
        failedCountRef.current = 0;
        return;
      }
      setMatched(null);
      setNotFound(true);
      const nextFail = failedCountRef.current + 1;
      failedCountRef.current = nextFail;
      if (nextFail >= 5) {
        setCooldown(30);
      }
    } catch (error) {
      setDirectoryError(error instanceof Error ? error.message : "Host directory unavailable.");
    }
  };

  const handleDigit = (d: string) => {
    if (cooldown > 0 || matched) return;
    if (digits.length < 4) {
      const next = digits + d;
      setDigits(next);
      setNotFound(false);
      if (next.length === 4) {
        runLookup(next);
      }
    }
  };

  const handleBackspace = () => {
    if (cooldown > 0 || matched) return;
    setDigits((prev) => prev.slice(0, -1));
    setNotFound(false);
  };

  const handleClear = () => {
    if (cooldown > 0) return;
    setDigits("");
    setMatched(null);
    setNotFound(false);
  };

  if (delivery) {
    return (
      <Page>
        <FlowHeader
          onBack={() => go("wi-purpose")}
          onCancel={() => {}}
          steps={WI_STEPS}
          current={2}
        />
        <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col justify-center">
          <Heading
            title="Which department is the delivery for?"
            sub="We will let them know it has arrived."
          />
          <div className="grid grid-cols-3 gap-6">
            {DEPARTMENTS.map((d) => (
              <button
                key={d}
                onClick={() => pick({ dept: d })}
                className="pressable min-h-[88px] rounded-2xl bg-card text-[16px] font-semibold shadow-soft hover:shadow-lift"
              >
                {d}
              </button>
            ))}
            <button
              onClick={() => pick({ hostUnsure: true })}
              className="pressable min-h-[88px] rounded-2xl border-2 border-dashed border-border text-[15px] font-semibold text-muted-foreground hover:bg-card"
            >
              I am not sure
            </button>
          </div>
        </div>
      </Page>
    );
  }

  const labelText = interview ? "Recruiter or HR employee ID" : "Employee ID";
  const helperText = interview
    ? "Your host can share this with you. Example: EMP-1002."
    : "Your host can share this with you. Example: EMP-1001.";

  return (
    <Page>
      <FlowHeader
        onBack={() => go("wi-purpose")}
        onCancel={() => {}}
        steps={WI_STEPS}
        current={2}
      />
      <div className="grid flex-1 grid-cols-2 items-center gap-16">
        <div>
          <Heading
            title={interview ? "Who is your recruiter or HR contact?" : "Who are you meeting?"}
            sub={helperText}
          />
          {directoryError && (
            <p role="alert" className="mb-3 text-[13px] text-destructive">
              {directoryError}
            </p>
          )}

          {/* If 5 failed attempts: pause for 30 seconds */}
          {cooldown > 0 ? (
            <div className="rounded-3xl border border-warning/40 bg-warning-soft p-6 shadow-soft text-center">
              <span className="text-[13px] font-semibold text-warning-foreground">
                Lookups paused for security
              </span>
              <div className="my-3 text-[32px] font-bold tabular-nums text-foreground">
                {cooldown}s
              </div>
              <p className="text-[14px] text-muted-foreground">
                Multiple attempts did not match. Please ask reception for assistance.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Btn onClick={() => setHelpOpen(true)}>
                  <LifeBuoy className="h-5 w-5" /> Ask reception
                </Btn>
                <Btn variant="secondary" onClick={() => pick({ hostUnsure: true })}>
                  I am not sure
                </Btn>
              </div>
            </div>
          ) : matched ? (
            /* Confirmation card on exact match (avatar, name, designation, dept only) */
            <div className="rounded-3xl border border-primary/30 bg-card p-6 shadow-lift">
              <span className="text-[12px] font-bold uppercase tracking-wider text-success">
                Employee found
              </span>
              <div className="mt-4 flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-[18px] font-bold text-primary shadow-sm">
                  {matched.name
                    .split(" ")
                    .map((x) => x[0])
                    .join("")}
                </div>
                <div>
                  <h3 className="text-[19px] font-bold text-foreground">{matched.name}</h3>
                  <div className="text-[14px] font-semibold text-primary">
                    {matched.designation}
                  </div>
                  <div className="text-[13px] text-muted-foreground">{matched.dept}</div>
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <Btn onClick={() => pick({ host: matched })}>
                  Yes, this is my host <ArrowRight className="h-5 w-5" />
                </Btn>
                <Btn
                  variant="secondary"
                  onClick={() => {
                    setMatched(null);
                    setDigits("");
                  }}
                >
                  Not them, search again
                </Btn>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-1 text-[13px] font-semibold text-muted-foreground">
                {labelText}
              </div>
              {/* Employee ID box with fixed EMP- prefix */}
              <div className="flex h-[84px] items-center rounded-2xl border-2 border-primary bg-card px-6 text-[32px] font-bold tracking-[0.12em] shadow-soft">
                <span className="select-none text-muted-foreground">EMP-</span>
                {Array.from({ length: 4 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "w-[1.1em] text-center",
                      !digits[i] && "text-border",
                      digits[i] && "text-foreground",
                    )}
                  >
                    {digits[i] ?? "•"}
                  </span>
                ))}
              </div>

              {/* Error message on no match */}
              {notFound && (
                <div className="mt-4 animate-shake rounded-2xl border border-destructive/20 bg-destructive-soft p-4">
                  <p className="text-[13px] font-medium text-destructive">
                    We could not find that employee ID. Please check the number, or ask reception
                    for help.
                  </p>
                  <div className="mt-2">
                    <button
                      onClick={() => setHelpOpen(true)}
                      className="text-[13px] font-semibold text-destructive underline"
                    >
                      Need help?
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3">
                <Btn disabled={digits.length < 4} onClick={() => runLookup(digits)}>
                  <Search className="h-5 w-5" /> Look up host
                </Btn>
                <button
                  onClick={() => pick({ hostUnsure: true })}
                  className="pressable flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-[14px] font-semibold text-muted-foreground hover:bg-card"
                >
                  <Users className="h-4 w-4" /> I am not sure, reception can help
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Keypad for digits */}
        <div className="mx-auto w-full max-w-[380px]">
          <Keypad onDigit={handleDigit} onBackspace={handleBackspace} onClear={handleClear} />
        </div>
      </div>
    </Page>
  );
}

function Consent() {
  const { go, update } = useKiosk();
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  const Box = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
    <button
      onClick={() => set(!on)}
      className="flex min-h-[64px] w-full items-center gap-4 rounded-2xl bg-card px-5 text-left shadow-soft"
    >
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 transition-colors",
          on ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {on && <Check className="h-5 w-5" />}
      </span>
      <span className="text-[14px] font-semibold">{label}</span>
    </button>
  );
  return (
    <Page>
      <FlowHeader onBack={() => go("wi-host")} onCancel={() => {}} steps={WI_STEPS} current={3} />
      <div className="grid flex-1 grid-cols-[1.2fr_1fr] gap-10">
        <div className="flex min-h-0 flex-col">
          <Heading title="Almost there" sub="Please read and agree to continue." />
          <div className="min-h-0 flex-1 space-y-4 overflow-auto rounded-2xl bg-card p-6 text-[14px] leading-relaxed text-muted-foreground shadow-soft">
            <div>
              <h3 className="mb-1 text-[15px] font-bold text-foreground">Privacy notice</h3>
              <p>
                Northstar collects your name, mobile number, company and visit details only to
                manage your visit and keep everyone on site safe. Your details are shared with your
                host and reception, kept for 90 days, and then deleted. You can ask reception to see
                or remove your information at any time.
              </p>
            </div>
            <div>
              <h3 className="mb-1 text-[15px] font-bold text-foreground">
                Non-disclosure agreement
              </h3>
              <p>
                During your visit you may see or hear information that is confidential to Northstar.
                You agree not to share, copy, photograph or record any such information without
                written permission. This agreement continues after your visit ends.
              </p>
              <p className="mt-2">
                Please keep your badge visible at all times and return it when you leave.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-end gap-4">
          <Box on={a} set={setA} label="I agree to the privacy notice" />
          <Box on={b} set={setB} label="I agree to the non-disclosure agreement" />
          <Btn
            className="mt-4"
            disabled={!a || !b}
            onClick={() => {
              update({ consentAccepted: a, ndaAccepted: b });
              go("wi-review");
            }}
          >
            Continue <ArrowRight className="h-5 w-5" />
          </Btn>
          <button
            onClick={() => go("wi-consent-declined")}
            className="h-12 text-[14px] font-semibold text-muted-foreground"
          >
            I do not agree
          </button>
        </div>
      </div>
    </Page>
  );
}

function ConsentDeclined() {
  const { go, update } = useKiosk();
  return (
    <Page>
      <FlowHeader onCancel={() => {}} />
      <StatusScreen
        tone="warning"
        icon={<ShieldAlert />}
        title="We cannot continue without your consent."
        message="Reception can help with any questions you have about it."
      >
        <Btn variant="secondary" onClick={() => go("wi-consent")}>
          Go back
        </Btn>
        <Btn
          variant="secondary"
          onClick={() => {
            update({ returnTo: "wi-consent-declined" });
            go("faq");
          }}
        >
          Read FAQs
        </Btn>
        <HelpBtn />
      </StatusScreen>
    </Page>
  );
}

function Review() {
  const { session, go, update } = useKiosk();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const siteId = kioskSiteId();
      if (!session.host?.id || !siteId)
        throw new Error("Please select a host and ask reception to pair this kiosk.");
      const visit = await submitWalkIn({
        visitor_name: session.name,
        visitor_phone: session.phone,
        company: session.company || undefined,
        host_id: session.host.id,
        site_id: siteId,
        purpose:
          session.purpose === "Other" && session.purposeDetails
            ? session.purposeDetails
            : session.purpose || "Visit",
        consent_accepted: session.consentAccepted === true,
        nda_accepted: session.ndaAccepted === true,
      });
      update({ visitRequestId: visit.id, pass: undefined });
      go("waiting");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Your request could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const hostText = session.host
    ? `${session.host.name}, ${session.host.dept}`
    : session.dept
      ? `${session.dept} department`
      : "Not sure, reception will help";

  const purposeDisplay =
    session.purpose === "Other" && session.purposeDetails
      ? `Other: ${session.purposeDetails}`
      : (session.purpose ?? "");

  const rows: [string, string, Screen][] = [
    ["Full name", session.name, "wi-details"],
    ["Mobile", `+91 ${session.phone}`, "wi-details"],
    ["Company", session.company || "Not added", "wi-details"],
    ["Purpose", purposeDisplay, "wi-purpose"],
    ...(session.hostNote
      ? [["Note for host", session.hostNote, "wi-purpose"] as [string, string, Screen]]
      : []),
    [session.purpose === "Delivery" ? "Department" : "Meeting", hostText, "wi-host"],
  ];
  return (
    <Page>
      <FlowHeader
        onBack={() => go("wi-consent")}
        onCancel={() => {}}
        steps={WI_STEPS}
        current={4}
      />
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center">
        <Heading title="Does this look right?" sub="Tap Edit to change anything." />
        <div className="divide-y divide-border rounded-3xl bg-card px-6 shadow-soft">
          {rows.map(([l, v, s]) => (
            <div key={l} className="flex items-center justify-between py-3.5">
              <div className="min-w-0 pr-4">
                <div className="text-[13px] font-semibold text-muted-foreground">{l}</div>
                <div className="truncate max-w-[420px] text-[15px] font-semibold">{v}</div>
              </div>
              <button
                onClick={() => go(s)}
                className="h-11 shrink-0 rounded-xl px-4 text-[14px] font-semibold text-primary hover:bg-primary-soft"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
        {submitError && (
          <p role="alert" className="mt-3 text-[13px] text-destructive">
            {submitError}
          </p>
        )}
        <Btn className="mt-6" disabled={submitting} onClick={submit}>
          {submitting ? "Submitting…" : "Submit"}
        </Btn>
      </div>
    </Page>
  );
}

/* ================= APPROVAL ================= */
function Waiting() {
  const { session, go, update, endSession } = useKiosk();
  const info = useVisitInfo();
  const walkin = session.flow === "walkin";
  const hostName = session.hostUnsure ? "reception" : info.hostShort;
  const left = useCountdown(45, () => go("noresponse"));
  useEffect(() => {
    if (!walkin || !session.visitRequestId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const request = await getKioskRequest(session.visitRequestId!);
        if (cancelled) return;
        if (request.status === "scheduled" && request.pass_code) {
          const visit = await verifyPass(request.pass_code);
          if (cancelled) return;
          const pass = mapApiPass(visit, request.pass_code);
          update({ pass, code: request.pass_code, name: pass.name, phone: pass.phone });
          go("approved");
          return;
        }
        if (request.status === "rejected" || request.status === "cancelled") {
          go("declined");
          return;
        }
      } catch {
        /* retry on the next poll; the kiosk view shows a timeout if it stays offline */
      }
      timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [walkin, session.visitRequestId, go, update]);
  return (
    <Page>
      <FlowHeader />
      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-[760px] flex-col gap-6 rounded-3xl border border-warning/40 bg-warning-soft p-8">
          <div className="flex items-center gap-8">
            <Ring value={left} total={45} size={140} tone="warning">
              <div className="text-center">
                <div className="text-[30px] font-bold tabular-nums">{left}</div>
                <div className="text-[12px] text-muted-foreground">seconds</div>
              </div>
            </Ring>
            <div className="flex-1">
              <span className="text-[13px] font-semibold text-warning-foreground">
                Waiting for approval
              </span>
              <h1 className="mt-1 text-[23px] font-bold leading-tight">
                Waiting for {hostName} to approve your visit.
              </h1>
              <p className="mt-2 text-[14px] text-muted-foreground">
                Your host has been notified in the VisitorHub dashboard. This usually takes less
                than a minute.
              </p>
            </div>
          </div>

          {/* Compact host and reason details */}
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
            <div className="grid grid-cols-2 gap-4 text-left">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Host
                </span>
                <div className="mt-0.5 text-[14px] font-bold text-foreground">{info.hostName}</div>
                <div className="text-[12px] text-muted-foreground">
                  {info.department || "General"}
                  {session.host?.employeeId ? ` · ${session.host.employeeId}` : ""}
                </div>
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Visit reason
                </span>
                <div
                  className="mt-0.5 truncate text-[14px] font-bold text-foreground"
                  title={session.purposeDetails || info.purposeCategory}
                >
                  {session.purpose === "Other" && session.purposeDetails
                    ? `Other: ${session.purposeDetails}`
                    : info.purposeCategory || session.purpose || "Visit"}
                </div>
                {session.hostNote && (
                  <div
                    className="truncate text-[12px] text-muted-foreground"
                    title={session.hostNote}
                  >
                    Note: {session.hostNote}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <Btn
              variant="secondary"
              onClick={() =>
                endSession(
                  "Leaving the kiosk. Your pending request remains with reception for review.",
                )
              }
            >
              Leave kiosk
            </Btn>
            <HelpBtn />
          </div>
        </div>
      </div>
    </Page>
  );
}

function Approved() {
  const { go } = useKiosk();
  useEffect(() => {
    const t = setTimeout(() => go("si-welcome"), 2200);
    return () => clearTimeout(t);
  }, [go]);
  const info = useVisitInfo();
  return (
    <StatusScreen
      tone="success"
      icon={<Check />}
      title="Your visit is approved."
      message={`${info.hostShort} is expecting you. Let us get your badge ready.`}
    />
  );
}

function Declined() {
  const { endSession, update, go } = useKiosk();
  return (
    <Page>
      <FlowHeader />
      <StatusScreen
        tone="error"
        icon={<XCircle />}
        title="Your visit was not approved this time."
        message="Please speak to reception, they will help you with the next step."
      >
        <HelpBtn />
        <Btn
          variant="secondary"
          onClick={() => {
            update({ returnTo: "declined" });
            go("faq");
          }}
        >
          Read FAQs
        </Btn>
        <Btn variant="secondary" onClick={() => endSession()}>
          Back to home
        </Btn>
      </StatusScreen>
    </Page>
  );
}

function NoResponse() {
  const { endSession, update, go } = useKiosk();
  return (
    <Page>
      <FlowHeader />
      <StatusScreen
        tone="warning"
        icon={<Clock />}
        title="Your host has not replied yet."
        message="Please go to the reception desk and show this code."
        extra={
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-2xl bg-card px-12 py-6 text-[48px] font-bold tracking-[0.2em] text-primary shadow-soft">
              {NO_RESPONSE_CODE}
            </div>
            <AutoHome seconds={20} />
          </div>
        }
      >
        <Btn className="min-w-[200px]" onClick={() => endSession()}>
          Back to home
        </Btn>
        <Btn
          variant="secondary"
          onClick={() => {
            update({ returnTo: "noresponse" });
            go("faq");
          }}
        >
          Read FAQs
        </Btn>
        <HelpBtn />
      </StatusScreen>
    </Page>
  );
}

/* ================= SIGN OUT ================= */
function Choose() {
  const { session, go, visits, setVisit } = useKiosk();
  const p = session.pass;
  if (!p) return null;
  const cards = [
    {
      t: "I am stepping out for a while",
      d: "Your pass stays valid today. Scan it again when you return.",
      icon: Clock,
      on: () => {
        setVisit(p.id, { ...visits[p.id], status: "out-temp" as const });
        go("so-temp");
      },
    },
    {
      t: "I am done with my visit",
      d: "Your visit will be closed and your pass will stop working.",
      icon: LogOut,
      on: () => go("so-otp"),
    },
  ];
  return (
    <Page>
      <FlowHeader onBack={() => go("so-scan")} onCancel={() => {}} steps={SO_STEPS} current={1} />
      <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col justify-center">
        <div className="mb-8 flex items-center gap-4 rounded-2xl bg-card p-5 shadow-soft">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-[15px] font-bold text-primary">
            {p.name
              .split(" ")
              .map((x) => x[0])
              .join("")}
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-bold">{p.name}</div>
            <div className="text-[13px] text-muted-foreground">
              Meeting {p.host.name}, {p.host.dept} · {p.slot}
            </div>
          </div>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-[13px] font-semibold text-primary">
            {visits[p.id]?.status === "out-temp" ? "Out temporarily" : "Checked in"}
          </span>
        </div>
        <Heading title="What would you like to do?" />
        <div className="grid grid-cols-2 gap-6">
          {cards.map((c) => (
            <button
              key={c.t}
              onClick={c.on}
              className="pressable flex min-h-[180px] flex-col items-start gap-4 rounded-3xl bg-card p-7 text-left shadow-soft hover:shadow-lift"
            >
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
                <c.icon className="h-7 w-7" />
              </div>
              <div>
                <div className="text-[18px] font-bold">{c.t}</div>
                <div className="mt-1 text-[14px] text-muted-foreground">{c.d}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Page>
  );
}

function TempOut() {
  const { session, endSession } = useKiosk();
  return (
    <StatusScreen
      tone="success"
      icon={<DoorOpen />}
      title={`See you soon, ${firstName(session.name)}.`}
      message="Your pass stays valid for today. Scan it at Sign in when you are back."
      extra={<AutoHome seconds={8} />}
    >
      <Btn className="min-w-[240px]" onClick={() => endSession()}>
        Done
      </Btn>
    </StatusScreen>
  );
}

function Confirm() {
  const { session, go, update, visits, setVisit } = useKiosk();
  const p = session.pass;
  const confirm = async () => {
    if (!p) return;
    try {
      await checkOutPass(p.id);
    } catch {
      go("network");
      return;
    }
    const v = visits[p.id] ?? { status: "in" as const };
    const mins = Math.max(
      1,
      Math.round((Date.now() - (v.checkInAt ?? Date.now() - 60000)) / 60000),
    );
    const h = Math.floor(mins / 60),
      m = mins % 60;
    update({
      durationText: [
        h ? `${h} hour${h > 1 ? "s" : ""}` : "",
        m ? `${m} minute${m > 1 ? "s" : ""}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
    setVisit(p.id, { ...v, status: "signed-out" });
    go("so-done");
  };
  return (
    <Page>
      <FlowHeader onBack={() => go("so-choose")} onCancel={() => {}} steps={SO_STEPS} current={2} />
      <StatusScreen
        tone="info"
        icon={<LogOut />}
        title="Ready to sign out?"
        message={
          <>
            This will close your visit and cancel your pass.
            {p?.daysRemaining ? (
              <>
                {" "}
                For a multi-day visit, the remaining days will be cancelled too{" "}
                <span className="font-semibold text-foreground">
                  ({p.daysRemaining} days remaining)
                </span>
                .
              </>
            ) : (
              " For a multi-day visit, the remaining days will be cancelled too."
            )}
          </>
        }
      >
        <Btn variant="secondary" className="min-w-[200px]" onClick={() => go("so-choose")}>
          Go back
        </Btn>
        <Btn className="min-w-[240px]" onClick={confirm}>
          Confirm sign-out
        </Btn>
      </StatusScreen>
    </Page>
  );
}

function SignedOut() {
  const { session, endSession } = useKiosk();
  return (
    <StatusScreen
      tone="success"
      icon={<Check />}
      title={`Thank you for visiting, ${firstName(session.name)}.`}
      message={`You have been signed out. Your visit lasted ${session.durationText ?? "a little while"}. Have a safe journey.`}
      extra={<AutoHome seconds={10} />}
    >
      <Btn className="min-w-[240px]" onClick={() => endSession()}>
        Done
      </Btn>
    </StatusScreen>
  );
}

function Already() {
  const { endSession } = useKiosk();
  return (
    <Page>
      <FlowHeader />
      <StatusScreen
        tone="info"
        icon={<CheckCircle2 />}
        title="This visit has already been signed out."
        message="No further action is needed. Have a lovely day."
      >
        <Btn className="min-w-[240px]" onClick={() => endSession()}>
          Back to home
        </Btn>
      </StatusScreen>
    </Page>
  );
}

/* ================= SYSTEM ================= */
function Network() {
  const { session, endSession, update, go } = useKiosk();
  return (
    <Page>
      <FlowHeader />
      <StatusScreen
        tone="warning"
        icon={<WifiOff />}
        title="We cannot connect right now."
        message="Please go to the reception desk, or try again in a moment."
      >
        <Btn
          className="min-w-[180px]"
          onClick={() =>
            session.code
              ? go(session.flow === "signout" ? "so-verifying" : "si-verifying")
              : endSession()
          }
        >
          Retry
        </Btn>
        <Btn
          variant="secondary"
          onClick={() => {
            update({ returnTo: "network" });
            go("faq");
          }}
        >
          Read FAQs
        </Btn>
        <HelpBtn />
      </StatusScreen>
    </Page>
  );
}

function Camera() {
  const { go, update, endSession } = useKiosk();
  return (
    <Page>
      <FlowHeader />
      <StatusScreen
        tone="warning"
        icon={<CameraOff />}
        title="The camera is not available."
        message="You can type your pass code instead."
      >
        <Btn
          onClick={() => {
            update({ flow: "signin" });
            go("si-code");
          }}
        >
          <KeyIcon className="h-5 w-5" /> Type pass code
        </Btn>
        <Btn
          variant="secondary"
          onClick={() => {
            update({ returnTo: "camera" });
            go("faq");
          }}
        >
          Read FAQs
        </Btn>
        <Btn variant="secondary" onClick={() => endSession()}>
          Back to home
        </Btn>
      </StatusScreen>
    </Page>
  );
}

/* ================= FAQ SCREEN ================= */
function FaqScreen() {
  const { go, session, setHelpOpen } = useKiosk();
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>("faq-1");

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FAQS.filter((item) => {
      const matchCat = selectedCategory === "All" || item.category === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;
      return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q);
    });
  }, [selectedCategory, searchQuery]);

  const handleKey = (char: string) => {
    if (searchQuery.length < 50) {
      setSearchQuery((prev) => prev + char);
    }
  };

  const handleBackspace = () => {
    setSearchQuery((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setSearchQuery("");
  };

  const returnTo = session.returnTo || "home";

  return (
    <Page>
      <FlowHeader onBack={() => go(returnTo)} onCancel={() => go("home")} />
      <div className="grid flex-1 grid-cols-[1.2fr_1fr] gap-8 min-h-0 py-2">
        {/* Left Column: Categories and Accordion list */}
        <div className="flex flex-col min-h-0">
          <Heading
            title="Frequently asked questions"
            sub="Find quick answers or tap below to ask reception for help."
          />

          {/* Category Tabs */}
          <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
            {FAQ_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "pressable shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-muted-foreground hover:bg-card/80 border border-border/60",
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Accordion Questions List */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2 pb-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center bg-card/40 my-auto">
                <HelpCircle className="h-10 w-10 text-muted-foreground/60 mb-2" />
                <h3 className="text-[16px] font-bold text-foreground">No answers found</h3>
                <p className="mt-1 text-[13px] text-muted-foreground max-w-sm">
                  We could not find anything matching "{searchQuery}". Reception will be glad to
                  assist you.
                </p>
                <div className="mt-5 flex gap-3">
                  <Btn onClick={() => setHelpOpen(true)}>
                    <LifeBuoy className="h-4 w-4" /> Need help? Call reception
                  </Btn>
                  <Btn variant="secondary" onClick={handleClear}>
                    Clear search
                  </Btn>
                </div>
              </div>
            ) : (
              filtered.map((item) => {
                const isOpen = openId === item.id;
                return (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all"
                  >
                    <button
                      onClick={() => setOpenId(isOpen ? null : item.id)}
                      className="flex w-full items-center justify-between p-4.5 text-left font-semibold text-[15px] hover:bg-primary-soft/40 transition-colors"
                      aria-expanded={isOpen}
                    >
                      <span className="flex-1 pr-3 text-foreground">{item.question}</span>
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
                          isOpen && "rotate-180 text-primary",
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div className="border-t border-border/50 bg-background/50 px-5 py-4 animate-fade">
                        <p className="text-[14px] leading-relaxed text-muted-foreground">
                          {item.answer}
                        </p>
                        <div className="mt-3 pt-3 border-t border-border/40 text-[12px] text-muted-foreground flex items-center justify-between">
                          <span className="rounded bg-primary-soft px-2 py-0.5 font-medium text-primary text-[11px]">
                            {item.category}
                          </span>
                          <span>
                            Still need help?{" "}
                            <button
                              onClick={() => setHelpOpen(true)}
                              className="font-semibold text-primary underline hover:text-primary/80"
                            >
                              Call reception
                            </button>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Search bar & on-screen keyboard */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-card/60 p-5 shadow-soft">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-semibold text-muted-foreground">
                Search questions & answers
              </label>
              {searchQuery && (
                <button
                  onClick={handleClear}
                  className="text-[12px] font-semibold text-primary hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Search Input Box */}
            <div className="relative mb-4">
              <div className="flex min-h-[56px] items-center rounded-2xl border-2 border-primary/60 bg-card px-4 text-[16px] shadow-inner-highlight">
                <Search className="mr-3 h-5 w-5 text-muted-foreground shrink-0" />
                <span
                  className={cn(
                    "flex-1 truncate font-medium",
                    !searchQuery && "text-muted-foreground/60",
                  )}
                >
                  {searchQuery || "Type a keyword (e.g. badge, QR, pass)..."}
                </span>
                <span className="ml-0.5 inline-block h-5 w-0.5 animate-pulse bg-primary align-middle" />
              </div>
            </div>
          </div>

          {/* On-screen Keyboard */}
          <div className="w-full">
            <Keyboard
              onKey={handleKey}
              onBackspace={handleBackspace}
              onDone={() => {}}
              doneLabel="Search"
            />
          </div>
        </div>
      </div>
    </Page>
  );
}

/* ================= ROUTER ================= */
export function CurrentScreen() {
  const { screen, session, go } = useKiosk();
  switch (screen) {
    case "home":
      return <Home />;
    case "si-scan":
      return <ScanScreen mode="signin" />;
    case "si-code":
      return <CodeScreen mode="signin" />;
    case "si-verifying":
      return <Verifying mode="signin" />;
    case "so-scan":
      return <ScanScreen mode="signout" />;
    case "so-code":
      return <CodeScreen mode="signout" />;
    case "so-verifying":
      return <Verifying mode="signout" />;
    case "fail":
      return <Fail />;
    case "si-welcome":
      return <Welcome />;
    case "si-reentry":
      return <Reentry />;
    case "printing":
      return <Printing />;
    case "badge":
      return <Badge />;
    case "print-fail":
      return <PrintFail />;
    case "success":
      return <Success />;
    case "wi-details":
      return <Details />;
    case "so-otp":
      return (
        <OtpScreen
          phone={session.phone}
          steps={SO_STEPS}
          current={2}
          cooldownReturn="so-otp"
          onBack={() => go("so-choose")}
          onSuccess={() => go("so-confirm")}
        />
      );
    case "otp-cooldown":
      return <Cooldown />;
    case "wi-purpose":
      return <Purpose />;
    case "wi-host":
      return <HostStep />;
    case "wi-consent":
      return <Consent />;
    case "wi-consent-declined":
      return <ConsentDeclined />;
    case "wi-review":
      return <Review />;
    case "waiting":
      return <Waiting />;
    case "approved":
      return <Approved />;
    case "declined":
      return <Declined />;
    case "noresponse":
      return <NoResponse />;
    case "so-choose":
      return <Choose />;
    case "so-temp":
      return <TempOut />;
    case "so-confirm":
      return <Confirm />;
    case "so-done":
      return <SignedOut />;
    case "so-already":
      return <Already />;
    case "network":
      return <Network />;
    case "camera":
      return <Camera />;
    case "faq":
      return <FaqScreen />;
  }
}

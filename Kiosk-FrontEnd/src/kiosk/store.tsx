import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type FailReason, type Host, type Pass, type VisitStatus } from "./data";

export type Screen =
  | "home"
  | "si-scan"
  | "si-code"
  | "si-verifying"
  | "fail"
  | "si-welcome"
  | "si-reentry"
  | "printing"
  | "badge"
  | "print-fail"
  | "success"
  | "wi-details"
  | "otp-cooldown"
  | "wi-purpose"
  | "wi-host"
  | "wi-consent"
  | "wi-consent-declined"
  | "wi-review"
  | "waiting"
  | "approved"
  | "declined"
  | "noresponse"
  | "so-scan"
  | "so-code"
  | "so-verifying"
  | "so-choose"
  | "so-temp"
  | "so-otp"
  | "so-confirm"
  | "so-done"
  | "so-already"
  | "network"
  | "camera"
  | "faq";

export const SCREEN_NAMES: Record<Screen, string> = {
  home: "Home",
  "si-scan": "Sign in · Scan",
  "si-code": "Sign in · Pass code",
  "si-verifying": "Sign in · Verifying",
  fail: "Pass problem",
  "si-welcome": "Sign in · Welcome",
  "si-reentry": "Sign in · Welcome back",
  printing: "Printing badge",
  badge: "Badge preview",
  "print-fail": "Printer problem",
  success: "Signed in",
  "wi-details": "Walk-in · Details",
  "otp-cooldown": "Code cooldown",
  "wi-purpose": "Walk-in · Purpose",
  "wi-host": "Walk-in · Host",
  "wi-consent": "Walk-in · Consent",
  "wi-consent-declined": "Walk-in · Consent declined",
  "wi-review": "Walk-in · Review",
  waiting: "Waiting for approval",
  approved: "Approved",
  declined: "Visit declined",
  noresponse: "No host response",
  "so-scan": "Sign out · Scan",
  "so-code": "Sign out · Pass code",
  "so-verifying": "Sign out · Verifying",
  "so-choose": "Sign out · Choose",
  "so-temp": "Sign out · Stepping out",
  "so-otp": "Sign out · Verify phone",
  "so-confirm": "Sign out · Confirm",
  "so-done": "Signed out",
  "so-already": "Already signed out",
  network: "Network unavailable",
  camera: "Camera problem",
  faq: "Frequently Asked Questions",
};

export type Flow = "signin" | "walkin" | "signout";

export type Session = {
  flow?: Flow;
  pass?: Pass;
  failReason?: FailReason;
  name: string;
  phone: string;
  company: string;
  purpose?: string;
  purposeDetails?: string;
  hostNote?: string;
  host?: Host | null;
  hostUnsure?: boolean;
  dept?: string;
  early?: boolean;
  badgeNo?: string;
  durationText?: string;
  returnTo?: Screen;
  code?: string;
  visitRequestId?: string;
  consentAccepted?: boolean;
  ndaAccepted?: boolean;
};

const emptySession = (): Session => ({ name: "", phone: "", company: "" });

type Visit = { status: VisitStatus; checkInAt?: number };
type HelpRequest = { code: string; screen: string; at: number };

type Ctx = {
  screen: Screen;
  go: (s: Screen) => void;
  session: Session;
  update: (p: { [K in keyof Session]?: Session[K] | undefined }) => void;
  endSession: (notice?: string) => void;
  visits: Record<string, Visit>;
  setVisit: (id: string, v: Visit) => void;
  helpRequests: HelpRequest[];
  addHelp: (screen: string) => void;
  notice: string | null;
  helpOpen: boolean;
  setHelpOpen: (b: boolean) => void;
  printerFail: boolean;
  setPrinterFail: (b: boolean) => void;
  waitingSignal: "approve" | "decline" | "timeout" | null;
  signalWaiting: (s: "approve" | "decline" | "timeout" | null) => void;
  soundEnabled: boolean;
  setSoundEnabled: (b: boolean) => void;
  playFeedbackSound: () => void;
};

const KioskCtx = createContext<Ctx | null>(null);

export function KioskProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [session, setSession] = useState<Session>(emptySession);
  const [visits, setVisits] = useState<Record<string, Visit>>({});
  const [helpRequests, setHelp] = useState<HelpRequest[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [printerFail, setPrinterFail] = useState(false);
  const [waitingSignal, signalWaiting] = useState<Ctx["waitingSignal"]>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const playFeedbackSound = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5 subtle chime
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {
      // ignore audio restriction
    }
  }, [soundEnabled]);

  const go = useCallback((s: Screen) => setScreen(s), []);
  const update = useCallback(
    (p: { [K in keyof Session]?: Session[K] | undefined }) =>
      setSession((s) => ({ ...s, ...p }) as Session),
    [],
  );
  const endSession = useCallback((msg?: string) => {
    setSession(emptySession());
    signalWaiting(null);
    setScreen("home");
    if (msg) {
      setNotice(msg);
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(null), 6000);
    }
  }, []);
  const setVisit = useCallback((id: string, v: Visit) => setVisits((m) => ({ ...m, [id]: v })), []);
  const addHelp = useCallback((s: string) => {
    setHelp((h) => [...h, { code: "4821", screen: s, at: Date.now() }]);
    console.info("[Northstar] Help request recorded from screen:", s);
  }, []);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  return (
    <KioskCtx.Provider
      value={{
        screen,
        go,
        session,
        update,
        endSession,
        visits,
        setVisit,
        helpRequests,
        addHelp,
        notice,
        helpOpen,
        setHelpOpen,
        printerFail,
        setPrinterFail,
        waitingSignal,
        signalWaiting,
        soundEnabled,
        setSoundEnabled,
        playFeedbackSound,
      }}
    >
      {children}
    </KioskCtx.Provider>
  );
}

export function useKiosk() {
  const c = useContext(KioskCtx);
  if (!c) throw new Error("useKiosk outside provider");
  return c;
}

/** Countdown that calls onDone once when it hits zero. Restarts when `key` changes. */
export function useCountdown(
  seconds: number,
  onDone?: () => void,
  key: unknown = 0,
  paused = false,
) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => setLeft(seconds), [seconds, key]);
  useEffect(() => {
    if (paused) return;
    if (left <= 0) {
      done.current?.();
      return;
    }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, paused]);
  return left;
}

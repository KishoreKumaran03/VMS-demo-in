import { useEffect, useState, type FormEvent } from "react";
import { MonitorSmartphone } from "lucide-react";
import { Btn } from "./components";
import { pairKiosk, pairedDevice, type PairedDevice } from "./api";

/** The kiosk's pairing state, read in the browser only (the first server render has no storage). */
export function usePairedDevice(): { ready: boolean; device: PairedDevice | null } {
  const [state, setState] = useState<{ ready: boolean; device: PairedDevice | null }>({ ready: false, device: null });
  useEffect(() => {
    const refresh = () => setState({ ready: true, device: pairedDevice() });
    refresh();
    window.addEventListener("kiosk-pairing-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("kiosk-pairing-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return state;
}

/** Shown until an administrator enters the one-time pairing code from the Dashboard or setup script. */
export function PairingScreen() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await pairKiosk(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center px-8">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-border bg-card p-10 shadow-soft">
        <MonitorSmartphone className="h-10 w-10 text-primary" aria-hidden />
        <h1 className="mt-4 text-[26px] font-bold">Pair this kiosk</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          An administrator registers the kiosk for a site and receives an 8-character pairing code. Enter it here once; the
          kiosk remembers its pairing.
        </p>
        <label className="mt-6 block text-[13px] font-semibold" htmlFor="pairing-code">
          Pairing code
        </label>
        <input
          id="pairing-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCD-2345"
          maxLength={20}
          className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-4 text-center font-mono text-[22px] tracking-[0.3em]"
        />
        {error && (
          <p role="alert" className="mt-3 text-[13px] font-medium text-destructive">
            {error}
          </p>
        )}
        <Btn type="submit" className="mt-6 w-full" disabled={busy || code.trim().length < 8}>
          {busy ? "Pairing…" : "Pair kiosk"}
        </Btn>
      </form>
    </div>
  );
}

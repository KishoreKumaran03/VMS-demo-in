import { DemoPanel, HelpPanel, IdleGuard, TopBar } from "./components";
import { CurrentScreen } from "./screens";
import { PointerProvider } from "./pointer";
import { KioskProvider, useKiosk } from "./store";
import { PairingScreen, usePairedDevice } from "./pairing";

function Shell() {
  const { screen, helpOpen, setHelpOpen } = useKiosk();
  const pairing = usePairedDevice();
  if (!pairing.ready) return <div className="h-screen bg-page" />;
  if (!pairing.device)
    return (
      <div className="relative flex h-screen min-h-[640px] flex-col overflow-hidden bg-page text-foreground">
        <PairingScreen />
      </div>
    );
  return (
    <div className="relative flex h-screen min-h-[640px] flex-col overflow-hidden bg-page text-foreground">
      <TopBar onHelp={() => setHelpOpen(true)} />
      <main key={screen} className="animate-screen relative z-10 min-h-0 flex-1">
        <CurrentScreen />
      </main>
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
      <IdleGuard />
      <DemoPanel />
    </div>
  );
}

export function Kiosk() {
  return (
    <KioskProvider>
      <PointerProvider>
        <Shell />
      </PointerProvider>
    </KioskProvider>
  );
}

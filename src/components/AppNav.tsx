import Link from "next/link";
import { PeacockFeatherMark } from "./PeacockFeatherMark";

export function AppNav() {
  return (
    <header className="app-nav" data-testid="app-nav">
      <Link className="brand" href="/">
        <span className="brand-mark">
          <PeacockFeatherMark />
        </span>
        <span className="brand-name">Dastarkhwan</span>
      </Link>
    </header>
  );
}

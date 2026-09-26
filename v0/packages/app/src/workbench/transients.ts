export type TransientKind = "ordinary" | "safety";

interface ActiveTransient {
  readonly id: string;
  readonly kind: TransientKind;
  readonly close: (restoreFocus: boolean) => void;
}

/** Coordinate one ordinary workbench plane while protecting safety decisions. */
export class TransientCoordinator {
  private active: ActiveTransient | null = null;

  isActive(id: string): boolean {
    return this.active?.id === id;
  }

  hasActive(): boolean {
    return this.active !== null;
  }

  open(id: string, kind: TransientKind, close: (restoreFocus: boolean) => void): boolean {
    if (this.active?.id === id) return true;
    if (this.active?.kind === "safety") return false;
    const displaced = this.active;
    this.active = null;
    displaced?.close(false);
    this.active = { id, kind, close };
    return true;
  }

  closed(id: string): void {
    if (this.active?.id === id) this.active = null;
  }

  dismiss(): boolean {
    const current = this.active;
    if (!current) return false;
    this.active = null;
    current.close(true);
    return true;
  }
}

export const PEN_ACTIVATION_WINDOW_MS = 750;

export interface ActivationEvidence {
  detail: number;
  kind: "click" | "dblclick";
  pointerId: number | null;
  pointerType: string;
  target: EventTarget | null;
  timestamp: number;
}

interface PendingActivation {
  expiresAt: number;
  target: EventTarget | null;
}

export class PenActivationGuard {
  private pendingClick: (PendingActivation & { pointerId: number }) | null = null;
  private pendingDoubleClick: PendingActivation | null = null;

  reset(): void {
    this.pendingClick = null;
    this.pendingDoubleClick = null;
  }

  recordPenRelease(pointerId: number, target: EventTarget | null, timestamp: number): void {
    this.pendingClick = {
      expiresAt: timestamp + PEN_ACTIVATION_WINDOW_MS,
      pointerId,
      target,
    };
  }

  recordNonPenPointerDown(): void {
    this.reset();
  }

  recordPenCancellation(): void {
    this.reset();
  }

  shouldSuppress(
    evidence: ActivationEvidence,
    targetsMatch: (origin: EventTarget | null, target: EventTarget | null) => boolean,
  ): boolean {
    const isDirectPenActivation = evidence.pointerType === "pen";
    if (evidence.kind === "dblclick") {
      const pending = this.pendingDoubleClick;
      const isCorrelatedDoubleClick =
        pending !== null && evidence.timestamp <= pending.expiresAt && targetsMatch(pending.target, evidence.target);
      if (!isDirectPenActivation && !isCorrelatedDoubleClick) return false;
      this.pendingDoubleClick = null;
      return true;
    }

    const pending = this.pendingClick;
    const isCorrelatedPenClick =
      pending !== null &&
      evidence.pointerType !== "touch" &&
      (evidence.pointerId === pending.pointerId || (evidence.pointerId === null && evidence.detail > 0)) &&
      evidence.timestamp <= pending.expiresAt &&
      targetsMatch(pending.target, evidence.target);
    if (!isDirectPenActivation && !isCorrelatedPenClick) {
      this.reset();
      return false;
    }

    this.pendingClick = null;
    this.pendingDoubleClick = {
      expiresAt: evidence.timestamp + PEN_ACTIVATION_WINDOW_MS,
      target: evidence.target ?? pending?.target ?? null,
    };
    return true;
  }
}

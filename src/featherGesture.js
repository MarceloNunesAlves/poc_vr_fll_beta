const AIM_HOLD_SECONDS = 0.16;
const GESTURE_SECONDS = 4;

export class FeatherGesture {
  constructor() {
    this.reset();
  }

  reset() {
    this.step = 'aim';
    this.aimTime = 0;
    this.gestureTime = 0;
    this.startHeight = 0;
    this.peakHeight = 0;
  }

  update(dt, aiming, height, liftDistance) {
    if (this.step === 'complete') return;

    if (this.step === 'aim') {
      this.aimTime = aiming ? this.aimTime + dt : 0;
      if (this.aimTime >= AIM_HOLD_SECONDS) {
        this.startHeight = height;
        this.peakHeight = height;
        this.step = 'raise';
      }
      return;
    }

    this.gestureTime += dt;
    if (this.gestureTime >= GESTURE_SECONDS) {
      this.reset();
      return;
    }

    this.peakHeight = Math.max(this.peakHeight, height);
    if (this.step === 'raise') {
      if (height - this.startHeight >= liftDistance) this.step = 'lower';
    } else if (aiming && this.peakHeight - height >= liftDistance * 0.8) {
      this.step = 'complete';
    }
  }
}

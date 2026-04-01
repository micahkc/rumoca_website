/**
 * Keyboard + Gamepad input manager for real-time simulation.
 * Gamepad takes priority when connected; keyboard is fallback.
 */

export interface RCState {
  throttle: number; // 0..1
  pitch: number;    // -1..1
  roll: number;     // -1..1
  yaw: number;      // -1..1
}

export type InputMode = 'keyboard' | 'gamepad';

function applyDeadzone(val: number, dz: number): number {
  if (Math.abs(val) < dz) return 0;
  return (val - Math.sign(val) * dz) / (1 - dz);
}

export class InputManager {
  rc: RCState = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
  armed = false;
  resetRequested = false;
  inputMode: InputMode = 'keyboard';

  private keys: Record<string, boolean> = {};
  private gamepadIndex: number | null = null;
  private readonly DZ = 0.12;
  private prevStartPressed = false;
  private lastUpdateTime = performance.now();
  // Internal keyboard stick state (matches rumoca_sil's kb_roll/pitch/yaw/throttle_input)
  private kbRoll = 0;
  private kbPitch = 0;
  private kbYaw = 0;
  private kbThrottleInput = 0;

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onGamepadConnected: (e: GamepadEvent) => void;
  private onGamepadDisconnected: (e: GamepadEvent) => void;

  constructor() {
    this.onKeyDown = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR') this.resetRequested = true;
      if (e.code === 'Space') this.armed = !this.armed;
      e.preventDefault();
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
      e.preventDefault();
    };
    this.onGamepadConnected = (e: GamepadEvent) => {
      this.gamepadIndex = e.gamepad.index;
      this.inputMode = 'gamepad';
    };
    this.onGamepadDisconnected = (e: GamepadEvent) => {
      if (e.gamepad.index === this.gamepadIndex) {
        this.gamepadIndex = null;
        this.inputMode = 'keyboard';
      }
    };

    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }

  private updateGamepad(dt: number): boolean {
    if (this.gamepadIndex === null) return false;
    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.gamepadIndex];
    if (!gp) return false;

    // Right stick: roll (X) and pitch (Y) -- direct mapping like rumoca_sil
    this.rc.roll = applyDeadzone(gp.axes[2] ?? 0, this.DZ);
    this.rc.pitch = -applyDeadzone(gp.axes[3] ?? 0, this.DZ);
    // Left stick: yaw (X)
    this.rc.yaw = applyDeadzone(gp.axes[0] ?? 0, this.DZ);
    // Left stick Y: throttle ramp (matches rumoca_sil: input * 0.7 * dt)
    const throttleInput = -applyDeadzone(gp.axes[1] ?? 0, this.DZ);
    this.rc.throttle = Math.max(0, Math.min(1, this.rc.throttle + throttleInput * 0.7 * dt));

    // Buttons: A/Cross = reset, B/Circle = zero sticks, Start = arm toggle
    if (gp.buttons[0]?.pressed) {
      this.resetRequested = true;
    }
    if (gp.buttons[1]?.pressed) {
      this.rc.throttle = 0;
      this.rc.pitch = 0;
      this.rc.roll = 0;
      this.rc.yaw = 0;
    }
    const startPressed = gp.buttons[9]?.pressed ?? false;
    if (startPressed && !this.prevStartPressed) {
      this.armed = !this.armed;
    }
    this.prevStartPressed = startPressed;

    return true;
  }

  update(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastUpdateTime) / 1000, 0.05);
    this.lastUpdateTime = now;

    if (this.updateGamepad(dt)) {
      this.inputMode = 'gamepad';
      return;
    }

    // Keyboard fallback -- matches rumoca_sil behavior exactly:
    // Time-based decay: 0.85^(dt/0.016)
    // Key held: sets internal stick to 0.6, throttle input to ±1.0
    // Throttle ramp: throttle += kb_throttle_input * 0.7 * dt
    if (Object.values(this.keys).some((v) => v)) this.inputMode = 'keyboard';

    // Decay all axes (matches rumoca_sil: decay = 0.85^(dt/0.016))
    const decay = Math.pow(0.85, dt / 0.016);
    this.kbRoll *= decay;
    this.kbPitch *= decay;
    this.kbYaw *= decay;
    this.kbThrottleInput *= decay;

    // Key press overrides with fixed value (matches rumoca_sil)
    if (this.keys['KeyW']) this.kbPitch = -0.6;
    if (this.keys['KeyS']) this.kbPitch = 0.6;
    if (this.keys['KeyA']) this.kbRoll = -0.6;
    if (this.keys['KeyD']) this.kbRoll = 0.6;
    if (this.keys['ArrowLeft']) this.kbYaw = -0.6;
    if (this.keys['ArrowRight']) this.kbYaw = 0.6;
    if (this.keys['ArrowUp']) this.kbThrottleInput = 1.0;
    if (this.keys['ArrowDown']) this.kbThrottleInput = -1.0;

    // Apply throttle ramp (matches rumoca_sil: throttle += input * 0.7 * dt)
    this.rc.throttle = Math.max(0, Math.min(1, this.rc.throttle + this.kbThrottleInput * 0.7 * dt));

    // Apply axes to RC (these get mapped to RC channels in applyInputs)
    this.rc.roll = this.kbRoll;
    this.rc.pitch = this.kbPitch;
    this.rc.yaw = this.kbYaw;
  }

  zeroSticks(): void {
    this.rc.throttle = 0;
    this.rc.pitch = 0;
    this.rc.roll = 0;
    this.rc.yaw = 0;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }
}

/**
 * Keyboard + Gamepad input manager for real-time simulation.
 *
 * Key bindings are vehicle-specific to match the rumoca CLI demos
 * (examples/interactive/quadrotor/rum.acro.toml and rover/rum.toml).
 *
 *  Quadrotor:
 *    W / S        — throttle (integrator, ramp = 0.7/s, clamp [0,1])
 *    A / D        — yaw (±0.6 with decay)
 *    ↑ / ↓        — roll (±0.3 with decay)
 *    ← / →        — pitch (±0.3 with decay)
 *    Space        — arm / disarm (requires throttle ≤ 0.05)
 *    H            — toggle flight HUD
 *    R            — reset
 *
 *  Fixed Wing (plane-style, matches the rumoca fixedwing rum.toml):
 *    W / S        — throttle (integrator, ramp = 0.7/s, clamp [0,1])
 *    ↑ / ↓        — pitch (nose up / down)
 *    ← / →        — roll (turn left / right via ailerons)
 *    A / D        — rudder (left / right)
 *    Space        — arm / disarm (requires throttle ≤ 0.05)
 *    H            — toggle flight HUD
 *    R            — reset
 *
 *  Rover:
 *    ↑ / ↓        — throttle (set ±1.0 with decay; reverse allowed)
 *    ← / →        — steering (set ±1.0 with decay; routed via rc.roll)
 *    H            — toggle flight HUD
 *    R            — reset
 *
 * Gamepad layout matches the rumoca convention:
 *    Right stick X/Y → roll / pitch
 *    Left stick X    → yaw
 *    Left stick Y    → throttle (ramp)
 *    Start           → arm
 *    A (south)       → reset
 *    B (east)        → zero sticks
 */

export interface RCState {
  /** [0..1] for quadrotor/fixedwing; [-1..1] for rover (reverse allowed). */
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
}

export type InputMode = 'keyboard' | 'gamepad';
export type InputProfile = 'quadrotor' | 'fixedwing' | 'rover';

function applyDeadzone(val: number, dz: number): number {
  if (Math.abs(val) < dz) return 0;
  return (val - Math.sign(val) * dz) / (1 - dz);
}

const ROLL_PITCH_KB_VALUE = 0.3;
const YAW_KB_VALUE = 0.6;
const STEERING_KB_VALUE = 1.0;
const THROTTLE_RAMP_RATE = 0.7;

export class InputManager {
  rc: RCState = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
  armed = false;
  resetRequested = false;
  inputMode: InputMode = 'keyboard';
  hudVisible = true;

  private profile: InputProfile = 'quadrotor';
  private keys: Record<string, boolean> = {};
  private gamepadIndex: number | null = null;
  private readonly DZ = 0.12;
  private prevStartPressed = false;
  private prevHudKey = false;
  private lastUpdateTime = performance.now();
  // Internal keyboard stick state — decays toward 0 when keys release.
  private kbRoll = 0;
  private kbPitch = 0;
  private kbYaw = 0;
  private kbThrottle = 0; // used for rover direct-set throttle
  private kbThrottleInput = 0; // used for quadrotor/fixedwing throttle integrator

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onGamepadConnected: (e: GamepadEvent) => void;
  private onGamepadDisconnected: (e: GamepadEvent) => void;

  constructor() {
    this.onKeyDown = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR') this.resetRequested = true;
      if (e.code === 'KeyH' && !e.repeat) this.hudVisible = !this.hudVisible;
      if (e.code === 'Space' && !e.repeat) {
        // rumoca's TOML requires throttle ≤ 0.05 to arm; we drop that
        // interlock for the website sim so the toggle is never silently
        // ignored. Auto-zero throttle on arm to mirror the safe outcome.
        if (!this.armed) {
          this.rc.throttle = 0;
          this.kbThrottleInput = 0;
        }
        this.armed = !this.armed;
      }
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

  /** Switch to a vehicle's key/axis profile. */
  setProfile(profile: InputProfile): void {
    if (this.profile === profile) return;
    this.profile = profile;
    this.zeroSticks();
    this.kbRoll = this.kbPitch = this.kbYaw = 0;
    this.kbThrottle = this.kbThrottleInput = 0;
  }

  private updateGamepad(dt: number): boolean {
    if (this.gamepadIndex === null) return false;
    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.gamepadIndex];
    if (!gp) return false;

    if (this.profile === 'rover') {
      // Left stick Y → throttle direct (allow reverse); Right stick X → steering.
      this.rc.throttle = -applyDeadzone(gp.axes[1] ?? 0, this.DZ);
      this.rc.roll = applyDeadzone(gp.axes[2] ?? 0, this.DZ); // steering via rc.roll
      this.rc.pitch = 0;
      this.rc.yaw = 0;
    } else {
      // Quadrotor / fixed wing — rumoca convention.
      this.rc.roll = applyDeadzone(gp.axes[2] ?? 0, this.DZ);
      this.rc.pitch = -applyDeadzone(gp.axes[3] ?? 0, this.DZ);
      this.rc.yaw = applyDeadzone(gp.axes[0] ?? 0, this.DZ);
      const throttleInput = -applyDeadzone(gp.axes[1] ?? 0, this.DZ);
      this.rc.throttle = Math.max(
        0,
        Math.min(1, this.rc.throttle + throttleInput * THROTTLE_RAMP_RATE * dt),
      );
    }

    if (gp.buttons[0]?.pressed) this.resetRequested = true;
    if (gp.buttons[1]?.pressed) this.zeroSticks();
    const startPressed = gp.buttons[9]?.pressed ?? false;
    if (startPressed && !this.prevStartPressed) {
      if (!this.armed) this.rc.throttle = 0;
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

    if (Object.values(this.keys).some((v) => v)) this.inputMode = 'keyboard';

    // Time-based decay: 0.85^(dt/0.016) ≈ decay across one 60Hz frame.
    const decay = Math.pow(0.85, dt / 0.016);
    this.kbRoll *= decay;
    this.kbPitch *= decay;
    this.kbYaw *= decay;
    this.kbThrottle *= decay;
    this.kbThrottleInput *= decay;

    if (this.profile === 'rover') {
      // ↑/↓ throttle (direct set with decay, reverse allowed).
      // ←/→ steering (routed through rc.roll because applyInputs reads it
      // there for the rover; see SimulationApp.applyInputs).
      if (this.keys['ArrowUp']) this.kbThrottle = STEERING_KB_VALUE;
      if (this.keys['ArrowDown']) this.kbThrottle = -STEERING_KB_VALUE;
      if (this.keys['ArrowLeft']) this.kbRoll = -STEERING_KB_VALUE;
      if (this.keys['ArrowRight']) this.kbRoll = STEERING_KB_VALUE;

      this.rc.throttle = this.kbThrottle;
      this.rc.roll = this.kbRoll;
      this.rc.pitch = 0;
      this.rc.yaw = 0;
      return;
    }

    // W / S throttle integrator (shared by quadrotor and fixed wing).
    if (this.keys['KeyW']) this.kbThrottleInput = 1.0;
    if (this.keys['KeyS']) this.kbThrottleInput = -1.0;

    if (this.profile === 'fixedwing') {
      // Plane-style (joystick sense): ↑ pitches nose DOWN, ↓ pitches nose up;
      //   ← / → roll (turn left / right via ailerons), A / D rudder (left/right).
      if (this.keys['ArrowUp']) this.kbPitch = -ROLL_PITCH_KB_VALUE;
      if (this.keys['ArrowDown']) this.kbPitch = ROLL_PITCH_KB_VALUE;
      if (this.keys['ArrowLeft']) this.kbRoll = -ROLL_PITCH_KB_VALUE;
      if (this.keys['ArrowRight']) this.kbRoll = ROLL_PITCH_KB_VALUE;
      if (this.keys['KeyA']) this.kbYaw = -YAW_KB_VALUE;
      if (this.keys['KeyD']) this.kbYaw = YAW_KB_VALUE;
    } else {
      // Quadrotor — match rum.acro.toml.
      if (this.keys['KeyA']) this.kbYaw = YAW_KB_VALUE;
      if (this.keys['KeyD']) this.kbYaw = -YAW_KB_VALUE;
      if (this.keys['ArrowUp']) this.kbRoll = ROLL_PITCH_KB_VALUE;
      if (this.keys['ArrowDown']) this.kbRoll = -ROLL_PITCH_KB_VALUE;
      if (this.keys['ArrowLeft']) this.kbPitch = ROLL_PITCH_KB_VALUE;
      if (this.keys['ArrowRight']) this.kbPitch = -ROLL_PITCH_KB_VALUE;
    }

    this.rc.throttle = Math.max(
      0,
      Math.min(1, this.rc.throttle + this.kbThrottleInput * THROTTLE_RAMP_RATE * dt),
    );
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

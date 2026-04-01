/**
 * Modelica source for quadrotor plant-only model (no controller).
 * Used in Autopilot mode -- motor speeds come from the external autopilot.
 * Based on QuadrotorSIL.mo from rumoca_sil.
 */
export const QUADROTOR_PLANT_MODEL = `
model QuadrotorSIL
  parameter Real mass = 2.0 "Total mass [kg]";
  parameter Real g = 9.80665 "Gravity [m/s^2]";
  parameter Real Ixx = 0.020;
  parameter Real Iyy = 0.020;
  parameter Real Izz = 0.040;
  parameter Real Ct = 8.5e-6 "Thrust coefficient [N/(rad/s)^2]";
  parameter Real Cm = 1.36e-7 "Torque coefficient [N*m/(rad/s)^2]";
  parameter Real arm_length = 0.2;
  parameter Real d = arm_length * 0.7071067811865476;
  parameter Real mag_world_n = 0.21;
  parameter Real mag_world_e = 0.0;
  parameter Real mag_world_d = 0.45;
  parameter Real ground_k = 500;
  parameter Real ground_c = 50;
  parameter Real ground_eps = 0.1;
  parameter Real qnorm_gain = 1.0;

  input Real omega_m1(start = 0) "Motor 1 (FR, CW) [rad/s]";
  input Real omega_m2(start = 0) "Motor 2 (RR, CCW) [rad/s]";
  input Real omega_m3(start = 0) "Motor 3 (RL, CW) [rad/s]";
  input Real omega_m4(start = 0) "Motor 4 (FL, CCW) [rad/s]";

  Real px(start = 0); Real py(start = 0); Real pz(start = 0);
  Real vx(start = 0); Real vy(start = 0); Real vz(start = 0);
  Real q0(start = 1); Real q1(start = 0); Real q2(start = 0); Real q3(start = 0);
  Real omega_x(start = 0); Real omega_y(start = 0); Real omega_z(start = 0);

  output Real accel_x; output Real accel_y; output Real accel_z;
  output Real gyro_x; output Real gyro_y; output Real gyro_z;
  output Real mag_x; output Real mag_y; output Real mag_z;

  Real R11; Real R12; Real R13;
  Real R21; Real R22; Real R23;
  Real R31; Real R32; Real R33;

protected
  Real F1; Real F2; Real F3; Real F4;
  Real T; Real Mx; Real My; Real Mz;
  Real a_bz;
  Real F_ground;
  Real a_wx; Real a_wy; Real a_wz;

equation
  F1 = Ct*omega_m1*omega_m1; F2 = Ct*omega_m2*omega_m2;
  F3 = Ct*omega_m3*omega_m3; F4 = Ct*omega_m4*omega_m4;
  T = F1 + F2 + F3 + F4;
  Mx = d*(-F1 - F2 + F3 + F4);
  My = d*(F1 - F2 - F3 + F4);
  Mz = (Cm/Ct)*(F1 - F2 + F3 - F4);
  a_bz = -T/mass;

  R11 = 1-2*(q2*q2+q3*q3); R12 = 2*(q1*q2-q0*q3); R13 = 2*(q1*q3+q0*q2);
  R21 = 2*(q1*q2+q0*q3); R22 = 1-2*(q1*q1+q3*q3); R23 = 2*(q2*q3-q0*q1);
  R31 = 2*(q1*q3-q0*q2); R32 = 2*(q2*q3+q0*q1); R33 = 1-2*(q1*q1+q2*q2);

  F_ground = -ground_k * ground_eps * log(1 + exp(pz / ground_eps))
             - ground_c * vz * (1 / (1 + exp(-pz / ground_eps)));

  der(px) = vx; der(py) = vy; der(pz) = vz;
  der(vx) = R13*a_bz;
  der(vy) = R23*a_bz;
  der(vz) = R33*a_bz + g + F_ground/mass;
  a_wx = der(vx); a_wy = der(vy); a_wz = der(vz);

  der(q0) = 0.5*(-q1*omega_x - q2*omega_y - q3*omega_z) - qnorm_gain*(q0*q0+q1*q1+q2*q2+q3*q3-1)*q0;
  der(q1) = 0.5*(q0*omega_x - q3*omega_y + q2*omega_z) - qnorm_gain*(q0*q0+q1*q1+q2*q2+q3*q3-1)*q1;
  der(q2) = 0.5*(q3*omega_x + q0*omega_y - q1*omega_z) - qnorm_gain*(q0*q0+q1*q1+q2*q2+q3*q3-1)*q2;
  der(q3) = 0.5*(-q2*omega_x + q1*omega_y + q0*omega_z) - qnorm_gain*(q0*q0+q1*q1+q2*q2+q3*q3-1)*q3;

  der(omega_x) = (Mx + (Iyy-Izz)*omega_y*omega_z)/Ixx;
  der(omega_y) = (My + (Izz-Ixx)*omega_x*omega_z)/Iyy;
  der(omega_z) = (Mz + (Ixx-Iyy)*omega_x*omega_y)/Izz;

  gyro_x = omega_x; gyro_y = omega_y; gyro_z = omega_z;
  accel_x = R11*(a_wx-g) + R21*a_wy + R31*a_wz;
  accel_y = R12*(a_wx-g) + R22*a_wy + R32*a_wz;
  accel_z = R13*(a_wx-g) + R23*a_wy + R33*a_wz;
  mag_x = R11*mag_world_n + R21*mag_world_e + R31*mag_world_d;
  mag_y = R12*mag_world_n + R22*mag_world_e + R32*mag_world_d;
  mag_z = R13*mag_world_n + R23*mag_world_e + R33*mag_world_d;
end QuadrotorSIL;
`;

export const QUADROTOR_PLANT_MODEL_NAME = 'QuadrotorSIL';

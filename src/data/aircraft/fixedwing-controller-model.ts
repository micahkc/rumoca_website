/**
 * Modelica source for fixed-wing aircraft (SportCub) with direct pilot control.
 * In WASM Controller mode, the user directly commands throttle/aileron/elevator/rudder.
 * Based on SportCubQuat.mo from /home/micah/Research/modelica_models/cub3/.
 * Uses ENU frame (East-North-Up).
 */
export const FIXEDWING_CONTROLLER_MODEL = `
model SportCubQuat "6-DOF fixed-wing aircraft dynamics (ENU/FLU, quaternion attitude)"
  parameter Real m = 0.065 "mass (kg)";
  parameter Real g_acc = 9.81 "gravity (m/s^2)";
  parameter Real S = 0.055 "wing area (m^2)";
  parameter Real rho = 1.225 "air density (kg/m^3)";
  parameter Real thr_max = 0.30 "maximum thrust (N)";
  parameter Real Jx = 8.0e-4 "roll inertia (kg*m^2)";
  parameter Real Jy = 1.2e-3 "pitch inertia (kg*m^2)";
  parameter Real Jz = 1.8e-3 "yaw inertia (kg*m^2)";
  parameter Real Jxz = 1.0e-4 "product of inertia (kg*m^2)";
  parameter Real cbar = 0.09 "mean chord (m)";
  parameter Real span = 0.617 "wingspan (m)";
  parameter Real wing_incidence = 0.10472 "wing incidence angle (rad)";
  parameter Real Cm0 = 0.0;
  parameter Real Cma = -0.8;
  parameter Real Cmq = -12.0;
  parameter Real CL0 = 0.5;
  parameter Real CLa = 4.7;
  parameter Real CD0 = 0.06;
  parameter Real k_ind = 0.09;
  parameter Real CD0_fp = 0.30;
  parameter Real CY_fp = 0.50;
  parameter Real Clda = 0.05;
  parameter Real Cldr = 0.006;
  parameter Real Cmde = 0.3;
  parameter Real Cndr = 0.015;
  parameter Real Cnda = 0.006;
  parameter Real CYda = 0.004;
  parameter Real CYdr = -0.015;
  parameter Real Cnb = 0.06;
  parameter Real CYb = -0.50;
  parameter Real CYr = 0.20;
  parameter Real CYp = -0.15;
  parameter Real Clb = -0.25;
  parameter Real Clp = -0.50;
  parameter Real Clr = 0.15;
  parameter Real Cnr = -0.15;
  parameter Real Cnp = 0.010;
  parameter Real blend_width = 0.08727;
  parameter Real alpha_stall = 0.34907;
  parameter Real max_defl_ail = 0.52360;
  parameter Real max_defl_elev = 0.41888;
  parameter Real max_defl_rud = 0.34907;

  input Real ail "aileron (-1 to 1)";
  input Real elev "elevator (-1 to 1)";
  input Real rud "rudder (-1 to 1)";
  input Real thr "throttle (0 to 1)";

  Real px(start = 0.0) "position east (m)";
  Real py(start = 0.0) "position north (m)";
  Real pz(start = 50.0) "position up (m)";
  Real vx(start = 5.0) "velocity east (m/s)";
  Real vy(start = 0.0) "velocity north (m/s)";
  Real vz(start = 0.0) "velocity up (m/s)";
  Real q0(start = 1.0);
  Real q1(start = 0.0);
  Real q2(start = 0.0);
  Real q3(start = 0.0);
  Real wx(start = 0.0) "roll rate (rad/s)";
  Real wy(start = 0.0) "pitch rate (rad/s)";
  Real wz(start = 0.0) "yaw rate (rad/s)";

  Real R11, R12, R13, R21, R22, R23, R31, R32, R33;
  Real vb_x, vb_y, vb_z;
  Real U_frd, V_frd, W_frd;
  Real Vt, alpha_body, alpha, beta, qbar, sigma;
  Real P_frd, Q_frd, R_frd;
  Real ail_rad, elev_rad, rud_rad;
  Real CL_lin, CL_fp_val, CL_total;
  Real CD_lin, CD_fp_val, CD_total;
  Real CY_lin, CY_fp_val, CY_total;
  Real Cl_aero, Cm_aero, Cn_aero;
  Real T11, T12, T13, T21, T22, T23, T31, T32, T33;
  Real FA_bx, FA_by, FA_bz, MA_bx, MA_by, MA_bz;
  Real FT_bx, FW_bx, FW_by, FW_bz;
  Real Fb_x, Fb_y, Fb_z, Mb_x, Mb_y, Mb_z;
  Real Fe_x, Fe_y, Fe_z;
  Real hx, hy, hz, cross_x, cross_y, cross_z;
  Real torque_x, torque_y, torque_z, detJ;
  parameter Real eps = 1e-6;

equation
  R11 = 1 - 2*(q2^2 + q3^2); R12 = 2*(q1*q2 - q0*q3); R13 = 2*(q1*q3 + q0*q2);
  R21 = 2*(q1*q2 + q0*q3); R22 = 1 - 2*(q1^2 + q3^2); R23 = 2*(q2*q3 - q0*q1);
  R31 = 2*(q1*q3 - q0*q2); R32 = 2*(q2*q3 + q0*q1); R33 = 1 - 2*(q1^2 + q2^2);
  vb_x = R11*vx + R21*vy + R31*vz;
  vb_y = R12*vx + R22*vy + R32*vz;
  vb_z = R13*vx + R23*vy + R33*vz;
  U_frd = vb_x; V_frd = -vb_y; W_frd = -vb_z;
  Vt = sqrt(U_frd^2 + V_frd^2 + W_frd^2) + eps;
  alpha_body = atan2(W_frd, U_frd);
  alpha = alpha_body + wing_incidence;
  beta = atan2(V_frd, sqrt(U_frd^2 + W_frd^2) + eps);
  qbar = 0.5*rho*Vt^2;
  sigma = (1 + tanh((alpha - alpha_stall)/blend_width))/2;
  P_frd = wx; Q_frd = -wy; R_frd = -wz;
  ail_rad = min(max_defl_ail, max(-max_defl_ail, max_defl_ail*ail));
  elev_rad = min(max_defl_elev, max(-max_defl_elev, max_defl_elev*elev));
  rud_rad = min(max_defl_rud, max(-max_defl_rud, -max_defl_rud*rud));
  CL_lin = CL0 + CLa*alpha;
  CL_fp_val = 2*sin(alpha)*cos(alpha);
  CL_total = (1 - sigma)*CL_lin + sigma*CL_fp_val;
  CD_lin = CD0 + k_ind*CL_lin^2;
  CD_fp_val = CD0_fp + 2*sin(alpha)^2;
  CD_total = (1 - sigma)*CD_lin + sigma*CD_fp_val;
  CY_lin = CYb*beta + CYda*ail_rad + CYdr*rud_rad + CYp*(span/(2*Vt))*P_frd + CYr*(span/(2*Vt))*R_frd;
  CY_fp_val = CY_fp*sin(beta)*cos(alpha);
  CY_total = (1 - sigma)*CY_lin + sigma*CY_fp_val;
  Cl_aero = Clda*ail_rad + Cldr*rud_rad + Clb*beta + Clp*(span/(2*Vt))*P_frd + Clr*(span/(2*Vt))*R_frd;
  Cm_aero = Cm0 + Cma*alpha + Cmde*elev_rad + Cmq*(cbar/(2*Vt))*Q_frd;
  Cn_aero = Cnb*beta + Cndr*rud_rad + Cnda*ail_rad + Cnp*(span/(2*Vt))*P_frd + Cnr*(span/(2*Vt))*R_frd;
  T11 = cos(alpha_body)*cos(beta); T12 = -sin(beta); T13 = sin(alpha_body)*cos(beta);
  T21 = cos(alpha_body)*sin(beta); T22 = cos(beta); T23 = sin(alpha_body)*sin(beta);
  T31 = -sin(alpha_body); T32 = 0; T33 = cos(alpha_body);
  FA_bx = T11*(-CD_total*qbar*S) + T12*(CY_total*qbar*S) + T13*(-CL_total*qbar*S);
  FA_by = -(T21*(-CD_total*qbar*S) + T22*(CY_total*qbar*S) + T23*(-CL_total*qbar*S));
  FA_bz = -(T31*(-CD_total*qbar*S) + T32*(CY_total*qbar*S) + T33*(-CL_total*qbar*S));
  MA_bx = qbar*S*span*Cl_aero;
  MA_by = -(qbar*S*cbar*Cm_aero);
  MA_bz = -(qbar*S*span*Cn_aero);
  FT_bx = thr_max*min(1, max(0, thr));
  FW_bx = R31*(-m*g_acc);
  FW_by = R32*(-m*g_acc);
  FW_bz = R33*(-m*g_acc);
  Fb_x = FA_bx + FT_bx + FW_bx;
  Fb_y = FA_by + FW_by;
  Fb_z = FA_bz + FW_bz;
  Mb_x = MA_bx; Mb_y = MA_by; Mb_z = MA_bz;
  Fe_x = R11*Fb_x + R12*Fb_y + R13*Fb_z;
  Fe_y = R21*Fb_x + R22*Fb_y + R23*Fb_z;
  Fe_z = R31*Fb_x + R32*Fb_y + R33*Fb_z;
  der(px) = vx; der(py) = vy; der(pz) = vz;
  der(vx) = Fe_x/m; der(vy) = Fe_y/m; der(vz) = Fe_z/m;
  der(q0) = 0.5*(-q1*wx - q2*wy - q3*wz);
  der(q1) = 0.5*(q0*wx - q3*wy + q2*wz);
  der(q2) = 0.5*(q3*wx + q0*wy - q1*wz);
  der(q3) = 0.5*(-q2*wx + q1*wy + q0*wz);
  hx = Jx*wx + Jxz*wz; hy = Jy*wy; hz = Jxz*wx + Jz*wz;
  cross_x = wy*hz - wz*hy; cross_y = wz*hx - wx*hz; cross_z = wx*hy - wy*hx;
  torque_x = Mb_x - cross_x; torque_y = Mb_y - cross_y; torque_z = Mb_z - cross_z;
  detJ = Jx*Jz - Jxz^2;
  der(wx) = (Jz*torque_x - Jxz*torque_z)/detJ;
  der(wy) = torque_y/Jy;
  der(wz) = (-Jxz*torque_x + Jx*torque_z)/detJ;
end SportCubQuat;
`;

export const FIXEDWING_MODEL_NAME = 'SportCubQuat';

// Trim values for level flight at 5 m/s
export const TRIM_ELEV = 0.342;
export const TRIM_THR = 0.095;

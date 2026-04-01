export interface Example {
  name: string;
  modelName: string;
  source: string;
}

export const examples: Example[] = [
  {
    name: 'Mass-Spring-Damper',
    modelName: 'MassSpringDamper',
    source: `model MassSpringDamper
  Real x(start = 1);
  Real v(start = 0);
  parameter Real k = 1, c = 0.1, m = 1;
equation
  der(x) = v;
  m * der(v) = -k * x - c * v;
end MassSpringDamper;`,
  },
  {
    name: 'Bouncing Ball',
    modelName: 'BouncingBall',
    source: `model BouncingBall
  Real h(start = 1) "height";
  Real v(start = 0) "velocity";
  parameter Real g = 9.81 "gravity";
  parameter Real e = 0.7 "coefficient of restitution";
equation
  der(h) = v;
  der(v) = -g;
  when h < 0 then
    reinit(v, -e * pre(v));
  end when;
end BouncingBall;`,
  },
  {
    name: 'Quadrotor',
    modelName: 'Quadrotor',
    source: `model Quadrotor
  "Simplified 6-DOF quadrotor dynamics"
  Real x, y, z "position";
  Real vx, vy, vz "velocity";
  Real phi, theta, psi "Euler angles";
  Real p, q, r "body rates";
  parameter Real m = 1.5 "mass [kg]";
  parameter Real g = 9.81 "gravity [m/s2]";
  parameter Real Ix = 0.029, Iy = 0.029, Iz = 0.055;
  input Real T "total thrust";
  input Real tau_phi, tau_theta, tau_psi "torques";
equation
  der(x) = vx;
  der(y) = vy;
  der(z) = vz;
  m * der(vx) = T * (cos(psi)*sin(theta)*cos(phi) + sin(psi)*sin(phi));
  m * der(vy) = T * (sin(psi)*sin(theta)*cos(phi) - cos(psi)*sin(phi));
  m * der(vz) = T * cos(theta)*cos(phi) - m*g;
  der(phi) = p;
  der(theta) = q;
  der(psi) = r;
  Ix * der(p) = tau_phi - (Iz - Iy)*q*r;
  Iy * der(q) = tau_theta - (Ix - Iz)*p*r;
  Iz * der(r) = tau_psi - (Iy - Ix)*p*q;
end Quadrotor;`,
  },
  {
    name: 'DC Motor with PID',
    modelName: 'DCMotorPID',
    source: `model DCMotorPID
  "DC motor with PID speed controller"
  Real omega(start = 0) "angular velocity";
  Real i(start = 0) "armature current";
  Real e_int(start = 0) "integral of error";
  parameter Real R = 1.0 "resistance";
  parameter Real L = 0.01 "inductance";
  parameter Real Kt = 0.01 "torque constant";
  parameter Real Ke = 0.01 "back-EMF constant";
  parameter Real J = 0.01 "inertia";
  parameter Real b = 0.1 "friction";
  parameter Real omega_ref = 100 "reference speed";
  parameter Real Kp = 10, Ki = 50, Kd = 0.1;
  Real error, V;
equation
  error = omega_ref - omega;
  der(e_int) = error;
  V = Kp * error + Ki * e_int + Kd * der(error);
  L * der(i) = V - R * i - Ke * omega;
  J * der(omega) = Kt * i - b * omega;
end DCMotorPID;`,
  },
  {
    name: 'Pendulum',
    modelName: 'Pendulum',
    source: `model Pendulum
  Real theta(start = 0.5) "angle";
  Real omega(start = 0) "angular velocity";
  parameter Real L = 1.0 "length";
  parameter Real g = 9.81 "gravity";
  parameter Real b = 0.1 "damping";
equation
  der(theta) = omega;
  L * der(omega) = -g * sin(theta) - b * omega;
end Pendulum;`,
  },
  {
    name: 'Van der Pol Oscillator',
    modelName: 'VanDerPol',
    source: `model VanDerPol
  Real x(start = 2);
  Real y(start = 0);
  parameter Real mu = 1.0;
equation
  der(x) = y;
  der(y) = mu * (1 - x^2) * y - x;
end VanDerPol;`,
  },
];

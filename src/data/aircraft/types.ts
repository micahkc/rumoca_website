import type * as THREE from 'three';
import type { SimulationSource } from '../../lib/simulation-source';

export interface AircraftRenderer {
  group: THREE.Group;
  update(source: SimulationSource, dt: number): void;
  reset(): void;
  dispose(): void;
}

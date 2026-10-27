import { PerspectiveCamera, Vector3 } from 'three';
import { settlement } from './field';

export class Rig {
  readonly camera: PerspectiveCamera;
  readonly target = new Vector3();
  azimuth = -2.25;
  polar = 0.96;
  distance = 82;

  constructor() {
    this.camera = new PerspectiveCamera(40, 1, 0.45, 1400);
  }

  apply(): void {
    const height = Math.cos(this.polar) * this.distance;
    const span = Math.sin(this.polar) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * span,
      this.target.y + height,
      this.target.z + Math.cos(this.azimuth) * span,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  frameFar(): void {
    const home = settlement();
    this.target.set(home.x - 12, 4.2, home.z + 2);
    this.azimuth = -2.25;
    this.polar = 0.96;
    this.distance = 84;
    this.apply();
  }

  frameNear(): void {
    const home = settlement();
    this.target.set(home.x - 1.2, home.y + 1.1, home.z + 1.5);
    this.azimuth = -2.0;
    this.polar = 1.02;
    this.distance = 24;
    this.apply();
  }

  bind(canvas: HTMLCanvasElement): void {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    canvas.addEventListener('pointerdown', (event) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointerup', () => {
      dragging = false;
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      this.azimuth -= dx * 0.005;
      this.polar = Math.max(0.38, Math.min(1.28, this.polar + dy * 0.003));
      this.apply();
    });
    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.distance = Math.max(8, Math.min(130, this.distance * (1 + event.deltaY * 0.001)));
        this.apply();
      },
      { passive: false },
    );
    window.addEventListener('keydown', (event) => {
      if (event.key === '1') this.frameFar();
      if (event.key === '2') this.frameNear();
    });
  }
}

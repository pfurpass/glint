export class Camera2D {
  readonly projection = new Float32Array(16);
  constructor(public width = 1, public height = 1) {
    this.update();
  }
  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.update();
  }
  private update(): void {
    // orthographic: pixels, origin top-left, Y down
    const m = this.projection;
    const l = 0,
      r = this.width,
      t = 0,
      b = this.height;
    m.fill(0);
    m[0] = 2 / (r - l);
    m[5] = 2 / (t - b);
    m[10] = -1;
    m[12] = -(r + l) / (r - l);
    m[13] = -(t + b) / (t - b);
    m[15] = 1;
  }
}
